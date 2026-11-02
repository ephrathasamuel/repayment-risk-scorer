import pandas as pd
import pytest

from ml.features import INPUT_COLUMNS, PROTECTED, build_features, clean, load_uci
from tests.conftest import FIXTURE


def one(**overrides):
    row = {c: 0 for c in INPUT_COLUMNS}
    row.update(credit_limit=100000, age=40, education=2, sex=1, marital_status=1)
    row.update(overrides)
    return pd.DataFrame([row])


def test_fixture_loads_with_expected_columns():
    df = load_uci(FIXTURE)
    assert len(df) == 2000
    assert set(INPUT_COLUMNS) <= set(df.columns)
    assert df["default_next_month"].isin([0, 1]).all()


def test_protected_attributes_are_not_model_features():
    f = build_features(load_uci(FIXTURE))
    for col in PROTECTED:
        assert col not in f.columns


def test_undocumented_codes_are_grouped_as_other():
    df = clean(one(education=6, marital_status=0))
    assert df.loc[0, "education"] == 4
    assert df.loc[0, "marital_status"] == 3


def test_utilisation_and_lateness():
    df = one(bill_amount_1=50000, pay_status_1=2, pay_status_2=1, pay_status_3=-1)
    f = build_features(df)
    assert f.loc[0, "utilisation_latest"] == pytest.approx(0.5)
    assert f.loc[0, "months_late"] == 2
    assert f.loc[0, "worst_delay"] == 2


def test_repayment_ratio_matches_payments_to_previous_bills():
    # Payment in month m pays the bill of month m+1: 5 payments of 1,000 against 5 bills of 2,000.
    kw = {f"bill_amount_{m}": 2000 for m in range(1, 7)}
    kw.update({f"paid_amount_{m}": 1000 for m in range(1, 7)})
    f = build_features(one(**kw))
    assert f.loc[0, "repayment_ratio"] == pytest.approx(0.5)
    assert f.loc[0, "months_paid_nothing"] == 0


def test_no_bills_means_full_repayment_ratio_and_no_division_error():
    f = build_features(one())
    assert f.loc[0, "repayment_ratio"] == 1.0
    assert f.loc[0, "utilisation_avg"] == 0.0


def test_unpaid_months_counted():
    kw = {f"bill_amount_{m}": 5000 for m in range(1, 7)}
    f = build_features(one(**kw))
    assert f.loc[0, "months_paid_nothing"] == 5
