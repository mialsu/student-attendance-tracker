"""RegistrationCode model for controlling signup access."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RegistrationCode(Base):
    """Registration code model for controlled user signup."""

    __tablename__ = "registration_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(
        String(16), unique=True, nullable=False, index=True
    )
    email_restriction: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    used_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc),
    )
    # INV-6: past this moment the code can never be redeemed. NOT NULL and no default, so a
    # code path that forgets to set a lifetime is refused by the database rather than by review.
    # The lifetime itself lives in registration_code_service.CODE_LIFETIME.
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    used_by: Mapped["User"] = relationship(
        "User", foreign_keys=[used_by_user_id], back_populates="used_codes"
    )

    def __repr__(self) -> str:
        return f"<RegistrationCode(id={self.id}, code={self.code}, used={self.used})>"
