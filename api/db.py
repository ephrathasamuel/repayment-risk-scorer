"""Database tables. SQLite for local runs, PostgreSQL in Docker (set DATABASE_URL)."""

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker


def now():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))  # "admin" or "analyst"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ModelVersion(Base):
    """The model registry: one row per trained model folder."""
    __tablename__ = "model_versions"
    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[str] = mapped_column(String(64), unique=True)
    algorithm: Mapped[str] = mapped_column(String(100))
    metrics: Mapped[dict] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Application(Base):
    __tablename__ = "applications"
    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(100))
    inputs: Mapped[dict] = mapped_column(JSON)
    source: Mapped[str] = mapped_column(String(20), default="form")  # "form" or "batch"
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    decision: Mapped["Decision"] = relationship(back_populates="application", uselist=False)


class Decision(Base):
    __tablename__ = "decisions"
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"), unique=True)
    model_version: Mapped[str] = mapped_column(String(64), index=True)
    probability: Mapped[float] = mapped_column(Float)
    score: Mapped[int] = mapped_column(Integer)
    band: Mapped[str] = mapped_column(String(2), index=True)
    recommendation: Mapped[str] = mapped_column(String(20))
    contributions: Mapped[list] = mapped_column(JSON)
    offer: Mapped[dict] = mapped_column(JSON)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    application: Mapped[Application] = relationship(back_populates="decision")


class AuditEvent(Base):
    """Append-only log: who did what, and with which model version."""
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    user_email: Mapped[str] = mapped_column(String(255))
    action: Mapped[str] = mapped_column(String(50))
    model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)


def normalise_url(url):
    """Hosts such as Neon, Supabase and Render show postgres:// or postgresql:// addresses;
    SQLAlchemy needs the psycopg (v3) driver named, which is the one installed."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url.removeprefix(prefix)
    return url


def make_engine(url):
    url = normalise_url(url)
    if url.startswith("sqlite:///"):
        # data/ is git-ignored, so a fresh clone (or CI) has no folder for the database file yet.
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    kwargs = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {"pool_pre_ping": True, "pool_recycle": 300}
    return create_engine(url, **kwargs)


def make_sessionmaker(engine):
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)
