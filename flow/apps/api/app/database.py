import os
from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

DB_URL = settings.DATABASE_URL
_is_sqlite = DB_URL.startswith("sqlite")

# Ensure the SQLite data directory exists (e.g. apps/api/data/).
if _is_sqlite:
    _path = DB_URL.split(":///", 1)[-1]
    if _path and _path != ":memory:":
        os.makedirs(os.path.dirname(_path), exist_ok=True)

engine = create_async_engine(
    DB_URL,
    echo=settings.DEBUG,
    # pool_pre_ping is a no-op on SQLite and pulls in extra round-trips elsewhere.
    pool_pre_ping=not _is_sqlite,
    connect_args={"timeout": 30} if _is_sqlite else {},
)

if _is_sqlite:
    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")   # enforce FKs (off by default)
        cur.execute("PRAGMA journal_mode=WAL")  # better concurrent read/write
        cur.close()


AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create tables if missing (SQLite path — no Alembic needed at runtime)."""
    import app.models  # noqa: F401 — registers all models on Base.metadata
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
