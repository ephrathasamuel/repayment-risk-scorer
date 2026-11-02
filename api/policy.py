"""Illustrative credit policy: turns a risk band into a suggested limit and price.

These rules are made up for the demo to show where a lender's own policy would
plug in. They are not learned from data and are not advice.
"""

LIMIT_FACTOR = {"A": 1.25, "B": 1.0, "C": 0.75, "D": 0.4, "E": 0.0}
BASE_RATE = 12.0  # % a year
MARGIN = {"A": 2.0, "B": 4.0, "C": 7.0, "D": 11.0, "E": None}


def offer(band, current_limit):
    factor = LIMIT_FACTOR[band]
    limit = int(round(current_limit * factor / 1000.0)) * 1000
    margin = MARGIN[band]
    return {
        "illustrative": True,
        "suggested_limit": limit,
        "limit_factor": factor,
        "annual_rate_pct": None if margin is None else BASE_RATE + margin,
        "pricing_band": band,
        "note": "Illustrative policy rules, not part of the model.",
    }
