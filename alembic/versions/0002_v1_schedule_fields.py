"""v1 schedule fields and destination uniqueness

Revision ID: 0002_v1_schedule_fields
Revises: 0001_initial
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_v1_schedule_fields"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("schedules", sa.Column("weekday", sa.Integer(), nullable=True))
    op.add_column("schedules", sa.Column("run_time", sa.String(length=5), nullable=True))
    op.add_column("schedules", sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.add_column("delivery_logs", sa.Column("duration_ms", sa.Integer(), nullable=True))
    op.create_unique_constraint("uq_destination_account_peer", "destinations", ["account_id", "telegram_peer_id"])


def downgrade() -> None:
    op.drop_constraint("uq_destination_account_peer", "destinations", type_="unique")
    op.drop_column("delivery_logs", "duration_ms")
    op.drop_column("schedules", "updated_at")
    op.drop_column("schedules", "run_time")
    op.drop_column("schedules", "weekday")
