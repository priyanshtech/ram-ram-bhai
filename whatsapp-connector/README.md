# Local WhatsApp automation

One linked WhatsApp account per workspace. Incoming **text messages in enabled individual chats** are answered by the selected existing AI assistant and its knowledge base. Groups, broadcasts, newsletters, media, outgoing messages and history replay are excluded. New chats start off.

The Next.js dashboard calls FastAPI using the existing login. FastAPI stores accounts, chat selections, phone/privacy-ID aliases and message receipts. A local Node.js service maintains the Baileys connection and calls authenticated internal FastAPI endpoints. Native runs listen on `127.0.0.1`. Docker binds the connector within the Compose network without publishing its port.

This integration follows the connection, discovery and allowlist design of [RudraO2/Whatsapp-automation](https://github.com/RudraO2/Whatsapp-automation), using [Baileys](https://github.com/WhiskeySockets/Baileys) directly. It uses the existing app's AI rather than the reference repository's persona or Gemini-only implementation. Baileys is pinned to the tested release in `package-lock.json`.

## Docker

Use [Docker Compose setup](../docs/docker.md) to run the complete app locally, including PostgreSQL, Redis, and the ingestion worker. Docker keeps the connector private on the Compose network and stores its session in a persistent volume.

## Setup

Use Node.js 22+ and the existing backend Python environment. From the repository root:

```sh
npm ci --prefix whatsapp-connector
npm run setup --prefix whatsapp-connector
```

The setup command creates/reuses a random shared credential in `backend/.env` and `whatsapp-connector/.env`. It preserves the existing database, AI and other configuration. Credentials and session files are ignored by Git.

Apply the database migration to the database used by your backend:

```sh
cd backend
venv/bin/python -m pip install -r requirements.txt
venv/bin/python -m alembic upgrade head
venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Keep the existing Redis/ingestion worker setup running for knowledge uploads. Existing PostgreSQL databases continue to use pgvector. For a small local database, `DATABASE_URL=sqlite+aiosqlite:///./ai_support.db` is supported; set the same URL for both migrations and the server. SQLite knowledge retrieval computes cosine similarity locally. Do not replace an existing database configuration unless you intend to use a separate database.

In a second terminal, from the repository root:

```sh
cd whatsapp-connector
npm run dev
```

In a third terminal:

```sh
cd frontend
npm run dev
```

Make sure `NEXT_PUBLIC_API_URL` points to the local backend (`http://localhost:8000/api/v1`). Keep your existing frontend/Supabase login configuration. Configure your AI/embedding provider as before; enabling WhatsApp does not supply an AI API key.

Open the dashboard at `http://localhost:3000`, sign in, and choose **WhatsApp** in the sidebar:

1. Select your AI assistant and click **Connect WhatsApp**.
2. In WhatsApp on your phone, open **Linked devices → Link a device** and scan the QR.
3. Wait for chat discovery. Available chats/contacts depend on what WhatsApp syncs; new chats appear when messages arrive.

Saved contact names take precedence over profile names. The connector links phone-number and privacy-ID contacts using WhatsApp's contact fields, history mappings, and saved session mappings, and restores these details from the app database after a restart. Named chats appear first. Contacts whose names and numbers have not been shared by WhatsApp appear at the bottom with a distinct contact label until more details sync.
4. Search by name or phone number and enable only the chats you want answered.
5. Send a new text message from another account to an enabled chat. Review incoming messages and successfully delivered AI replies under **Conversations**.

An inactive AI assistant does not reply. **Pause all automation** preserves individual chat choices. **Disconnect** stops the socket but keeps credentials and choices for reconnection. **Unlink account** removes the local session and disables every chat, so pairing a different account starts without enabled automation. Reconnect automatically resumes saved connection requests after a service restart.

## Delivery behavior

Eligibility is checked before AI generation and immediately before sending. Turning a chat off, pausing, changing the assistant or disconnecting invalidates pending replies. A message already handed to WhatsApp cannot be recalled by switching a toggle off.

Each incoming message has a durable receipt. Duplicate delivery events and history replay do not trigger additional replies. The connector processes messages sequentially per account, limits queue size and rate, and expires queued work after two minutes. It ignores messages older than two minutes to avoid answering old offline backlogs. A send with an uncertain outcome is not retried, avoiding duplicate customer replies. If the backend cannot acknowledge a successful send, the message may be missing from the dashboard even though WhatsApp received it.

If a session expires, **Unlink account**, then reconnect and scan a fresh QR. Temporary network failures reconnect with backoff and retain credentials. Keep the backend and connector running while automation is required.

## Verification

```sh
cd whatsapp-connector
npm run build
npm test
```

```sh
cd backend
venv/bin/python -m pytest tests/test_whatsapp.py -q
```

The backend tests use an isolated in-memory SQLite database; they do not contact WhatsApp or modify your workspace data. They cover tenant and role boundaries, group rejection, disabled chats, aliases, AI selection, pending cancellation, duplicate messages, confirmed delivery and local knowledge retrieval. Actual account pairing and live message delivery require a phone to scan the QR.
