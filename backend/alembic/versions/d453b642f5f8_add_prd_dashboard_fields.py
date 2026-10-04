"""Add PRD dashboard fields

Revision ID: d453b642f5f8
Revises: 6331e969e18a
Create Date: 2026-08-07 22:42:00.885336

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd453b642f5f8'
down_revision: Union[str, Sequence[str], None] = '6331e969e18a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Bot fields
    op.add_column('bots', sa.Column('sales_instructions', sa.Text(), nullable=True))
    op.add_column('bots', sa.Column('response_length_limit', sa.String(), nullable=True, server_default='under 30 words'))
    op.add_column('bots', sa.Column('lead_qualification_questions', sa.Text(), nullable=True))
    op.add_column('bots', sa.Column('human_handoff_rules', sa.Text(), nullable=True))
    op.add_column('bots', sa.Column('business_hours', sa.String(), nullable=True))
    op.add_column('bots', sa.Column('fallback_message', sa.Text(), nullable=True, server_default="I'm sorry, I cannot help with that right now. Can I connect you to a human?"))

    # Lead fields
    op.add_column('leads', sa.Column('company', sa.String(), nullable=True))
    op.add_column('leads', sa.Column('interested_product', sa.String(), nullable=True))
    op.add_column('leads', sa.Column('requirement', sa.Text(), nullable=True))
    op.add_column('leads', sa.Column('location', sa.String(), nullable=True))
    op.add_column('leads', sa.Column('estimated_quantity', sa.String(), nullable=True))
    op.add_column('leads', sa.Column('purchase_timeline', sa.String(), nullable=True))
    op.add_column('leads', sa.Column('status', sa.String(), nullable=True, server_default='New'))
    op.add_column('leads', sa.Column('source', sa.String(), nullable=True, server_default='Chatbot'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('leads', 'source')
    op.drop_column('leads', 'status')
    op.drop_column('leads', 'purchase_timeline')
    op.drop_column('leads', 'estimated_quantity')
    op.drop_column('leads', 'location')
    op.drop_column('leads', 'requirement')
    op.drop_column('leads', 'interested_product')
    op.drop_column('leads', 'company')
    
    op.drop_column('bots', 'fallback_message')
    op.drop_column('bots', 'business_hours')
    op.drop_column('bots', 'human_handoff_rules')
    op.drop_column('bots', 'lead_qualification_questions')
    op.drop_column('bots', 'response_length_limit')
    op.drop_column('bots', 'sales_instructions')
