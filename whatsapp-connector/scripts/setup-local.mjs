import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';

const backendFile = new URL('../../backend/.env', import.meta.url);
const connectorFile = new URL('../.env', import.meta.url);
const read = async file => readFile(file, 'utf8').catch(error => {
  if (error.code === 'ENOENT') return '';
  throw error;
});
const backend = await read(backendFile);
const connector = await read(connectorFile);
const backendConfig = parse(backend);
const connectorConfig = parse(connector);
const existing = backendConfig.WHATSAPP_CONNECTOR_TOKEN || connectorConfig.WHATSAPP_CONNECTOR_TOKEN;
const token = existing && existing.length >= 32 ? existing : randomBytes(32).toString('hex');
function set(text, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(text) ? text.replace(pattern, line) : `${text}${text.endsWith('\n') || !text ? '' : '\n'}${line}\n`;
}
let backendNext = set(backend, 'WHATSAPP_CONNECTOR_TOKEN', token);
if (!backendConfig.WHATSAPP_CONNECTOR_URL) backendNext = set(backendNext, 'WHATSAPP_CONNECTOR_URL', 'http://127.0.0.1:3101');
let connectorNext = set(connector, 'WHATSAPP_CONNECTOR_TOKEN', token);
if (!connectorConfig.BACKEND_URL) connectorNext = set(connectorNext, 'BACKEND_URL', 'http://127.0.0.1:8000/api/v1');
if (!connectorConfig.PORT) connectorNext = set(connectorNext, 'PORT', '3101');
if (!connectorConfig.AUTH_DIR) connectorNext = set(connectorNext, 'AUTH_DIR', './sessions');
await writeFile(backendFile, backendNext, { mode: 0o600 });
await writeFile(connectorFile, connectorNext, { mode: 0o600 });
console.log('Matching connector credentials saved in backend/.env and whatsapp-connector/.env. Other settings were preserved. Restart the backend to load them.');
