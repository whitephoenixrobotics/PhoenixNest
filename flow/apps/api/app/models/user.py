import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    # Nullable: Google-authenticated users have no local password.
    hashed_password: Mapped[str | None] = mapped_column(String, nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)

    # Google OAuth identity
    google_sub: Mapped[str | None] = mapped_column(String, unique=True, nullable=True, index=True)
    picture: Mapped[str | None] = mapped_column(String, nullable=True)

    # Access control
    role: Mapped[str] = mapped_column(String, nullable=False, default="user")        # user | admin
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")   # pending | approved | rejected

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    projects: Mapped[list["Project"]] = relationship("Project", back_populates="owner", cascade="all, delete-orphan")

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_approved(self) -> bool:
        return self.status == "approved"

    def public_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "picture": self.picture,
            "role": self.role,
            "status": self.status,
        }
