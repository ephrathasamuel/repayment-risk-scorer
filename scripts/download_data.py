"""Download the UCI "Default of Credit Card Clients" dataset into data/raw (CC BY 4.0).

    python scripts/download_data.py
"""

import io
import urllib.request
import zipfile
from pathlib import Path

URL = "https://archive.ics.uci.edu/static/public/350/default+of+credit+card+clients.zip"
RAW = Path(__file__).resolve().parent.parent / "data" / "raw"


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {URL}")
    with urllib.request.urlopen(URL, timeout=120) as resp:
        data = resp.read()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        z.extractall(RAW)
    print(f"Saved to {RAW}")


if __name__ == "__main__":
    main()
