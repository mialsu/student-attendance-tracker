"""Attendance Record model."""

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.class_ import Class
    from app.models.student import Student


class AttendanceRecord(Base):
    """Attendance record for a student in a class."""

    __tablename__ = "attendance_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    class_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("classes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Student foreign key
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # DEPRECATED: Keep for backward compatibility (nullable, will be dropped in Phase 5)
    student_first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    student_last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    class_: Mapped["Class"] = relationship("Class", back_populates="attendance_records")
    student: Mapped["Student"] = relationship("Student", back_populates="attendance_records")

    # Indexes for performance
    __table_args__ = (
        # Note: class_id already has index=True on the column definition above
        Index("ix_attendance_timestamp", "timestamp"),
        Index("ix_attendance_student_name", "student_last_name", "student_first_name"),
    )

    def __repr__(self) -> str:
        student_name = self.student.name if self.student else "Unknown"
        return f"<AttendanceRecord(id={self.id}, student={student_name})>"
