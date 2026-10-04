# Run Konvert AI locally with Docker

Docker Compose runs the frontend, FastAPI backend, knowledge ingestion worker, PostgreSQL with pgvector, Redis, and the WhatsApp connector. Database tables are migrated automatically before the backend starts.

## Start

Docker Desktop must be running. The first setup reuses AI and Google/Supabase login configuration from `backend/.env` and `frontend/.env.local`, creates matching connector credentials, and writes Docker variables to the ignored root `.env`:

```sh
npm ci --prefix whatsapp-connector
npm run setup:docker --prefix whatsapp-connector -- --local-database
docker compose up --build -d --wait
```

After setup, start or rebuild everything with:

```sh
docker compose up --build -d --wait
```

- App: http://127.0.0.1:3000
- API/docs: http://127.0.0.1:8000/docs
- WhatsApp: http://127.0.0.1:3000/whatsapp

Sign in using the existing Google login. The separate local database starts empty; configure the local assistant and upload its knowledge before enabling chats. AI calls still use the existing provider keys and models. WhatsApp remains disconnected until you explicitly connect it in the dashboard.

The new Compose project is named `konvertai-local`. PostgreSQL, Redis, and the connector are accessible only inside its Docker network. Host ports 3000 and 8000 are bound to localhost. It can run alongside the older `ai-support-postgres` and `ai-support-redis` containers without taking their ports.

## Local AI replies

Set these values in `backend/.env` to use Google's hosted Gemma model for the simulator, widget, and WhatsApp:

```dotenv
LLM_PROVIDER=gemini
LLM_MODEL=gemma-4-26b-a4b-it
GEMINI_API_KEY=your_google_ai_studio_key
DEVELOPMENT_MOCK_AI=false
```

Replies use the Google Gen AI SDK with high thinking, the saved assistant instructions, and retrieved knowledge. Knowledge embeddings still use the configured OpenRouter embedding model; keep its key/model/dimensions unchanged to reuse existing indexed documents.

If the embedding API is rate-limited or unavailable, replies search the stored knowledge text locally and continue with the configured chat model. This fallback ranks matching passages by keywords, so its results can differ from vector search. It preserves the existing knowledge vectors and uses the same grounding rules. Uploading/indexing new knowledge still requires the embedding service.

After backend configuration changes, recreate the API and worker:

```sh
docker compose up --build -d --wait backend worker
```

## Storage and maintenance

Named volumes preserve PostgreSQL data, Redis jobs, knowledge uploads, and WhatsApp credentials across rebuilds and restarts. Both the backend and worker use the same uploads volume. Frontend public settings and the generated widget API host are applied at build time, so rebuild the frontend if these change.

```sh
# Inspect the services and health checks
docker compose ps

# Follow logs
docker compose logs -f backend worker

# Stop the app while preserving data
docker compose down

# Start it again
docker compose up -d --wait
```

`docker compose down -v` deletes this stack's local database, uploaded files, and saved WhatsApp session. Normal stopping does not delete them.

## Optional existing database

To deliberately use the database configured in `backend/.env` instead of the dedicated local database:

```sh
npm run setup:docker --prefix whatsapp-connector -- --existing-database
docker compose up --build -d --wait
```

This applies the app's pending Alembic migrations to that selected database. Choose the local option above when you want an isolated Docker workspace.

For native development commands and WhatsApp behavior, see [WhatsApp setup](../whatsapp-connector/README.md).

## Connect WhatsApp

Open **WhatsApp** in the dashboard, select your AI assistant, and click **Connect WhatsApp**. On your phone, open **WhatsApp → Linked devices → Link a device** and scan the QR code.

Search the discovered chats and switch automation on for the individual chats you want answered. New chats start off. Replies use your assistant's AI configuration and knowledge base; group chats and media are excluded. **Pause all automation** saves your chat selections while pausing replies.
