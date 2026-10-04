"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getStoredData } from "@/lib/api";
import { Smartphone, Search, Loader2, RefreshCw, MessageSquare, Pause, Play, Wifi, AlertCircle, BookOpen, Unplug } from "lucide-react";
import Link from "next/link";

const statusLabels = {
  offline: "Disconnected", connecting: "Connecting", "waiting-qr": "Scan QR code",
  connected: "Connected", unavailable: "Connector unavailable", "logged-out": "Session expired", error: "Connection error",
};

function chatDisplayName(chat) {
  return chat.name?.trim() || (chat.phone ? `+${chat.phone}` : `Contact ${chat.id.slice(0, 8)}`);
}

function Toggle({ checked, disabled, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50 ${checked ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5 ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function WhatsAppPage() {
  const router = useRouter();
  const [account, setAccount] = useState(null);
  const [connection, setConnection] = useState({ status: "offline" });
  const [bots, setBots] = useState([]);
  const [selectedBot, setSelectedBot] = useState("");
  const [chats, setChats] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const epoch = useRef(0);
  const fetching = useRef(false);
  const mutating = useRef(false);
  const tenant = useRef(null);

  const refresh = useCallback(async () => {
    if (!tenant.current || fetching.current || mutating.current) return;
    fetching.current = true;
    const requestEpoch = epoch.current;
    try {
      const [state, availableBots, availableChats] = await Promise.all([
        api.getWhatsAppAccount(tenant.current), api.getBots(tenant.current), api.getWhatsAppChats(tenant.current),
      ]);
      if (!mounted.current || requestEpoch !== epoch.current) return;
      setAccount(state.account);
      setConnection(state.connection);
      setBots(availableBots);
      setSelectedBot(previous => state.account?.bot_id || previous || availableBots[0]?.id || "");
      setChats(availableChats);
      setError("");
    } catch (err) {
      if (mounted.current && requestEpoch === epoch.current) setError(err.message);
    } finally {
      fetching.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const { tenant_id } = getStoredData();
    if (!tenant_id) { router.push("/login"); return () => { mounted.current = false; }; }
    tenant.current = tenant_id;
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [refresh, router]);

  async function perform(key, operation) {
    if (mutating.current) return;
    mutating.current = true;
    epoch.current++;
    setBusy(key); setError("");
    try {
      await operation();
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { mutating.current = false; if (mounted.current) setBusy(""); }
  }

  async function connect() {
    await perform("connect", async () => {
      const saved = await api.configureWhatsApp(tenant.current, { bot_id: selectedBot });
      if (mounted.current) setAccount(saved);
      const state = await api.connectWhatsApp(tenant.current);
      if (mounted.current) setConnection(state);
    });
  }

  async function changeBot(botId) {
    if (!account) { setSelectedBot(botId); return; }
    await perform("bot", async () => {
      const saved = await api.configureWhatsApp(tenant.current, { bot_id: botId });
      if (mounted.current) { setAccount(saved); setSelectedBot(botId); }
    });
  }

  const enabledCount = chats.filter(chat => chat.enabled).length;
  const needle = search.trim().toLowerCase();
  const visibleChats = chats.filter(chat =>
    (filter === "all" || (filter === "enabled" ? chat.enabled : !chat.enabled)) &&
    `${chat.name} ${chat.phone || ""}`.toLowerCase().includes(needle));
  const connected = connection.status === "connected";
  const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WhatsApp automation</h1>
          <p className="text-sm text-zinc-500 mt-2">Choose which individual chats your AI assistant answers.</p>
        </div>
        <button className={buttonClass} disabled={!!busy || loading} onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" /> Refresh chats
        </button>
      </div>
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}</div>}
      {loading ? <div className="flex justify-center p-16"><Loader2 aria-label="Loading WhatsApp" className="animate-spin h-6 w-6 text-zinc-500" /></div> : (
        <>
          <div className="grid gap-6 md:grid-cols-[1fr_300px]">
            <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="rounded-xl p-3 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"><Smartphone className="h-6 w-6" /></div>
                <div>
                  <h2 className="font-semibold">Your WhatsApp account</h2>
                  <p className="text-sm text-zinc-500">One account for this workspace</p>
                </div>
                <span role="status" className={`ml-auto text-xs font-medium rounded-full px-3 py-1 ${connected ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>{statusLabels[connection.status] || "Disconnected"}</span>
              </div>
              {connection.phone && <p className="text-sm text-zinc-500">Connected number: +{connection.phone}</p>}
              <div>
                <label htmlFor="whatsapp-bot" className="block text-sm font-medium mb-2">AI assistant</label>
                <select id="whatsapp-bot" value={selectedBot} onChange={e => void changeBot(e.target.value)} disabled={!!busy || !bots.length}
                  className="w-full rounded-lg border border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-700 px-3 py-2.5 text-sm">
                  {!bots.length && <option value="">No assistants available</option>}
                  {bots.map(bot => <option key={bot.id} value={bot.id}>{bot.name}{bot.status !== "active" ? " (inactive)" : ""}</option>)}
                </select>
                <p className="text-xs text-zinc-500 mt-2">Replies use this assistant’s saved instructions and knowledge base. Inactive assistants do not reply.</p>
              </div>
              {connection.error && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">{connection.error}</p>}
              <div className="flex flex-wrap gap-2">
                {!connected && <button onClick={() => void connect()} disabled={!!busy || !selectedBot}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-medium disabled:opacity-50">
                  {busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                  {connection.status === "waiting-qr" ? "Refresh connection" : "Connect WhatsApp"}
                </button>}
                {account?.connect_requested && <button className={buttonClass} disabled={!!busy} onClick={() => void perform("disconnect", async () => {
                  const state = await api.disconnectWhatsApp(tenant.current);
                  if (mounted.current) { setConnection(state); setAccount(previous => ({ ...previous, connect_requested: false })); }
                })}><Unplug className="h-4 w-4" /> Disconnect</button>}
                {account && <button className={buttonClass} disabled={!!busy} onClick={() => void perform("logout", async () => {
                  const state = await api.logoutWhatsApp(tenant.current);
                  if (mounted.current) { setConnection(state); setAccount(previous => ({ ...previous, connect_requested: false })); setChats(previous => previous.map(chat => ({ ...chat, enabled: false }))); }
                })}>Unlink account</button>}
              </div>
              <p className="text-xs text-zinc-500">Disconnect keeps your session and chat selections. Unlink removes the session and switches all chats off.</p>
            </section>
            <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 flex flex-col items-center justify-center text-center min-h-[280px]">
              {connection.qr ? <>
                {/* Local QR data URL returned by the authenticated connector. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={connection.qr} width="250" height="250" alt="Scan this QR code in WhatsApp Linked devices" className="rounded-lg" />
                <p className="text-xs text-zinc-500 mt-3">WhatsApp → Linked devices → Link a device</p>
              </> : <>
                {connection.status === "connecting" || connection.status === "waiting-qr" ? <Loader2 className="h-9 w-9 text-emerald-600 animate-spin" /> : <Smartphone className="h-10 w-10 text-zinc-400" />}
                <p className="text-sm font-medium mt-4">{connected ? "Your account is connected" : "Pair with a QR code"}</p>
                <p className="text-xs text-zinc-500 mt-2">{connected ? "Keep the backend and connector running locally to receive and answer messages." : "Start the local connector, then select Connect WhatsApp to display a QR code."}</p>
              </>}
            </section>
          </div>
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold">Chat automation</h2>
                <p className="text-xs text-zinc-500 mt-1">{enabledCount} enabled · {chats.length} chats discovered</p>
              </div>
              <button className={buttonClass} disabled={!account || !!busy} onClick={() => void perform("pause", async () => {
                const saved = await api.configureWhatsApp(tenant.current, { paused: !account.paused });
                if (mounted.current) setAccount(saved);
              })}>{account?.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{account?.paused ? "Resume automation" : "Pause all automation"}</button>
            </div>
            {account?.paused && <div role="status" className="px-5 py-3 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 text-sm">Automation is paused. Your individual chat selections are saved.</div>}
            <div className="p-5 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input type="search" aria-label="Search WhatsApp chats" placeholder="Search by name or phone number" value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent py-2.5 pl-9 pr-3 text-sm" /></div>
              <div className="flex gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 p-1">
                {[['all', 'All chats'], ['enabled', 'Enabled'], ['disabled', 'Disabled']].map(([value, label]) => <button key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} className={`rounded-md px-3 py-1.5 text-xs font-medium ${filter === value ? "bg-white dark:bg-zinc-800 shadow-sm" : "text-zinc-500"}`}>{label}</button>)}
              </div>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[550px] overflow-y-auto">
              {visibleChats.map(chat => <div key={chat.id} className="flex items-center gap-3 px-5 py-4">
                <div className="p-2.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-500"><MessageSquare className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{chatDisplayName(chat)}</p><p className="text-xs text-zinc-500 mt-0.5">{chat.phone ? `+${chat.phone} · ` : ""}{chat.enabled ? "Automation enabled" : "Automation off"}</p>{!chat.name?.trim() && !chat.phone && <p className="text-xs text-zinc-400 mt-0.5">Waiting for contact details from WhatsApp</p>}</div>
                {busy === `chat:${chat.id}` && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
                <Toggle checked={chat.enabled} disabled={!!busy} label={`Automation for ${chatDisplayName(chat)}`} onChange={enabled => void perform(`chat:${chat.id}`, async () => {
                  await api.toggleWhatsAppChat(tenant.current, chat.id, enabled);
                  if (mounted.current) setChats(previous => previous.map(c => c.id === chat.id ? { ...c, enabled } : c));
                })} />
              </div>)}
              {!visibleChats.length && <div className="p-12 text-center"><MessageSquare className="h-8 w-8 text-zinc-300 mx-auto mb-3" /><p className="text-sm font-medium">{chats.length ? "No matching chats" : "No chats discovered yet"}</p><p className="text-xs text-zinc-500 mt-2">{chats.length ? "Try another search or filter." : "Connect WhatsApp and wait for chat sync. New chats also appear when messages arrive."}</p></div>}
            </div>
            <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 flex flex-wrap gap-3 justify-between"><span>New chats start off. Automation answers incoming text in enabled individual chats.</span><Link href="/knowledge" className="inline-flex items-center gap-1.5 hover:text-zinc-900 dark:hover:text-white"><BookOpen className="h-3.5 w-3.5" /> Manage knowledge base</Link></div>
          </section>
        </>
      )}
    </div>
  );
}
