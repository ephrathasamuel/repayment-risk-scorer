# Model card: v20261102-125623

**Purpose:** estimate the probability that a borrower misses next month's payment, from six months of
billing and repayment history. Built as a portfolio prototype, not for real lending decisions.

## Data
- UCI "Default of Credit Card Clients" (Yeh & Lien, 2009), Taiwan, April-September 2005, licence CC BY 4.0.
- 30,000 borrowers, 22.1% defaulted the next month.
- Split 60/20/20 (train 18,000, validation 6,000,
  test 6,000), stratified. The data has no dates, so the split is not time-based.
- Consumer credit-card accounts, not small-business loans.

## Model
- LightGBM gradient-boosted trees, 221 trees (early stopping on validation AUC).
- Baseline: logistic regression on the same features.
- Sex and marital status are **not** model inputs; they are kept only for the check below.

## Test results (held-out 6,000 borrowers)
| | LightGBM | Logistic baseline |
|---|---|---|
| AUC | 0.7922 | 0.7611 |
| Brier score | 0.1309 | 0.1388 |
| Recall at cut-off | 56.0% | 55.7% |
| Precision at cut-off | 55.5% | 52.2% |

Cut-off 0.3 (best F1 on validation). Confusion matrix on test:
true negatives 4076, false positives 597, false negatives 584, true positives 743.

## Segment check (test set)
| Attribute | Group | Count | Actual default | Mean predicted | Flagged | AUC |
|---|---|---|---|---|---|---|
| sex | female | 3628 | 20.8% | 21.6% | 21.2% | 0.7962 |
| sex | male | 2372 | 24.1% | 22.7% | 24.1% | 0.7846 |
| age_band | under 30 | 1926 | 21.9% | 23.1% | 24.3% | 0.7888 |
| age_band | 30-39 | 2206 | 19.9% | 20.0% | 18.7% | 0.7976 |
| age_band | 40-49 | 1296 | 24.5% | 22.7% | 23.7% | 0.7945 |
| age_band | 50+ | 572 | 26.1% | 24.9% | 26.6% | 0.7723 |

What this shows: whether predicted risk tracks actual default in each group, and how often each group
would be flagged. What it does not show: whether the outcomes themselves are fair, whether proxies for
protected attributes are in the features, or how the model behaves on other populations.

## Features
- `credit_limit`: Credit limit
- `age`: Age
- `education`: Education level
- `pay_status_1`: Repayment status, latest month
- `pay_status_2`: Repayment status, 2 months ago
- `pay_status_3`: Repayment status, 3 months ago
- `pay_status_4`: Repayment status, 4 months ago
- `pay_status_5`: Repayment status, 5 months ago
- `pay_status_6`: Repayment status, 6 months ago
- `utilisation_latest`: Latest balance as share of limit
- `utilisation_avg`: Average balance as share of limit
- `months_late`: Months paid late (of 6)
- `worst_delay`: Longest delay (months)
- `repayment_ratio`: Paid vs. billed over 5 months
- `months_paid_nothing`: Months with a bill but no payment
- `bill_trend`: Balance change over 6 months (share of limit)
- `paid_latest`: Latest payment (NT$)

## Limits
- 2005 Taiwanese credit-card data; patterns will differ for Ethiopian MSMEs, invoices or mobile lending.
- Predictions are explained with SHAP values, which describe the model, not causes.
- Limit and pricing suggestions in the app are illustrative rules, not part of the model.
