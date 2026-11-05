"""FastAPI scoring service. Interactive docs at /docs (OpenAPI at /openapi.json)."""

import csv
import io
import json
import secrets
from contextlib import asynccontextmanager

import pandas as pd
from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from pydantic import ValidationError
from sqlalchemy import func, select

from api import ai, policy, scoring
from api.config import Settings, settings as default_settings
from api.db import Application, AuditEvent, Decision, ModelVersion, User, make_engine, make_sessionmaker, now
from api.schemas import (
    ApplicationIn, AuditOut, BatchOut, DecisionOut, DecisionRow, LoginIn, ModelDetail, ModelOut,
    SummaryIn, SummaryOut, UserOut,
)
from api.security import Tokens, hash_password, verify_password
from ml.features import INPUT_COLUMNS, MONTHS

COOKIE = "scorer_session"
DEMO_EMAIL = "demo@repayment-risk-scorer.app"
MAX_BATCH_ROWS = 5000
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


def create_app(cfg: Settings = default_settings, ai_client=None):
    engine = make_engine(cfg.database_url)
    Session = make_sessionmaker(engine)
    tokens = Tokens(cfg.secret_key, cfg.session_hours * 3600)

    @asynccontextmanager
    async def lifespan(app):
        with Session() as db:
            seed_users(db, cfg)
            seed_demo(db, cfg)
            sync_registry(db, cfg)
        yield
        engine.dispose()

    app = FastAPI(title="Repayment Risk Scorer API", version="1.0.0", lifespan=lifespan,
                  description="Scores borrowers from six months of repayment history, explains each score, "
                              "and keeps an audit trail of decisions and model versions.")

    def get_db():
        with Session() as db:
            yield db

    def current_user(request: Request, db=Depends(get_db)):
        token = request.cookies.get(COOKIE)
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:]
        uid = tokens.read(token) if token else None
        user = db.get(User, uid) if uid else None
        if not user:
            raise HTTPException(401, "Please sign in.")
        return user

    def is_demo(user):
        return user.email == DEMO_EMAIL

    def own_only(q, user):
        """The demo sees only applications it scored itself; everyone else sees the whole portfolio."""
        return q.where(Application.created_by == user.id) if is_demo(user) else q

    def visible_decision(db, user, decision_id):
        d = db.get(Decision, decision_id)
        if not d or (is_demo(user) and d.application.created_by != user.id):
            raise HTTPException(404, "Decision not found.")
        return d

    def admin_user(user=Depends(current_user)):
        if user.role != "admin":
            raise HTTPException(403, "Only an admin can do this.")
        return user

    def active_model(db):
        mv = db.scalar(select(ModelVersion).where(ModelVersion.is_active))
        if not mv:
            raise HTTPException(503, "No model is active. Train one with `python -m ml.train` and restart the API.")
        return scoring.load_version(str(cfg.models_dir / mv.version))

    def audit(db, user, action, version=None, **details):
        db.add(AuditEvent(user_email=user.email, action=action, model_version=version, details=details))

    # ---------- auth ----------

    @app.post("/api/auth/login", response_model=UserOut, tags=["auth"])
    def login(body: LoginIn, response: Response, db=Depends(get_db)):
        user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
        if not user or not verify_password(body.password, user.password_hash):
            raise HTTPException(401, "Wrong email or password.")
        response.set_cookie(COOKIE, tokens.issue(user.id), httponly=True, samesite="lax",
                            secure=cfg.cookie_secure, max_age=cfg.session_hours * 3600, path="/")
        audit(db, user, "sign_in")
        db.commit()
        return UserOut(email=user.email, role=user.role)

    @app.get("/api/auth/demo", tags=["auth"])
    def demo_status():
        return {"enabled": cfg.demo_account}

    @app.post("/api/auth/demo", response_model=UserOut, tags=["auth"])
    def demo_login(response: Response, db=Depends(get_db)):
        user = db.scalar(select(User).where(User.email == DEMO_EMAIL)) if cfg.demo_account else None
        if not user:
            raise HTTPException(404, "There is no demo account.")
        response.set_cookie(COOKIE, tokens.issue(user.id), httponly=True, samesite="lax",
                            secure=cfg.cookie_secure, max_age=cfg.session_hours * 3600, path="/")
        return UserOut(email=user.email, role=user.role)

    @app.post("/api/auth/logout", status_code=204, tags=["auth"])
    def logout(response: Response):
        response.delete_cookie(COOKIE, path="/")

    @app.get("/api/auth/me", response_model=UserOut, tags=["auth"])
    def me(user=Depends(current_user)):
        return UserOut(email=user.email, role=user.role)

    # ---------- meta ----------

    @app.get("/api/health", tags=["meta"])
    def health(db=Depends(get_db)):
        mv = db.scalar(select(ModelVersion).where(ModelVersion.is_active))
        return {"status": "ok", "active_model": mv.version if mv else None,
                "database": engine.dialect.name, "ai_available": ai.ai_available()}

    # ---------- scoring ----------

    def save_decision(db, user, bundle, inputs, result, reference, source):
        """Add an application and its decision to the session; the caller flushes once."""
        appl = Application(reference=reference, inputs=inputs, source=source, created_by=user.id)
        d = Decision(application=appl, model_version=bundle["version"], probability=result["probability"],
                     score=result["score"], band=result["band"], recommendation=result["recommendation"],
                     contributions=result["contributions"], offer=policy.offer(result["band"], inputs["credit_limit"]))
        db.add_all([appl, d])
        return appl, d

    def decision_out(db, d, threshold):
        appl = d.application
        creator = db.get(User, appl.created_by)
        return DecisionOut(
            id=d.id, application_id=appl.id, reference=appl.reference, source=appl.source,
            created_at=d.created_at, created_by=creator.email if creator else "unknown",
            model_version=d.model_version, probability=d.probability, score=d.score, band=d.band,
            recommendation=d.recommendation, threshold=threshold, contributions=d.contributions,
            offer=d.offer, inputs=appl.inputs, ai_summary=d.ai_summary,
        )

    def threshold_for(version):
        try:
            return scoring.load_version(str(cfg.models_dir / version))["threshold"]
        except FileNotFoundError:
            return 0.5

    def row_out(d):
        return DecisionRow(id=d.id, reference=d.application.reference, source=d.application.source,
                           created_at=d.created_at, model_version=d.model_version, probability=d.probability,
                           score=d.score, band=d.band, recommendation=d.recommendation)

    @app.post("/api/applications", response_model=DecisionOut, status_code=201, tags=["scoring"])
    def create_application(body: ApplicationIn, db=Depends(get_db), user=Depends(current_user)):
        bundle = active_model(db)
        row = body.to_row()
        appl, d = save_decision(db, user, bundle, row, scoring.score_one(bundle, row), body.reference.strip(), "form")
        db.flush()
        audit(db, user, "score_application", bundle["version"], application_id=appl.id,
              band=d.band, probability=d.probability)
        db.commit()
        return decision_out(db, d, bundle["threshold"])

    @app.post("/api/applications/batch", response_model=BatchOut, tags=["scoring"])
    async def batch(file: UploadFile = File(...), db=Depends(get_db), user=Depends(current_user)):
        raw = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "The file is larger than 5 MB.")
        try:
            reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
            rows = list(reader)
        except UnicodeDecodeError:
            raise HTTPException(400, "The file must be a UTF-8 CSV.")
        missing = [c for c in INPUT_COLUMNS if c not in (reader.fieldnames or []) and c not in ("sex", "marital_status")]
        if missing:
            raise HTTPException(400, f"Missing columns: {', '.join(missing)}. Download the template for the format.")
        if not rows:
            raise HTTPException(400, "The file has no rows.")
        if len(rows) > MAX_BATCH_ROWS:
            raise HTTPException(400, f"At most {MAX_BATCH_ROWS} rows per upload.")

        valid, rejected = [], []
        for n, r in enumerate(rows, start=2):  # line 1 is the header
            try:
                body = ApplicationIn(
                    reference=(r.get("reference") or f"row {n}").strip(),
                    credit_limit=int(float(r["credit_limit"])), age=int(float(r["age"])),
                    education=int(float(r["education"])),
                    sex=int(float(r["sex"])) if r.get("sex") else None,
                    marital_status=int(float(r["marital_status"])) if r.get("marital_status") else None,
                    pay_status=[int(float(r[f"pay_status_{m}"])) for m in range(1, MONTHS + 1)],
                    bill_amounts=[int(float(r[f"bill_amount_{m}"])) for m in range(1, MONTHS + 1)],
                    paid_amounts=[int(float(r[f"paid_amount_{m}"])) for m in range(1, MONTHS + 1)],
                )
                valid.append(body)
            except (ValidationError, ValueError, TypeError) as exc:
                msg = exc.errors()[0]["msg"] if isinstance(exc, ValidationError) else "a value is not a number"
                rejected.append({"line": n, "reference": r.get("reference"), "error": msg})

        bundle = active_model(db)
        decisions = []
        if valid:
            results = scoring.score_frame(bundle, pd.DataFrame([b.to_row() for b in valid]))
            for body, res in zip(valid, results):
                _, d = save_decision(db, user, bundle, body.to_row(), res, body.reference, "batch")
                decisions.append(d)
            db.flush()
        audit(db, user, "score_batch", bundle["version"], file=file.filename, scored=len(decisions),
              rejected=len(rejected))
        db.commit()
        return BatchOut(scored=len(decisions), rejected=rejected[:200], model_version=bundle["version"],
                        decisions=[row_out(d) for d in decisions[:500]])

    @app.get("/api/applications", response_model=list[DecisionRow], tags=["scoring"])
    def list_decisions(limit: int = 50, band: str | None = None, db=Depends(get_db), user=Depends(current_user)):
        q = own_only(select(Decision).join(Application).order_by(Decision.id.desc()).limit(min(max(limit, 1), 500)), user)
        if band:
            q = q.where(Decision.band == band.upper())
        return [row_out(d) for d in db.scalars(q)]

    @app.get("/api/applications/{decision_id}", response_model=DecisionOut, tags=["scoring"])
    def get_decision(decision_id: int, db=Depends(get_db), user=Depends(current_user)):
        d = visible_decision(db, user, decision_id)
        return decision_out(db, d, threshold_for(d.model_version))

    @app.post("/api/applications/{decision_id}/summary", response_model=SummaryOut, tags=["scoring"])
    def summary(decision_id: int, body: SummaryIn, db=Depends(get_db), user=Depends(current_user)):
        d = visible_decision(db, user, decision_id)
        if not ai.ai_available() and ai_client is None:
            raise HTTPException(503, "AI summaries are off: add ANTHROPIC_API_KEY to .env and restart the API.")
        data = {"probability": d.probability, "score": d.score, "band": d.band, "recommendation": d.recommendation,
                "model_version": d.model_version, "contributions": d.contributions, "offer": d.offer}
        try:
            out = ai.summarise(data, body.language, client=ai_client)
        except ai.AiError as exc:
            raise HTTPException(502, str(exc))
        d.ai_summary = out["text"]
        audit(db, user, "ai_summary", d.model_version, decision_id=d.id, language=out["language"], model=out["model"])
        db.commit()
        return SummaryOut(**out)

    @app.get("/api/batch-template", tags=["scoring"])
    def template():
        header = ["reference"] + INPUT_COLUMNS
        example = ["ACME Traders", 200000, 38, 1, "", ""] + [0] * 6 + [52000, 49000, 51000, 47000, 45000, 43000] \
            + [3000, 2500, 2600, 2400, 2200, 2000]
        body = ",".join(header) + "\n" + ",".join(str(x) for x in example) + "\n"
        return Response(body, media_type="text/csv",
                        headers={"Content-Disposition": "attachment; filename=batch-template.csv"})

    # ---------- portfolio ----------

    @app.get("/api/portfolio", tags=["portfolio"])
    def portfolio(db=Depends(get_db), user=Depends(current_user)):
        def scoped(q):
            return own_only(q.join(Application, Decision.application_id == Application.id), user)

        total = db.scalar(scoped(select(func.count(Decision.id)))) or 0
        by_band = dict(db.execute(scoped(select(Decision.band, func.count(Decision.id))).group_by(Decision.band)).all())
        by_rec = dict(db.execute(scoped(select(Decision.recommendation, func.count(Decision.id)))
                                 .group_by(Decision.recommendation)).all())
        by_version = dict(db.execute(scoped(select(Decision.model_version, func.count(Decision.id)))
                                     .group_by(Decision.model_version)).all())
        avg_p = db.scalar(scoped(select(func.avg(Decision.probability)))) or 0.0
        rows = db.execute(scoped(select(Decision.probability, Decision.offer))).all()
        exposure = sum((o or {}).get("suggested_limit", 0) for _, o in rows)
        expected_loss_share = (sum(p * (o or {}).get("suggested_limit", 0) for p, o in rows) / exposure) if exposure else 0
        buckets = [0] * 10
        for p, _ in rows:
            buckets[min(int(p * 10), 9)] += 1
        return {
            "total": total,
            "average_probability": round(float(avg_p), 4),
            "bands": {b: by_band.get(b, 0) for b, _ in scoring.BANDS},
            "recommendations": {r: by_rec.get(r, 0) for r in ("approve", "review", "decline")},
            "by_model_version": by_version,
            "suggested_exposure": int(exposure),
            "exposure_weighted_probability": round(float(expected_loss_share), 4),
            "probability_histogram": [{"from": i / 10, "to": (i + 1) / 10, "count": c} for i, c in enumerate(buckets)],
        }

    # ---------- model registry ----------

    def model_out(mv, detail=False):
        t = mv.metrics["test"]
        base = dict(version=mv.version, algorithm=mv.algorithm, is_active=mv.is_active,
                    registered_at=mv.registered_at, activated_at=mv.activated_at, auc=t["auc"],
                    baseline_auc=mv.metrics["baseline_logistic_regression_test"]["auc"], brier=t["brier"],
                    threshold=t["threshold"], recall=t["recall"], precision=t["precision"],
                    rows=mv.metrics["data"]["rows"])
        return ModelDetail(**base, metrics=mv.metrics) if detail else ModelOut(**base)

    @app.get("/api/models", response_model=list[ModelOut], tags=["models"])
    def list_models(db=Depends(get_db), user=Depends(current_user)):
        sync_registry(db, cfg)
        return [model_out(m) for m in db.scalars(select(ModelVersion).order_by(ModelVersion.version.desc()))]

    @app.get("/api/models/{version}", response_model=ModelDetail, tags=["models"])
    def get_model(version: str, db=Depends(get_db), user=Depends(current_user)):
        mv = db.scalar(select(ModelVersion).where(ModelVersion.version == version))
        if not mv:
            raise HTTPException(404, "Model version not found.")
        return model_out(mv, detail=True)

    @app.post("/api/models/{version}/activate", response_model=ModelOut, tags=["models"])
    def activate(version: str, db=Depends(get_db), user=Depends(admin_user)):
        if is_demo(user):
            raise HTTPException(403, "Switching the live model is turned off in the demo.")
        mv = db.scalar(select(ModelVersion).where(ModelVersion.version == version))
        if not mv:
            raise HTTPException(404, "Model version not found.")
        if not (cfg.models_dir / version / "model.joblib").exists():
            raise HTTPException(409, "The model files for this version are missing on the server.")
        previous = db.scalar(select(ModelVersion).where(ModelVersion.is_active))
        for m in db.scalars(select(ModelVersion).where(ModelVersion.is_active)):
            m.is_active = False
        mv.is_active, mv.activated_at = True, now()
        audit(db, user, "activate_model", version, previous=previous.version if previous else None)
        db.commit()
        return model_out(mv)

    @app.get("/api/audit", response_model=list[AuditOut], tags=["admin"])
    def audit_log(limit: int = 100, db=Depends(get_db), user=Depends(admin_user)):
        q = select(AuditEvent).order_by(AuditEvent.id.desc()).limit(min(max(limit, 1), 1000))
        if is_demo(user):
            q = q.where(AuditEvent.user_email == user.email)  # never anyone else's activity
        return [AuditOut(at=e.at, user_email=e.user_email, action=e.action, model_version=e.model_version,
                         details=e.details) for e in db.scalars(q)]

    return app


def seed_users(db, cfg):
    for email, password, role in cfg.seed_users:
        if not email or not password:
            continue
        email = email.strip().lower()
        if not db.scalar(select(User).where(User.email == email)):
            db.add(User(email=email, password_hash=hash_password(password), role=role))
    db.commit()


def seed_demo(db, cfg):
    """Create the demo account when DEMO_ACCOUNT is on. It gets the admin pages so visitors see every
    feature, and a fresh random password nobody knows, so only the demo button opens it."""
    if not cfg.demo_account:
        return
    user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if not user:
        user = User(email=DEMO_EMAIL, password_hash="", role="admin")
        db.add(user)
    user.role = "admin"
    user.password_hash = hash_password(secrets.token_urlsafe(32))
    db.commit()


def sync_registry(db, cfg):
    """Register every model folder on disk; activate the newest if none is active."""
    known = set(db.scalars(select(ModelVersion.version)))
    if cfg.models_dir.exists():
        for folder in sorted(cfg.models_dir.iterdir()):
            metrics_file = folder / "metrics.json"
            if folder.is_dir() and folder.name not in known and metrics_file.exists() and (folder / "model.joblib").exists():
                m = json.loads(metrics_file.read_text(encoding="utf-8"))
                db.add(ModelVersion(version=folder.name, algorithm=m.get("algorithm", "unknown"), metrics=m))
    db.flush()
    if not db.scalar(select(ModelVersion).where(ModelVersion.is_active)):
        newest = db.scalar(select(ModelVersion).order_by(ModelVersion.version.desc()))
        if newest:
            newest.is_active, newest.activated_at = True, now()
    db.commit()


app = create_app()
