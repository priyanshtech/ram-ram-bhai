export function isDirectChat(jid: string | null | undefined): jid is string {
  return !!jid && /^\d+@(s\.whatsapp\.net|lid)$/.test(jid);
}

export type Incoming = {
  jid: string; alternate_jid?: string; name: string; message_id: string; text: string; received_at?: string;
};
export type Backend = <T = any>(path: string, body?: unknown) => Promise<T>;

// Injectable boundaries let us verify the real eligibility/send ordering without WhatsApp access.
export async function processIncoming(
  accountId: string, incoming: Incoming, backend: Backend,
  send: (text: string) => Promise<void>, active: () => boolean,
): Promise<void> {
  if (!isDirectChat(incoming.jid) || !incoming.text.trim() || !active()) return;
  const base = `/accounts/${accountId}`;
  const reply = await backend<{ action: string; receipt_id?: string; text?: string }>(`${base}/messages`, incoming);
  if (reply.action !== 'reply' || !reply.receipt_id || !reply.text || !active()) return;
  const path = `${base}/receipts/${reply.receipt_id}`;
  const authorization = await backend<{ allowed: boolean }>(`${path}/authorize`, {});
  if (!authorization.allowed || !active()) return;
  try {
    await send(reply.text);
  } catch (error) {
    await backend(`${path}/delivery`, { sent: false }).catch(() => {});
    throw error;
  }
  // An acknowledgement failure must NEVER cause a second send.
  await backend(`${path}/delivery`, { sent: true });
}
