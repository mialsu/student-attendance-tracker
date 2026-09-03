"""Student model."""

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.attendance import AttendanceRecord
    from app.models.class_ import Class


class Student(Base):
    """Student model representing a student enrolled in a class."""

    __tablename__ = "students"

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Fields
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    class_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("classes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    course_credit_received: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        onupdate=func.now(),
        default=None,
    )

    # Relationships
    class_: Mapped["Class"] = relationship("Class", back_populates="students")
    attendance_records: Mapped[list["AttendanceRecord"]] = relationship(
        "AttendanceRecord",
        back_populates="student",
        cascade="all, delete-orphan"
    )

    # Constraints and indexes
    __table_args__ = (
        # Case-insensitive unique constraint on (name, class_id)
        Index(
            "ix_students_name_class_unique",
            func.lower(name),
            class_id,
            unique=True,
        ),
    )

    def __repr__(self) -> str:
        return f"<Student(id={self.id}, name={self.name})>"
