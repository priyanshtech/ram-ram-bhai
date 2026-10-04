import 'dotenv/config';
import { createServer } from 'node:http';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import makeWASocket, { DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore,
  normalizeMessageContent, jidNormalizedUser, type Contact, type WASocket, type WAMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { isDirectChat, processIncoming, type Backend, type Incoming } from './workflow.js';

const token = process.env.WHATSAPP_CONNECTOR_TOKEN;
if (!token || token.length < 32) throw new Error('Set WHATSAPP_CONNECTOR_TOKEN to the same random token (at least 32 characters) as the backend.');
const backendUrl = (process.env.BACKEND_URL || 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '');
const authRoot = resolve(process.env.AUTH_DIR || './sessions');
const host = process.env.HOST || '127.0.0.1';
const logger = pino({ level: 'silent' });
const sessions = new Map<string, Session>();
let shuttingDown = false;

const backend: Backend = async (path, body) => {
  const response = await fetch(`${backendUrl}/whatsapp/internal${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(body && path.endsWith('/messages') ? 180_000 : 10_000),
  });
  if (!response.ok) throw new Error(`Backend callback failed (${response.status})`);
  return response.json();
};

type DiscoveredChat = { jid: string; alternate_jid?: string; name: string };
type KnownContact = { name: string; priority: number; alternate_jid?: string };

class Session {
  socket?: WASocket;
  status = 'offline';
  qr: string | null = null;
  phone: string | null = null;
  error: string | null = null;
  stopped = false;
  starting = false;
  attempts = 0;
  generation = 0;
  reconnect?: NodeJS.Timeout;
  discoveryTimer?: NodeJS.Timeout;
  pending = new Map<string, DiscoveredChat>();
  contacts = new Map<string, KnownContact>();
  discoveryRunning = false;
  chain: Promise<void> = Promise.resolve();
  queued = 0;
  seen = new Set<string>();
  rate = new Map<string, number[]>();
  constructor(readonly id: string) {}

  view() { return { status: this.status, qr: this.qr, phone: this.phone, error: this.error }; }

  async start() {
    if (this.starting || (this.socket && !this.stopped)) return;
    this.starting = true;
    this.stopped = false;
    this.status = 'connecting';
    this.error = null;
    const generation = ++this.generation;
    try {
      const directory = resolve(authRoot, this.id);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const { state, saveCreds } = await useMultiFileAuthState(directory);
      if (this.stopped || generation !== this.generation) return;
      const socket = makeWASocket({
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        logger, markOnlineOnConnect: false, getMessage: async () => undefined,
        shouldIgnoreJid: (jid) => !isDirectChat(jidNormalizedUser(jid)),
      });
      this.socket = socket;
      const active = () => !this.stopped && this.socket === socket && generation === this.generation;
      socket.ev.on('creds.update', () => { if (active()) void saveCreds().catch(() => this.fail('Could not save WhatsApp credentials.')); });
      socket.ev.on('connection.update', (update) => {
        if (!active()) return;
        if (update.qr) {
          const rawQr = update.qr;
          this.status = 'waiting-qr';
          void QRCode.toDataURL(rawQr, { width: 280, margin: 2 }).then(qr => {
            if (active() && this.status === 'waiting-qr') this.qr = qr;
          });
        }
        if (update.connection === 'open') {
          this.status = 'connected'; this.qr = null; this.attempts = 0;
          this.phone = socket.user?.id ? jidNormalizedUser(socket.user.id).split('@')[0] : null;
          void this.restoreContacts(active);
        }
        if (update.connection === 'close') {
          this.socket = undefined; this.qr = null; this.generation++;
          const code = (update.lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
          if (code === DisconnectReason.loggedOut || code === DisconnectReason.connectionReplaced) {
            this.stopped = true;
            this.status = code === DisconnectReason.loggedOut ? 'logged-out' : 'error';
            this.error = code === DisconnectReason.loggedOut ? 'Session expired. Unlink this account and scan a new QR.' : 'This session was opened elsewhere. Disconnect it there before reconnecting.';
            return;
          }
          this.status = 'connecting';
          this.reconnect = setTimeout(() => void this.start(), Math.min(2000 * 2 ** this.attempts++, 30000));
        }
      });
      socket.ev.on('chats.upsert', chats => { if (active()) for (const c of chats) this.discover(c.id, c.name); });
      socket.ev.on('chats.update', chats => { if (active()) for (const c of chats) this.discover(c.id, c.name); });
      socket.ev.on('contacts.upsert', contacts => { if (active()) for (const c of contacts) this.discoverContact(c); });
      socket.ev.on('contacts.update', contacts => { if (active()) for (const c of contacts) this.discoverContact(c); });
      socket.ev.on('lid-mapping.update', ({ lid, pn }) => { if (active()) this.discover(lid, undefined, pn); });
      socket.ev.on('messaging-history.set', ({ chats, contacts, messages, lidPnMappings }) => {
        if (!active()) return;
        for (const c of chats) this.discover(c.id, c.name);
        for (const c of contacts) this.discoverContact(c);
        for (const { lid, pn } of lidPnMappings || []) this.discover(lid, undefined, pn);
        for (const m of messages) this.discover(m.key.remoteJid, m.key.fromMe ? undefined : m.pushName, m.key.remoteJidAlt);
        // History is discovery only: never feed it into the automation.
      });
      socket.ev.on('messages.upsert', ({ messages, type }) => {
        if (!active()) return;
        for (const message of messages) {
          const jid = message.key.remoteJid && jidNormalizedUser(message.key.remoteJid);
          if (!isDirectChat(jid)) continue;
          this.discover(jid, message.key.fromMe ? undefined : message.pushName, message.key.remoteJidAlt);
          if (type !== 'notify' || message.key.fromMe || !message.key.id) continue;
          // Ignore old offline backlog. It must not become a new reply on reconnect.
          const timestamp = Number(message.messageTimestamp || 0) * 1000;
          if (!timestamp || timestamp < Date.now() - 120_000) continue;
          const content = normalizeMessageContent(message.message);
          const text = content?.conversation || content?.extendedTextMessage?.text;
          if (!text?.trim() || text.length > 10000) continue;
          if (this.seen.has(message.key.id)) continue;
          this.seen.add(message.key.id);
          if (this.seen.size > 10000) this.seen.delete(this.seen.values().next().value!);
          const alternate = message.key.remoteJidAlt && jidNormalizedUser(message.key.remoteJidAlt);
          const incoming: Incoming = { jid, name: this.contacts.get(jid)?.name || message.pushName || '', message_id: message.key.id, text, received_at: new Date().toISOString(),
            ...(isDirectChat(alternate) ? { alternate_jid: alternate } : {}) };
          this.enqueue(incoming, message, socket, active);
        }
      });
    } catch {
      this.fail('Unable to start WhatsApp. Check your network and restart the connection.');
    } finally { this.starting = false; }
  }

  fail(message: string) { this.status = 'error'; this.error = message; console.error(`[WhatsApp ${this.id}] ${message}`); }

  rememberContact(raw?: string | null, name?: string | null, alt?: string | null, priority = 1): DiscoveredChat | undefined {
    const jid = raw && jidNormalizedUser(raw);
    if (!isDirectChat(jid)) return;
    const candidate = alt && jidNormalizedUser(alt);
    const alternate = isDirectChat(candidate) && candidate !== jid ? candidate : this.contacts.get(jid)?.alternate_jid;
    let best = { name: '', priority: 0 };
    for (const previous of [this.contacts.get(jid), alternate ? this.contacts.get(alternate) : undefined]) {
      if (previous?.name && previous.priority >= best.priority) best = previous;
    }
    const trimmed = name?.trim().slice(0, 200);
    if (trimmed && priority >= best.priority) best = { name: trimmed, priority };
    this.contacts.set(jid, { ...best, ...(alternate ? { alternate_jid: alternate } : {}) });
    if (alternate) this.contacts.set(alternate, { ...best, alternate_jid: jid });
    return { jid, name: best.name, ...(alternate ? { alternate_jid: alternate } : {}) };
  }

  discover(raw?: string | null, name?: string | null, alt?: string | null, priority = 1) {
    const contact = this.rememberContact(raw, name, alt, priority);
    if (!contact) return;
    this.pending.set(contact.jid, contact);
    if (!this.discoveryTimer) this.discoveryTimer = setTimeout(() => void this.flushDiscovery(), 1000);
  }

  discoverContact(contact: Partial<Contact>) {
    const name = contact.name?.trim() || contact.verifiedName?.trim() || contact.notify?.trim() || contact.username?.trim();
    const id = contact.id && jidNormalizedUser(contact.id);
    const alternate = id?.endsWith('@lid') ? contact.phoneNumber : contact.lid;
    // A saved address-book name takes precedence over a sender's profile name.
    this.discover(id, name, alternate, contact.name?.trim() ? 3 : 2);
  }

  async restoreContacts(active: () => boolean) {
    try {
      const contacts = await backend<DiscoveredChat[]>(`/accounts/${this.id}/chats`);
      if (!active()) return;
      for (const contact of contacts) this.discover(contact.jid, contact.name, contact.alternate_jid);
    } catch {
      if (active()) this.error = 'Saved contacts could not be loaded. Reconnect to retry.';
    }
  }

  async flushDiscovery() {
    if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
    this.discoveryTimer = undefined;
    if (this.discoveryRunning || this.stopped || !this.pending.size) return;
    this.discoveryRunning = true;
    let batch = [...this.pending.values()].slice(0, 500);
    for (const c of batch) this.pending.delete(c.jid);
    try {
      const lids = batch.filter(c => c.jid.endsWith('@lid') && !c.alternate_jid).map(c => c.jid);
      // Reuse WhatsApp's saved mappings; this lookup does not request phone numbers from contacts.
      const mappings = await this.socket?.signalRepository.lidMapping.getPNsForLIDs(lids);
      for (const { lid, pn } of mappings || []) this.rememberContact(lid, undefined, pn);
      // Later contact/mapping events may have supplied a better name since this batch was queued.
      batch = batch.map(c => this.rememberContact(c.jid) || c);
      if (this.stopped) return;
      await backend(`/accounts/${this.id}/chats`, { chats: batch });
    }
    catch {
      for (const c of batch) if (!this.pending.has(c.jid)) this.pending.set(c.jid, c);
      this.error = 'Chat discovery could not reach the backend. Retrying.';
    } finally {
      this.discoveryRunning = false;
      if (this.pending.size && !this.stopped) this.discoveryTimer = setTimeout(() => void this.flushDiscovery(), 5000);
    }
  }

  enqueue(incoming: Incoming, message: WAMessage, socket: WASocket, active: () => boolean) {
    if (this.queued >= 50) return;
    this.queued++;
    const expires = Date.now() + 120_000;
    this.chain = this.chain.then(async () => {
      if (!active() || Date.now() > expires || this.status !== 'connected') return;
      const key = incoming.alternate_jid?.endsWith('@s.whatsapp.net') ? incoming.alternate_jid : incoming.jid;
      const recent = (this.rate.get(key) || []).filter(t => Date.now() - t < 60000);
      if (recent.length >= 20) return;
      recent.push(Date.now()); this.rate.set(key, recent);
      await processIncoming(this.id, incoming, backend,
        async text => { await socket.sendMessage(incoming.jid, { text }, { quoted: message }); },
        () => active() && this.status === 'connected' && Date.now() < expires);
      if (active() && this.error === 'A reply could not be completed. Check the backend and AI settings.') this.error = null;
    }).catch(() => {
      this.error = 'A reply could not be completed. Check the backend and AI settings.';
      console.error(`[WhatsApp ${this.id}] Reply processing failed; message will not be resent.`);
    }).finally(() => { this.queued--; });
  }

  async stop(logout = false) {
    this.stopped = true; this.generation++;
    if (this.reconnect) clearTimeout(this.reconnect);
    if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
    const socket = this.socket; this.socket = undefined;
    this.status = 'offline'; this.qr = null; this.error = null; this.phone = null;
    if (socket) {
      if (logout) await socket.logout().catch(() => {});
      socket.end(new Error('Disconnected by workspace owner'));
    }
    if (logout) {
      this.contacts.clear(); this.pending.clear();
      await rm(resolve(authRoot, this.id), { recursive: true, force: true });
    }
  }
}

// Reconcile durable connection requests after either service restarts.
let reconciling = false;
async function reconcile() {
  if (reconciling || shuttingDown) return;
  reconciling = true;
  try {
    const requested = await backend<{ id: string }[]>('/accounts');
    const wanted = new Set(requested.map(a => a.id));
    for (const [id, session] of sessions) if (!wanted.has(id) && !session.stopped) await session.stop();
    for (const { id } of requested) {
      if (!/^[a-f0-9-]{36}$/.test(id)) continue;
      let session = sessions.get(id);
      if (!session) { session = new Session(id); sessions.set(id, session); void session.start(); }
      // Explicit logged-out/error states wait for the user's reconnect action.
    }
  } catch { /* Backend may start after the connector; fail closed until it is available. */ }
  finally { reconciling = false; }
}

const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const supplied = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${token}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return;
  }
  const match = req.url?.match(/^\/accounts\/([a-f0-9-]{36})(?:\/(connect|disconnect|logout))?$/);
  if (!match) { res.writeHead(404); res.end('{}'); return; }
  const [, id, action] = match;
  try {
    let session = sessions.get(id);
    if (req.method === 'GET' && !action) {
      res.end(JSON.stringify(session?.view() || { status: 'offline', qr: null })); return;
    }
    if (req.method !== 'POST' || !action) { res.writeHead(405); res.end('{}'); return; }
    if (action === 'connect') {
      if (!session) { session = new Session(id); sessions.set(id, session); }
      void session.start();
    } else {
      if (!session) { session = new Session(id); sessions.set(id, session); }
      await session.stop(action === 'logout');
    }
    res.end(JSON.stringify(session.view()));
  } catch { res.writeHead(500); res.end(JSON.stringify({ error: 'Connector operation failed' })); }
});
server.listen(Number(process.env.PORT || 3101), host, () => {
  console.log(`WhatsApp connector listening on ${host}. Open the WhatsApp page in your dashboard to pair.`);
  void reconcile();
});
const reconciliationTimer = setInterval(() => void reconcile(), 5000);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => {
  shuttingDown = true; clearInterval(reconciliationTimer); server.close();
  await Promise.all([...sessions.values()].map(s => s.stop()));
  process.exit(0);
});
