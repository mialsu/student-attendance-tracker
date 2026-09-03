"""Add Student model

Revision ID: 01edea317e5e
Revises: 8983c7b4699d
Create Date: 2026-02-27 21:34:09.086819

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '01edea317e5e'
down_revision: Union[str, None] = '8983c7b4699d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Migrate from denormalized student names to normalized Student entity.

    Strategy:
    1. Create students table
    2. Extract unique students from attendance_records (case-insensitive)
    3. Add student_id column (nullable)
    4. Populate student_id by matching names
    5. Verify all records have student_id
    6. Make student_id NOT NULL and add constraints
    7. Drop old student_first_name and student_last_name columns
    """

    # STEP 1: Create students table
    op.create_table('students',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('class_id', sa.UUID(), nullable=False),
    sa.Column('course_credit_received', sa.Boolean(), nullable=False, server_default='false'),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['class_id'], ['classes.id'], name=op.f('fk_students_class_id_classes'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_students'))
    )
    op.create_index(op.f('ix_students_class_id'), 'students', ['class_id'], unique=False)
    op.create_index('ix_students_name_class_unique', 'students', [sa.literal_column('lower(name)'), 'class_id'], unique=True)

    # STEP 2: Populate students table from existing attendance_records
    # Extract unique (first_name, last_name, class_id) combinations
    # Use INITCAP(LOWER()) for consistent capitalization and grouping
    op.execute(text("""
        INSERT INTO students (id, name, class_id, course_credit_received, created_at)
        SELECT
            gen_random_uuid() as id,
            INITCAP(LOWER(student_first_name)) || ' ' || INITCAP(LOWER(student_last_name)) as name,
            class_id,
            false as course_credit_received,
            MIN(created_at) as created_at
        FROM attendance_records
        GROUP BY
            LOWER(student_first_name),
            LOWER(student_last_name),
            class_id
    """))

    # STEP 3: Add student_id column to attendance_records (nullable)
    op.add_column('attendance_records', sa.Column('student_id', sa.UUID(), nullable=True))

    # STEP 4: Populate student_id by matching names (case-insensitive)
    op.execute(text("""
        UPDATE attendance_records ar
        SET student_id = s.id
        FROM students s
        WHERE ar.class_id = s.class_id
          AND LOWER(ar.student_first_name || ' ' || ar.student_last_name) = LOWER(s.name)
    """))

    # STEP 5: Verify all records have student_id (safety check)
    connection = op.get_bind()
    result = connection.execute(text(
        "SELECT COUNT(*) FROM attendance_records WHERE student_id IS NULL"
    ))
    count = result.scalar()
    if count > 0:
        raise Exception(
            f"Migration failed: {count} attendance records without student_id. "
            f"Check for data inconsistencies."
        )

    # STEP 6: Make student_id NOT NULL and add constraints
    op.alter_column('attendance_records', 'student_id', nullable=False)
    op.create_index(op.f('ix_attendance_records_student_id'), 'attendance_records', ['student_id'], unique=False)
    op.create_foreign_key(op.f('fk_attendance_records_student_id_students'), 'attendance_records', 'students', ['student_id'], ['id'], ondelete='CASCADE')

    # STEP 7: Make old columns nullable for backward compatibility
    # Keep these columns for gradual frontend migration (can be dropped in Phase 5)
    op.alter_column('attendance_records', 'student_first_name',
                    existing_type=sa.String(length=100),
                    nullable=True)
    op.alter_column('attendance_records', 'student_last_name',
                    existing_type=sa.String(length=100),
                    nullable=True)


def downgrade() -> None:
    """
    Reverse migration: Convert from normalized Student entity back to denormalized names.

    This will split the student.name field back into first_name and last_name.
    """

    # Add back old columns
    op.add_column('attendance_records', sa.Column('student_first_name', sa.String(length=100), nullable=True))
    op.add_column('attendance_records', sa.Column('student_last_name', sa.String(length=100), nullable=True))

    # Populate old columns from students table (split name on first space)
    op.execute(text("""
        UPDATE attendance_records ar
        SET
            student_first_name = SPLIT_PART(s.name, ' ', 1),
            student_last_name = SUBSTRING(s.name FROM POSITION(' ' IN s.name) + 1)
        FROM students s
        WHERE ar.student_id = s.id
    """))

    # Handle edge case: names without spaces (single-word names)
    # Set last_name to empty string if it's NULL (which means no space in name)
    op.execute(text("""
        UPDATE attendance_records
        SET student_last_name = ''
        WHERE student_last_name IS NULL OR student_last_name = ''
    """))

    # Make old columns NOT NULL
    op.alter_column('attendance_records', 'student_first_name', nullable=False)
    op.alter_column('attendance_records', 'student_last_name', nullable=False)

    # Recreate old index
    op.create_index('ix_attendance_student_name', 'attendance_records', ['student_last_name', 'student_first_name'], unique=False)

    # Drop foreign key and index for student_id
    op.drop_constraint(op.f('fk_attendance_records_student_id_students'), 'attendance_records', type_='foreignkey')
    op.drop_index(op.f('ix_attendance_records_student_id'), table_name='attendance_records')

    # Drop student_id column
    op.drop_column('attendance_records', 'student_id')

    # Drop students table
    op.drop_index('ix_students_name_class_unique', table_name='students')
    op.drop_index(op.f('ix_students_class_id'), table_name='students')
    op.drop_table('students')
