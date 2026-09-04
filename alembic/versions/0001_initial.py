"""initial schema

Revision ID: 0001_initial
Revises:
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("telegram_user_id", sa.BigInteger(), nullable=True),
        sa.Column("phone_hint", sa.String(length=32), nullable=True),
        sa.Column("session_name", sa.String(length=128), nullable=False),
        sa.Column("is_connected", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("owner_telegram_id"),
        sa.UniqueConstraint("session_name"),
    )
    op.create_index("ix_accounts_owner_telegram_id", "accounts", ["owner_telegram_id"])

    op.create_table(
        "destinations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("telegram_peer_id", sa.BigInteger(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_destinations_account_id", "destinations", ["account_id"])
    op.create_index("ix_destinations_telegram_peer_id", "destinations", ["telegram_peer_id"])

    op.create_table(
        "schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("destination_id", sa.Integer(), sa.ForeignKey("destinations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content_type", sa.String(length=32), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("schedule_type", sa.String(length=32), nullable=False),
        sa.Column("interval_seconds", sa.Integer(), nullable=True),
        sa.Column("cron_expr", sa.String(length=128), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_schedules_account_id", "schedules", ["account_id"])
    op.create_index("ix_schedules_destination_id", "schedules", ["destination_id"])
    op.create_index("ix_schedules_next_run_at", "schedules", ["next_run_at"])
    op.create_index("ix_schedules_enabled", "schedules", ["enabled"])

    op.create_table(
        "delivery_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("schedule_id", sa.Integer(), sa.ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("destination_id", sa.Integer(), sa.ForeignKey("destinations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("telegram_message_id", sa.BigInteger(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_delivery_logs_schedule_id", "delivery_logs", ["schedule_id"])
    op.create_index("ix_delivery_logs_destination_id", "delivery_logs", ["destination_id"])


def downgrade() -> None:
    op.drop_table("delivery_logs")
    op.drop_table("schedules")
    op.drop_table("destinations")
    op.drop_table("accounts")
