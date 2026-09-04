"""support center for Kronos Self

Revision ID: 0003_support_center
Revises: 0002_v1_schedule_fields
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_support_center"
down_revision = "0002_v1_schedule_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.String(length=32), nullable=False),
        sa.Column("requester_telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("priority", sa.String(length=16), nullable=False, server_default="normal"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("public_id", name="uq_support_ticket_public_id"),
    )
    op.create_index("ix_support_tickets_requester", "support_tickets", ["requester_telegram_id"])
    op.create_index("ix_support_tickets_status", "support_tickets", ["status"])
    op.create_table(
        "support_ticket_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("author_role", sa.String(length=16), nullable=False, server_default="user"),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("attachments", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_support_ticket_messages_ticket", "support_ticket_messages", ["ticket_id", "created_at"])
    op.create_table(
        "support_ticket_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("from_status", sa.String(length=24), nullable=True),
        sa.Column("to_status", sa.String(length=24), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_support_ticket_events_ticket", "support_ticket_events", ["ticket_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_support_ticket_events_ticket", table_name="support_ticket_events")
    op.drop_table("support_ticket_events")
    op.drop_index("ix_support_ticket_messages_ticket", table_name="support_ticket_messages")
    op.drop_table("support_ticket_messages")
    op.drop_index("ix_support_tickets_status", table_name="support_tickets")
    op.drop_index("ix_support_tickets_requester", table_name="support_tickets")
    op.drop_table("support_tickets")
