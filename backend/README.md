# AI Customer Support SaaS Backend

This is a multi-tenant FastAPI backend for an AI customer support SaaS platform.

## Features

- **Strict Tenant Isolation**: All endpoints verify tenant and bot ownership.
- **RAG Engine**: Uses PostgreSQL with `pgvector` for semantic search.
- **Idempotent Ingestion**: Background worker uses `arq` to safely parse and ingest URLs, PDFs, and FAQs.
- **SSE Streaming**: Real-time token streaming to the visitor widget.
- **Widget Security**: Validates `Origin` header dynamically against tenant-configured domains.
- **SSRF Protection**: Blocks internal/private IP ranges during URL ingestion.

## Setup

1. Install dependencies: `pip install -r requirements.txt`
2. Run Postgres with `pgvector` and Redis locally.
3. Copy `.env.example` to `.env` and adjust settings.
4. Run migrations: `alembic upgrade head`
5. Run server: `fastapi run app/main.py`
6. Run worker: `arq app.workers.ingestion_worker.WorkerSettings`

## Tests

Run `pytest` to execute all tests including strict security boundary checks.
