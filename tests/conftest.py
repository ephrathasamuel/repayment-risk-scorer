import os
from pathlib import Path

import pytest

FIXTURE = Path(__file__).parent / "fixtures" / "sample.csv"

# Test-only credentials, set before the app reads its settings.
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.pop("ANTHROPIC_API_KEY", None)

ADMIN = ("admin@test.local", "admin-pass-123")
ANALYST = ("analyst@test.local", "analyst-pass-123")


@pytest.fixture(scope="session")
def models_dir(tmp_path_factory):
    """Train two small model versions on the real 2,000-row sample (takes a few seconds)."""
    from ml.train import train
    out = tmp_path_factory.mktemp("models")
    train(FIXTURE, out, version="v-test-1", quiet=True)
    train(FIXTURE, out, version="v-test-2", quiet=True)
    return out


@pytest.fixture
def make_client(tmp_path, models_dir):
    from fastapi.testclient import TestClient

    from api.config import Settings
    from api.main import create_app

    clients = []

    def _make(ai_client=None, demo=False):
        cfg = Settings()
        cfg.demo_account = demo
        cfg.database_url = f"sqlite:///{(tmp_path / 'test.db').as_posix()}"
        cfg.models_dir = models_dir
        cfg.seed_users = [(*ADMIN, "admin"), (*ANALYST, "analyst")]
        c = TestClient(create_app(cfg, ai_client=ai_client))
        c.__enter__()
        clients.append(c)
        return c

    yield _make
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def client(make_client):
    return make_client()


def sign_in(client, who):
    r = client.post("/api/auth/login", json={"email": who[0], "password": who[1]})
    assert r.status_code == 200, r.text
    return r


GOOD = {
    "reference": "ACME Traders",
    "credit_limit": 200000, "age": 38, "education": 1,
    "pay_status": [0, 0, 0, 0, 0, 0],
    "bill_amounts": [52000, 49000, 51000, 47000, 45000, 43000],
    "paid_amounts": [3000, 2500, 2600, 2400, 2200, 2000],
}

RISKY = {
    "reference": "Late Payer Ltd",
    "credit_limit": 20000, "age": 25, "education": 3,
    "pay_status": [3, 2, 2, 2, 2, 2],
    "bill_amounts": [19500, 19000, 18500, 18000, 17500, 17000],
    "paid_amounts": [0, 0, 0, 0, 0, 0],
}
