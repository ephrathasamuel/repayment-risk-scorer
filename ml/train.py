"""Train, evaluate and save a model version.

    python -m ml.train                       # full UCI data from data/raw
    python -m ml.train --data tests/fixtures/sample.csv --out /tmp/models

Each run writes a new folder models/<version>/ containing the model, its
metrics and a model card. The API registers new folders when it starts.
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, confusion_matrix, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from ml.features import FEATURE_LABELS, TARGET, build_features, load_uci

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA = ROOT / "data" / "raw" / "default of credit card clients.xls"
DEFAULT_OUT = ROOT / "models"
SEED = 42


def split(df):
    """60 / 20 / 20, stratified. The data has no application dates, so the split cannot be time-based."""
    train, rest = train_test_split(df, test_size=0.4, stratify=df[TARGET], random_state=SEED)
    val, test = train_test_split(rest, test_size=0.5, stratify=rest[TARGET], random_state=SEED)
    return train, val, test


def pick_threshold(y, p):
    """The cut-off that gives the best F1 on the validation set."""
    grid = np.arange(0.05, 0.95, 0.01)
    scores = [f1_score(y, p >= t) for t in grid]
    return float(grid[int(np.argmax(scores))])


def evaluate(y, p, threshold):
    tn, fp, fn, tp = confusion_matrix(y, p >= threshold, labels=[0, 1]).ravel()
    frac_pos, mean_pred = calibration_curve(y, p, n_bins=10, strategy="quantile")
    return {
        "auc": round(float(roc_auc_score(y, p)), 4),
        "brier": round(float(brier_score_loss(y, p)), 4),
        "threshold": round(threshold, 2),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "precision": round(tp / max(tp + fp, 1), 4),
        "recall": round(tp / max(tp + fn, 1), 4),
        "calibration": [
            {"predicted": round(float(a), 4), "observed": round(float(b), 4)} for a, b in zip(mean_pred, frac_pos)
        ],
    }


def segment_check(test_df, p, threshold):
    """Default rate, average predicted risk and flag rate by group, on the test set."""
    df = test_df.assign(p=p, flagged=p >= threshold)
    df["age_band"] = pd.cut(df["age"], [0, 29, 39, 49, 200], labels=["under 30", "30-39", "40-49", "50+"])
    df["sex_label"] = df["sex"].map({1: "male", 2: "female"})
    out = {}
    for col in ["sex_label", "age_band"]:
        rows = []
        for name, g in df.groupby(col, observed=True):
            rows.append({
                "group": str(name),
                "count": int(len(g)),
                "actual_default_rate": round(float(g[TARGET].mean()), 4),
                "mean_predicted": round(float(g["p"].mean()), 4),
                "flag_rate": round(float(g["flagged"].mean()), 4),
                "auc": round(float(roc_auc_score(g[TARGET], g["p"])), 4) if g[TARGET].nunique() == 2 else None,
            })
        out[col.replace("_label", "")] = rows
    return out


def train(data_path=DEFAULT_DATA, out_dir=DEFAULT_OUT, version=None, quiet=False):
    df = load_uci(data_path)
    train_df, val_df, test_df = split(df)
    X_train, X_val, X_test = (build_features(d) for d in (train_df, val_df, test_df))
    y_train, y_val, y_test = (d[TARGET].values for d in (train_df, val_df, test_df))

    baseline = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000))
    baseline.fit(X_train, y_train)

    model = lgb.LGBMClassifier(
        n_estimators=2000, learning_rate=0.02, num_leaves=15, min_child_samples=40,
        subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0,
        random_state=SEED, verbose=-1,
    )
    model.fit(X_train, y_train, eval_X=X_val, eval_y=y_val, eval_metric="auc",
              callbacks=[lgb.early_stopping(100, verbose=False)])

    p_val = model.predict_proba(X_val)[:, 1]
    threshold = pick_threshold(y_val, p_val)
    p_test = model.predict_proba(X_test)[:, 1]
    p_base_test = baseline.predict_proba(X_test)[:, 1]
    base_threshold = pick_threshold(y_val, baseline.predict_proba(X_val)[:, 1])

    version = version or "v" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    metrics = {
        "version": version,
        "algorithm": "LightGBM gradient-boosted trees",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "data": {
            "source": Path(data_path).name,
            "rows": int(len(df)),
            "default_rate": round(float(df[TARGET].mean()), 4),
            "split": {"train": len(train_df), "validation": len(val_df), "test": len(test_df)},
        },
        "features": list(X_train.columns),
        "best_iteration": int(model.best_iteration_ or model.n_estimators),
        "test": evaluate(y_test, p_test, threshold),
        "baseline_logistic_regression_test": evaluate(y_test, p_base_test, base_threshold),
        "segments_test": segment_check(test_df, p_test, threshold),
        # Reference values used to explain where a borrower sits, e.g. "typical: 0.42".
        "feature_medians": {c: float(X_train[c].median()) for c in X_train.columns},
    }

    folder = Path(out_dir) / version
    folder.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": list(X_train.columns), "threshold": threshold, "version": version},
                folder / "model.joblib")
    (folder / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (folder / "model_card.md").write_text(model_card(metrics), encoding="utf-8")
    if not quiet:
        t, b = metrics["test"], metrics["baseline_logistic_regression_test"]
        print(f"{version}: test AUC {t['auc']} (logistic baseline {b['auc']}), Brier {t['brier']}, "
              f"threshold {t['threshold']}, recall {t['recall']}, precision {t['precision']}")
    return folder, metrics


def model_card(m):
    t, b = m["test"], m["baseline_logistic_regression_test"]
    cm = t["confusion_matrix"]
    seg_lines = []
    for name, rows in m["segments_test"].items():
        for r in rows:
            seg_lines.append(f"| {name} | {r['group']} | {r['count']} | {r['actual_default_rate']:.1%} | "
                             f"{r['mean_predicted']:.1%} | {r['flag_rate']:.1%} | {r['auc']} |")
    feats = "\n".join(f"- `{f}`: {FEATURE_LABELS.get(f, f)}" for f in m["features"])
    return f"""# Model card: {m['version']}

**Purpose:** estimate the probability that a borrower misses next month's payment, from six months of
billing and repayment history. Built as a portfolio prototype, not for real lending decisions.

## Data
- UCI "Default of Credit Card Clients" (Yeh & Lien, 2009), Taiwan, April-September 2005, licence CC BY 4.0.
- {m['data']['rows']:,} borrowers, {m['data']['default_rate']:.1%} defaulted the next month.
- Split 60/20/20 (train {m['data']['split']['train']:,}, validation {m['data']['split']['validation']:,},
  test {m['data']['split']['test']:,}), stratified. The data has no dates, so the split is not time-based.
- Consumer credit-card accounts, not small-business loans.

## Model
- {m['algorithm']}, {m['best_iteration']} trees (early stopping on validation AUC).
- Baseline: logistic regression on the same features.
- Sex and marital status are **not** model inputs; they are kept only for the check below.

## Test results (held-out {m['data']['split']['test']:,} borrowers)
| | LightGBM | Logistic baseline |
|---|---|---|
| AUC | {t['auc']} | {b['auc']} |
| Brier score | {t['brier']} | {b['brier']} |
| Recall at cut-off | {t['recall']:.1%} | {b['recall']:.1%} |
| Precision at cut-off | {t['precision']:.1%} | {b['precision']:.1%} |

Cut-off {t['threshold']} (best F1 on validation). Confusion matrix on test:
true negatives {cm['tn']}, false positives {cm['fp']}, false negatives {cm['fn']}, true positives {cm['tp']}.

## Segment check (test set)
| Attribute | Group | Count | Actual default | Mean predicted | Flagged | AUC |
|---|---|---|---|---|---|---|
{chr(10).join(seg_lines)}

What this shows: whether predicted risk tracks actual default in each group, and how often each group
would be flagged. What it does not show: whether the outcomes themselves are fair, whether proxies for
protected attributes are in the features, or how the model behaves on other populations.

## Features
{feats}

## Limits
- 2005 Taiwanese credit-card data; patterns will differ for Ethiopian MSMEs, invoices or mobile lending.
- Predictions are explained with SHAP values, which describe the model, not causes.
- Limit and pricing suggestions in the app are illustrative rules, not part of the model.
"""


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(DEFAULT_DATA))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--version")
    args = ap.parse_args()
    train(args.data, args.out, args.version)
