"""Loading the UCI data and turning a borrower's record into model features.

The same functions are used for training and for scoring in the API, so a
borrower is always described to the model the same way.
"""

from pathlib import Path

import numpy as np
import pandas as pd

TARGET = "default_next_month"

# Inputs a credit officer enters (or a system supplies) for one borrower.
# Money is in New Taiwan dollars (NT$), as in the source data.
MONTHS = 6
INPUT_COLUMNS = (
    ["credit_limit", "age", "education", "sex", "marital_status"]
    + [f"pay_status_{m}" for m in range(1, MONTHS + 1)]
    + [f"bill_amount_{m}" for m in range(1, MONTHS + 1)]
    + [f"paid_amount_{m}" for m in range(1, MONTHS + 1)]
)

# Kept for the fairness check, never given to the model.
PROTECTED = ["sex", "marital_status"]

_RENAME = {
    "LIMIT_BAL": "credit_limit",
    "SEX": "sex",
    "EDUCATION": "education",
    "MARRIAGE": "marital_status",
    "AGE": "age",
    "default payment next month": TARGET,
    # Month 1 is the most recent (September 2005), month 6 the oldest (April 2005).
    "PAY_0": "pay_status_1",
    **{f"PAY_{m}": f"pay_status_{m}" for m in range(2, 7)},
    **{f"BILL_AMT{m}": f"bill_amount_{m}" for m in range(1, 7)},
    **{f"PAY_AMT{m}": f"paid_amount_{m}" for m in range(1, 7)},
}


def load_uci(path):
    """Read the original UCI file (.xls) or a CSV that already uses our column names."""
    path = Path(path)
    if path.suffix == ".xls":
        df = pd.read_excel(path, header=1)
        df = df.rename(columns=_RENAME).drop(columns=["ID"])
    else:
        df = pd.read_csv(path)
    return clean(df)


def clean(df):
    df = df.copy()
    # The documentation lists education 1-4; 0, 5 and 6 appear but are undocumented. Treat them as "other".
    df["education"] = df["education"].where(df["education"].isin([1, 2, 3, 4]), 4)
    df["marital_status"] = df["marital_status"].where(df["marital_status"].isin([1, 2, 3]), 3)
    return df


def build_features(df):
    """Model features from the raw inputs. Protected attributes are left out."""
    f = pd.DataFrame(index=df.index)
    limit = df["credit_limit"].clip(lower=1)
    bills = df[[f"bill_amount_{m}" for m in range(1, MONTHS + 1)]]
    paid = df[[f"paid_amount_{m}" for m in range(1, MONTHS + 1)]]
    status = df[[f"pay_status_{m}" for m in range(1, MONTHS + 1)]]

    f["credit_limit"] = df["credit_limit"]
    f["age"] = df["age"]
    f["education"] = df["education"]
    for m in range(1, MONTHS + 1):
        f[f"pay_status_{m}"] = df[f"pay_status_{m}"]
    f["utilisation_latest"] = df["bill_amount_1"] / limit
    f["utilisation_avg"] = bills.mean(axis=1) / limit
    f["months_late"] = (status > 0).sum(axis=1)
    f["worst_delay"] = status.max(axis=1).clip(lower=0)
    # Each month's payment covers the previous month's bill (payment m pays bill m+1).
    owed = bills.iloc[:, 1:].clip(lower=0).sum(axis=1)
    f["repayment_ratio"] = (paid.iloc[:, :-1].sum(axis=1) / owed.replace(0, np.nan)).fillna(1.0).clip(upper=5)
    f["months_paid_nothing"] = ((paid.iloc[:, :-1].values == 0) & (bills.iloc[:, 1:].values > 0)).sum(axis=1)
    f["bill_trend"] = (df["bill_amount_1"] - df["bill_amount_6"]) / limit
    f["paid_latest"] = df["paid_amount_1"]
    return f


FEATURE_LABELS = {
    "credit_limit": "Credit limit",
    "age": "Age",
    "education": "Education level",
    **{f"pay_status_{m}": f"Repayment status, {m} month{'s' if m > 1 else ''} ago" if m > 1 else "Repayment status, latest month" for m in range(1, MONTHS + 1)},
    "utilisation_latest": "Latest balance as share of limit",
    "utilisation_avg": "Average balance as share of limit",
    "months_late": "Months paid late (of 6)",
    "worst_delay": "Longest delay (months)",
    "repayment_ratio": "Paid vs. billed over 5 months",
    "months_paid_nothing": "Months with a bill but no payment",
    "bill_trend": "Balance change over 6 months (share of limit)",
    "paid_latest": "Latest payment (NT$)",
}
