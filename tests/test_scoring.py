import json
import math

import pytest

from api import policy, scoring
from tests.conftest import GOOD, RISKY
from api.schemas import ApplicationIn


@pytest.fixture(scope="module")
def bundle(models_dir):
    return scoring.load_version(str(models_dir / "v-test-1"))


def test_training_writes_metrics_and_card(models_dir):
    folder = models_dir / "v-test-1"
    m = json.loads((folder / "metrics.json").read_text())
    assert (folder / "model_card.md").exists()
    assert 0.5 < m["test"]["auc"] <= 1
    assert "baseline_logistic_regression_test" in m
    assert {"sex", "age_band"} == set(m["segments_test"])
    cm = m["test"]["confusion_matrix"]
    assert sum(cm.values()) == m["data"]["split"]["test"]


def test_score_scale():
    assert scoring.to_score(0.5) == 600
    assert scoring.to_score(1 / 3) == 650  # odds of repaying 2:1 -> +50 points
    assert scoring.to_score(0.0) == 850
    assert scoring.to_score(1.0) == 300


@pytest.mark.parametrize("p,band", [(0.05, "A"), (0.1, "B"), (0.25, "C"), (0.4, "D"), (0.9, "E")])
def test_bands(p, band):
    assert scoring.to_band(p) == band


def test_late_payer_scores_riskier_than_good_payer(bundle):
    good = scoring.score_one(bundle, ApplicationIn(**GOOD).to_row())
    risky = scoring.score_one(bundle, ApplicationIn(**RISKY).to_row())
    assert risky["probability"] > good["probability"]
    assert risky["score"] < good["score"]


def test_contributions_add_up_to_the_prediction(bundle):
    res = scoring.score_one(bundle, ApplicationIn(**RISKY).to_row())
    log_odds = res["base_log_odds"] + sum(c["contribution"] for c in res["contributions"])
    assert 1 / (1 + math.exp(-log_odds)) == pytest.approx(res["probability"], abs=2e-3)
    # Sorted by size of effect, largest first.
    sizes = [abs(c["contribution"]) for c in res["contributions"]]
    assert sizes == sorted(sizes, reverse=True)


def test_protected_fields_do_not_change_the_score(bundle):
    a = scoring.score_one(bundle, ApplicationIn(**GOOD, sex=1, marital_status=1).to_row())
    b = scoring.score_one(bundle, ApplicationIn(**GOOD, sex=2, marital_status=2).to_row())
    assert a["probability"] == b["probability"]


def test_policy_is_marked_illustrative():
    o = policy.offer("A", 200000)
    assert o["illustrative"] is True
    assert o["suggested_limit"] == 250000
    assert policy.offer("E", 200000)["suggested_limit"] == 0
    assert policy.offer("E", 200000)["annual_rate_pct"] is None
