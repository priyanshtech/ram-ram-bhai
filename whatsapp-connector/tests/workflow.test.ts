import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDirectChat, processIncoming, type Backend } from '../src/workflow.js';

const incoming = { jid: '919999999999@s.whatsapp.net', name: 'Customer', message_id: 'message-1', text: 'Price?' };

test('groups, status, newsletters and malformed identities are excluded', () => {
  for (const jid of ['123@g.us', 'status@broadcast', '123@newsletter', 'abc@lid', '', null]) assert.equal(isDirectChat(jid), false);
  assert.equal(isDirectChat('123@lid'), true);
  assert.equal(isDirectChat(incoming.jid), true);
});

test('disabled and duplicate messages do not send or authorize', async () => {
  for (const action of ['skip', 'duplicate']) {
    const paths: string[] = [];
    const backend: Backend = async (path) => { paths.push(path); return { action } as any; };
    await processIncoming('account', incoming, backend, async () => assert.fail('Unexpected send'), () => true);
    assert.deepEqual(paths, ['/accounts/account/messages']);
  }
});

test('switching off while generating prevents a reply', async () => {
  const paths: string[] = [];
  const backend: Backend = async (path) => {
    paths.push(path);
    return (path.endsWith('/authorize') ? { allowed: false } : { action: 'reply', receipt_id: 'receipt', text: 'Answer' }) as any;
  };
  await processIncoming('account', incoming, backend, async () => assert.fail('Unexpected send'), () => true);
  assert.equal(paths.length, 2);
});

test('a successful reply is authorized, sent, then acknowledged in that order', async () => {
  const events: string[] = [];
  const backend: Backend = async (path, body) => {
    events.push(path.endsWith('/messages') ? 'generate' : path.endsWith('/authorize') ? 'authorize' : `delivery:${(body as any).sent}`);
    return (path.endsWith('/authorize') ? { allowed: true } : { action: 'reply', receipt_id: 'receipt', text: 'Answer' }) as any;
  };
  await processIncoming('account', incoming, backend, async text => { assert.equal(text, 'Answer'); events.push('send'); }, () => true);
  assert.deepEqual(events, ['generate', 'authorize', 'send', 'delivery:true']);
});

test('disconnecting during generation prevents authorization and sending', async () => {
  let active = true;
  const backend: Backend = async () => { active = false; return { action: 'reply', receipt_id: 'receipt', text: 'Answer' } as any; };
  await processIncoming('account', incoming, backend, async () => assert.fail('Unexpected send'), () => active);
});

test('send failure is recorded, acknowledgement failure never retries a send', async () => {
  let sent = 0;
  let outcome: boolean | undefined;
  const backend: Backend = async (path, body) => {
    if (path.endsWith('/delivery')) { outcome = (body as any).sent; throw new Error('Backend unavailable'); }
    return (path.endsWith('/authorize') ? { allowed: true } : { action: 'reply', receipt_id: 'receipt', text: 'Answer' }) as any;
  };
  await assert.rejects(processIncoming('account', incoming, backend, async () => { sent++; }, () => true));
  assert.equal(sent, 1); assert.equal(outcome, true);
  await assert.rejects(processIncoming('account', incoming, backend, async () => { throw new Error('Send failed'); }, () => true));
  assert.equal(outcome, false);
});
