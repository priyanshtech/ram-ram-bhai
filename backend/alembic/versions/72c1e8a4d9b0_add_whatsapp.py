"""Add workspace WhatsApp accounts, chat allowlist, identities and delivery receipts."""

from alembic import op
import sqlalchemy as sa

revision = "72c1e8a4d9b0"
down_revision = "d453b642f5f8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "conversations",
        sa.Column("channel", sa.String(), nullable=False, server_default="widget"),
    )
    op.create_table(
        "whatsapp_accounts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "bot_id",
            sa.String(),
            sa.ForeignKey("bots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "connect_requested", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("paused", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "changed_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
    )
    op.create_table(
        "whatsapp_chats",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "account_id",
            sa.String(),
            sa.ForeignKey("whatsapp_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False, server_default=""),
        sa.Column("phone", sa.String()),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "changed_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.Column("last_message_at", sa.DateTime()),
    )
    op.create_index("ix_whatsapp_chats_account_id", "whatsapp_chats", ["account_id"])
    op.create_table(
        "whatsapp_identities",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "account_id",
            sa.String(),
            sa.ForeignKey("whatsapp_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "chat_id",
            sa.String(),
            sa.ForeignKey("whatsapp_chats.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("jid", sa.String(), nullable=False),
        sa.UniqueConstraint("account_id", "jid", name="uq_whatsapp_identity"),
    )
    op.create_index(
        "ix_whatsapp_identities_chat_id", "whatsapp_identities", ["chat_id"]
    )
    op.create_table(
        "whatsapp_receipts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "account_id",
            sa.String(),
            sa.ForeignKey("whatsapp_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "chat_id",
            sa.String(),
            sa.ForeignKey("whatsapp_chats.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("message_id", sa.String(), nullable=False),
        sa.Column(
            "conversation_id",
            sa.String(),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
        ),
        sa.Column("account_revision", sa.Integer(), nullable=False),
        sa.Column("chat_revision", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("reply", sa.Text()),
        sa.Column("citations_json", sa.JSON()),
        sa.Column(
            "fallback_triggered",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("account_id", "message_id", name="uq_whatsapp_message"),
    )


def downgrade():
    for table in (
        "whatsapp_receipts",
        "whatsapp_identities",
        "whatsapp_chats",
        "whatsapp_accounts",
    ):
        op.drop_table(table)
    op.drop_column("conversations", "channel")
