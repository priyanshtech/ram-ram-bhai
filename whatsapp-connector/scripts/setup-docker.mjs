import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import './setup-local.mjs';

const rootFile = new URL('../../.env', import.meta.url);
const backend = parse(await readFile(new URL('../../backend/.env', import.meta.url), 'utf8'));
const frontend = parse(await readFile(new URL('../../frontend/.env.local', import.meta.url), 'utf8'));
const previous = await readFile(rootFile, 'utf8').catch(error => {
  if (error.code === 'ENOENT') return '';
  throw error;
});
function set(text, key, value) {
  const line = `${key}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(text) ? text.replace(pattern, line) : `${text}${text.endsWith('\n') || !text ? '' : '\n'}${line}\n`;
}
let next = previous;
for (const [key, value] of Object.entries({
  WHATSAPP_CONNECTOR_TOKEN: backend.WHATSAPP_CONNECTOR_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: frontend.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: frontend.NEXT_PUBLIC_SUPABASE_ANON_KEY,
})) {
  if (!value) throw new Error(`Configure ${key} in the existing app environment before Docker setup.`);
  next = set(next, key, value);
}
if (process.argv.includes('--existing-database')) {
  if (!backend.DATABASE_URL) throw new Error('No existing DATABASE_URL configured.');
  next = set(next, 'DOCKER_DATABASE_URL', backend.DATABASE_URL);
} else if (!parse(previous).DOCKER_DATABASE_URL || process.argv.includes('--local-database')) {
  next = set(next, 'DOCKER_DATABASE_URL', 'postgresql+asyncpg://konvertai:konvertai-local@postgres:5432/konvertai');
}
await writeFile(rootFile, next, { mode: 0o600 });
console.log('Docker environment saved in the ignored root .env. Run docker compose up --build -d.');
