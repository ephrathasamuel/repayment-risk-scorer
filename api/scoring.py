"""Scoring one or many borrowers with a saved model version, with per-feature explanations."""

import json
import math
from functools import lru_cache
from pathlib import Path

import joblib
import pandas as pd

from ml.features import FEATURE_LABELS, INPUT_COLUMNS, build_features, clean

# Probability of default -> risk band. Upper bounds.
BANDS = [("A", 0.10), ("B", 0.20), ("C", 0.35), ("D", 0.55), ("E", 1.01)]
RECOMMENDATION = {"A": "approve", "B": "approve", "C": "review", "D": "decline", "E": "decline"}


@lru_cache(maxsize=8)
def load_version(folder):
    folder = Path(folder)
    bundle = joblib.load(folder / "model.joblib")
    bundle["metrics"] = json.loads((folder / "metrics.json").read_text(encoding="utf-8"))
    return bundle


def to_score(p):
    """300-850 points scale: 600 points at even odds, +50 points each time the odds of repaying double."""
    p = min(max(p, 1e-4), 1 - 1e-4)
    return int(round(min(max(600 + 50 * math.log2((1 - p) / p), 300), 850)))


def to_band(p):
    return next(b for b, upper in BANDS if p < upper)


def score_frame(bundle, raw):
    """Score a DataFrame of raw inputs. Returns one dict per row."""
    raw = clean(raw[INPUT_COLUMNS])
    X = build_features(raw)[bundle["features"]]
    model = bundle["model"]
    probs = model.predict_proba(X)[:, 1]
    # LightGBM's built-in TreeSHAP: per-feature contributions in log-odds; last column is the base value.
    contrib = model.predict(X, pred_contrib=True)
    medians = bundle["metrics"]["feature_medians"]
    results = []
    for i, p in enumerate(probs):
        row = X.iloc[i]
        factors = [
            {
                "feature": f,
                "label": FEATURE_LABELS.get(f, f),
                "value": _plain(row[f]),
                "typical": _plain(medians.get(f)),
                "contribution": round(float(contrib[i, j]), 4),
            }
            for j, f in enumerate(bundle["features"])
        ]
        factors.sort(key=lambda x: abs(x["contribution"]), reverse=True)
        band = to_band(float(p))
        results.append({
            "probability": round(float(p), 4),
            "score": to_score(float(p)),
            "band": band,
            "recommendation": RECOMMENDATION[band],
            "base_log_odds": round(float(contrib[i, -1]), 4),
            "contributions": factors,
        })
    return results


def score_one(bundle, inputs):
    return score_frame(bundle, pd.DataFrame([inputs]))[0]


def _plain(v):
    if v is None:
        return None
    v = float(v)
    return int(v) if v.is_integer() else round(v, 3)
