"""Write a small real sample of the UCI data for tests and CI (no download needed there).

    python scripts/make_fixture.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ml.features import INPUT_COLUMNS, TARGET, load_uci  # noqa: E402
from ml.train import DEFAULT_DATA  # noqa: E402


def main(rows=2000):
    df = load_uci(DEFAULT_DATA)
    sample = df.sample(n=rows, random_state=7)[INPUT_COLUMNS + [TARGET]]
    out = ROOT / "tests" / "fixtures" / "sample.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    sample.to_csv(out, index=False)
    print(f"Wrote {len(sample)} rows to {out}")


if __name__ == "__main__":
    main()
