import pytest

from api.db import normalise_url


@pytest.mark.parametrize("given,expected", [
    # Neon, Supabase and Render show these forms; the app installs the psycopg 3 driver.
    ("postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require",
     "postgresql+psycopg://u:p@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require"),
    ("postgres://u:p@host:5432/db", "postgresql+psycopg://u:p@host:5432/db"),
    # Already explicit, or not PostgreSQL: unchanged.
    ("postgresql+psycopg://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
    ("sqlite:///data/app.db", "sqlite:///data/app.db"),
])
def test_database_url_from_hosts_is_accepted(given, expected):
    assert normalise_url(given) == expected
