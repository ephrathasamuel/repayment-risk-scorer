from types import SimpleNamespace

from tests.conftest import ADMIN, ANALYST, GOOD, RISKY, sign_in


def test_health_is_public(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["active_model"] == "v-test-2"  # newest registered version is activated
    assert r.json()["ai_available"] is False


def test_scoring_needs_sign_in(client):
    assert client.post("/api/applications", json=GOOD).status_code == 401
    assert client.get("/api/portfolio").status_code == 401


def test_wrong_password_rejected(client):
    r = client.post("/api/auth/login", json={"email": ADMIN[0], "password": "nope"})
    assert r.status_code == 401


def test_score_application_and_read_it_back(client):
    sign_in(client, ANALYST)
    r = client.post("/api/applications", json=GOOD)
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["model_version"] == "v-test-2"
    assert d["band"] in "ABCDE"
    assert d["offer"]["illustrative"] is True
    assert len(d["contributions"]) > 5
    again = client.get(f"/api/applications/{d['id']}").json()
    assert again["probability"] == d["probability"]
    assert again["created_by"] == ANALYST[0]


def test_invalid_input_rejected(client):
    sign_in(client, ANALYST)
    bad = {**GOOD, "pay_status": [0, 0, 0], "age": 12}
    assert client.post("/api/applications", json=bad).status_code == 422


def test_batch_csv(client):
    sign_in(client, ANALYST)
    template = client.get("/api/batch-template").text
    header = template.splitlines()[0]
    good_line = template.splitlines()[1]
    bad_line = good_line.replace("ACME Traders,200000,38", "Broken,200000,abc")
    csv_text = "\n".join([header, good_line, good_line.replace("ACME", "Second"), bad_line]) + "\n"
    r = client.post("/api/applications/batch", files={"file": ("loans.csv", csv_text, "text/csv")})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["scored"] == 2
    assert out["rejected"][0]["line"] == 4


def test_batch_missing_columns(client):
    sign_in(client, ANALYST)
    r = client.post("/api/applications/batch", files={"file": ("x.csv", "reference,age\nA,30\n", "text/csv")})
    assert r.status_code == 400
    assert "Missing columns" in r.json()["detail"]


def test_portfolio_counts(client):
    sign_in(client, ANALYST)
    client.post("/api/applications", json=GOOD)
    client.post("/api/applications", json=RISKY)
    p = client.get("/api/portfolio").json()
    assert p["total"] == 2
    assert sum(p["bands"].values()) == 2
    assert sum(b["count"] for b in p["probability_histogram"]) == 2


def test_only_admin_can_switch_model_and_it_is_audited(client):
    sign_in(client, ANALYST)
    assert client.post("/api/models/v-test-1/activate").status_code == 403
    assert client.get("/api/audit").status_code == 403

    sign_in(client, ADMIN)
    models = client.get("/api/models").json()
    assert [m["version"] for m in models] == ["v-test-2", "v-test-1"]
    r = client.post("/api/models/v-test-1/activate")
    assert r.status_code == 200 and r.json()["is_active"]
    d = client.post("/api/applications", json=GOOD).json()
    assert d["model_version"] == "v-test-1"
    log = client.get("/api/audit").json()
    actions = [e["action"] for e in log]
    assert "activate_model" in actions
    assert log[0]["action"] == "score_application" and log[0]["model_version"] == "v-test-1"


def test_ai_summary_off_without_key(client):
    sign_in(client, ANALYST)
    d = client.post("/api/applications", json=GOOD).json()
    r = client.post(f"/api/applications/{d['id']}/summary", json={"language": "en"})
    assert r.status_code == 503


class FakeMessages:
    def __init__(self):
        self.sent = None

    def create(self, **kw):
        self.sent = kw
        return SimpleNamespace(stop_reason="end_turn", model=kw["model"],
                               content=[SimpleNamespace(type="text", text="Recommendation: approve.")])


def test_ai_summary_uses_only_model_values(make_client):
    fake = FakeMessages()
    client = make_client(ai_client=SimpleNamespace(beta=SimpleNamespace(messages=fake)))
    sign_in(client, ANALYST)
    d = client.post("/api/applications", json=RISKY).json()
    r = client.post(f"/api/applications/{d['id']}/summary", json={"language": "am"})
    assert r.status_code == 200, r.text
    assert r.json()["language"] == "Amharic"
    assert fake.sent["model"] == "claude-opus-5-5"
    assert fake.sent["fallbacks"] == "default"
    prompt = fake.sent["messages"][0]["content"]
    assert str(d["probability"]) in prompt
    assert "Late Payer" not in prompt  # the borrower's name is not sent to the AI
    assert client.get(f"/api/applications/{d['id']}").json()["ai_summary"] == "Recommendation: approve."


def test_ai_refusal_reported(make_client):
    class Refuse(FakeMessages):
        def create(self, **kw):
            return SimpleNamespace(stop_reason="refusal", model=kw["model"], content=[])

    client = make_client(ai_client=SimpleNamespace(beta=SimpleNamespace(messages=Refuse())))
    sign_in(client, ANALYST)
    d = client.post("/api/applications", json=GOOD).json()
    r = client.post(f"/api/applications/{d['id']}/summary", json={"language": "en"})
    assert r.status_code == 502
    assert "declined" in r.json()["detail"]


def test_logout_clears_session(client):
    sign_in(client, ANALYST)
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401



def test_demo_off_by_default(client):
    assert client.get("/api/auth/demo").json() == {"enabled": False}
    assert client.post("/api/auth/demo").status_code == 404


def test_demo_is_walled_off(make_client):
    real = make_client()
    sign_in(real, ADMIN)
    theirs = real.post("/api/applications", json=GOOD).json()["id"]

    demo = make_client(demo=True)  # same database, demo switched on
    assert demo.get("/api/auth/demo").json() == {"enabled": True}
    me = demo.post("/api/auth/demo").json()
    assert me["role"] == "admin"
    # No way in with a password.
    assert demo.post("/api/auth/login", json={"email": me["email"], "password": "x"}).status_code == 401
    demo.post("/api/auth/demo")
    # Sees none of the real portfolio, cannot switch the live model, and the audit log shows only its own activity.
    assert demo.get("/api/applications").json() == []
    assert demo.get(f"/api/applications/{theirs}").status_code == 404
    assert demo.get("/api/portfolio").json()["total"] == 0
    versions = [m["version"] for m in demo.get("/api/models").json()]
    assert demo.post(f"/api/models/{versions[-1]}/activate").status_code == 403
    assert all(e["user_email"] == me["email"] for e in demo.get("/api/audit").json())
    # Its own work shows up.
    mine = demo.post("/api/applications", json=RISKY)
    assert mine.status_code == 201
    assert [d["id"] for d in demo.get("/api/applications").json()] == [mine.json()["id"]]
    assert demo.get("/api/portfolio").json()["total"] == 1
