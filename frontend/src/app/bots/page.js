'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredData } from '@/lib/api';
import { Bot, Save, MessageSquare, PhoneCall, Mail, Calendar, Palette, ShieldAlert, Globe, Code } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";


function getWidgetApiHost() {
  const configuredHost = process.env.NEXT_PUBLIC_WIDGET_API_URL
    || process.env.NEXT_PUBLIC_API_URL
    || "http://127.0.0.1:8000/api/v1";
  const normalizedHost = configuredHost.replace(/\/+$/, "");
  return normalizedHost.endsWith("/api/v1") ? normalizedHost : `${normalizedHost}/api/v1`;
}

function getEmbedCode(origin, publicKey) {
  return `<script src="${origin}/widget.js" data-bot-id="${publicKey}" data-api-host="${getWidgetApiHost()}" defer></script>`;
}

export default function BotConfigPage() {
  const router = useRouter();
  const [bot, setBot] = useState({
    name: 'Support AI Assistant',
    greeting_message: 'Hello! How can I help you with our products or services today?',
    system_prompt: 'You are an AI support agent. Answer questions using ONLY the provided knowledge base context. If unsure, politely trigger human escalation.',
    theme_color: '#4F46E5',
    escalation_whatsapp: '+919876543210',
    escalation_email: 'support@mybusiness.com',
    escalation_phone: '+919876543210',
    escalation_booking: 'https://cal.com/mybusiness',
    confidence_threshold: 0.60
  });

  const [authData, setAuthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [domains, setDomains] = useState([]);
  const [newDomain, setNewDomain] = useState("");

  const [botIdForEmbed, setBotIdForEmbed] = useState("");

  useEffect(() => {
    const data = getStoredData();
    if (!data.tenant_id || !data.bot_id) {
      router.push("/login");
      return;
    }
    setAuthData(data);

    const fetchBot = async () => {
      try {
        const fetchedBot = await api.getBot(data.bot_id, data.tenant_id);
        setBot({
          name: fetchedBot.name || 'Support AI Assistant',
          greeting_message: fetchedBot.greeting_message || 'Hello! How can I help you with our products or services today?',
          system_prompt: fetchedBot.system_prompt || 'You are an AI support agent. Answer questions using ONLY the provided knowledge base context. If unsure, politely trigger human escalation.',
          theme_color: fetchedBot.theme_color || '#4F46E5',
          escalation_whatsapp: fetchedBot.escalation_whatsapp || '',
          escalation_email: fetchedBot.escalation_email || '',
          escalation_phone: fetchedBot.escalation_phone || '',
          escalation_booking: fetchedBot.escalation_booking || '',
          confidence_threshold: fetchedBot.confidence_threshold !== undefined ? fetchedBot.confidence_threshold : 0.60
        });

        setBotIdForEmbed(fetchedBot.public_key);

        const fetchedDomains = await api.getDomains(data.bot_id, data.tenant_id);
        setDomains(fetchedDomains);
      } catch (err) {
        console.error("Failed to fetch bot settings:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchBot();
  }, [router]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!authData) return;

    setSaving(true);
    try {
      await api.updateBot(authData.bot_id, authData.tenant_id, bot);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save bot settings:", err);
      alert("Failed to save settings: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddDomain = async (e) => {
    e.preventDefault();
    if (!newDomain || !authData) return;
    try {
      const added = await api.addDomain(authData.bot_id, authData.tenant_id, newDomain.trim());
      if (!domains.find(d => d.id === added.id)) {
        setDomains([...domains, added]);
      }
      setNewDomain("");
    } catch (err) {
      alert("Failed to add domain: " + err.message);
    }
  };

  const handleRemoveDomain = async (id) => {
    if (!authData) return;
    try {
      await api.removeDomain(authData.bot_id, id, authData.tenant_id);
      setDomains(domains.filter(d => d.id !== id));
    } catch (err) {
      alert("Failed to remove domain: " + err.message);
    }
  };

  const copyEmbedCode = () => {
    const code = getEmbedCode(window.location.origin, botIdForEmbed);
    navigator.clipboard.writeText(code);
    alert("Embed code copied to clipboard!");
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-zinc-100 dark:bg-zinc-900 rounded-xl w-full"></div>
        <div className="h-[400px] bg-zinc-100 dark:bg-zinc-900 rounded-xl w-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Sticky Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-background z-10 pt-2">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Bot Configuration</h1>
          <p className="text-zinc-500 text-sm mt-1 dark:text-zinc-400">
            Customize appearance, behavior, and security for your AI assistant.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className={`gap-2 shadow-sm ${saved ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"}`}
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : saved ? "Saved Successfully" : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start min-w-0">

        {/* Main Settings Panel (60-65%) */}
        <div className="flex-[3] min-w-0 w-full">
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm w-full overflow-hidden">
            <Tabs defaultValue="identity" className="w-full flex flex-col">
              <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20 px-8 pt-8 sm:px-10 sm:pt-10">
                <TabsList className="flex w-full overflow-x-auto justify-start h-auto bg-transparent p-0 gap-6">
                  <TabsTrigger value="identity" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-zinc-900 dark:data-[state=active]:border-zinc-50 rounded-none border-b-2 border-transparent px-1 pb-3 pt-2 font-medium">Identity</TabsTrigger>
                  <TabsTrigger value="escalation" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-zinc-900 dark:data-[state=active]:border-zinc-50 rounded-none border-b-2 border-transparent px-1 pb-3 pt-2 font-medium">Escalation</TabsTrigger>
                  <TabsTrigger value="installation" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-zinc-900 dark:data-[state=active]:border-zinc-50 rounded-none border-b-2 border-transparent px-1 pb-3 pt-2 font-medium">Installation</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="identity" className="m-0 p-8 sm:p-10 space-y-8 focus-visible:outline-none focus-visible:ring-0">
                <div className="space-y-1.5 mb-8">
                  <h3 className="text-lg font-semibold flex items-center gap-2"><Palette className="w-5 h-5 text-zinc-400" /> Identity & Branding</h3>
                  <p className="text-sm text-zinc-500">How your bot appears to your customers.</p>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>Bot Name</Label>
                    <Input
                      value={bot.name}
                      onChange={(e) => setBot({ ...bot, name: e.target.value })}
                      placeholder="e.g. Acme Support"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Theme Color</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={bot.theme_color}
                        onChange={(e) => setBot({ ...bot, theme_color: e.target.value })}
                        className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                      />
                      <Input
                        value={bot.theme_color}
                        onChange={(e) => setBot({ ...bot, theme_color: e.target.value })}
                        className="font-mono uppercase w-32"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Initial Greeting Message</Label>
                    <textarea
                      rows={3}
                      value={bot.greeting_message}
                      onChange={(e) => setBot({ ...bot, greeting_message: e.target.value })}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Welcome! How can I assist you today?"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="escalation" className="m-0 p-8 sm:p-10 space-y-8 focus-visible:outline-none focus-visible:ring-0">
                <div className="space-y-1.5 mb-8">
                  <h3 className="text-lg font-semibold flex items-center gap-2"><PhoneCall className="w-5 h-5 text-zinc-400" /> Human Handoff</h3>
                  <p className="text-sm text-zinc-500">Where should users go when the AI cannot answer?</p>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp Number</Label>
                      <Input
                        placeholder="+1234567890"
                        value={bot.escalation_whatsapp}
                        onChange={(e) => setBot({ ...bot, escalation_whatsapp: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> Support Email</Label>
                      <Input
                        type="email"
                        placeholder="support@company.com"
                        value={bot.escalation_email}
                        onChange={(e) => setBot({ ...bot, escalation_email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2"><PhoneCall className="w-3.5 h-3.5" /> Phone Number</Label>
                      <Input
                        placeholder="+1234567890"
                        value={bot.escalation_phone}
                        onChange={(e) => setBot({ ...bot, escalation_phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Booking URL</Label>
                      <Input
                        type="url"
                        placeholder="https://cal.com/..."
                        value={bot.escalation_booking}
                        onChange={(e) => setBot({ ...bot, escalation_booking: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="installation" className="m-0 p-8 sm:p-10 space-y-8 focus-visible:outline-none focus-visible:ring-0">
                <div className="space-y-1.5 mb-8">
                  <h3 className="text-lg font-semibold flex items-center gap-2"><Code className="w-5 h-5 text-zinc-400" /> Website Installation</h3>
                  <p className="text-sm text-zinc-500">Add the chat widget to your website.</p>
                </div>
                <div className="space-y-8">
                  <div className="space-y-3">
                    <Label>1. Add Allowed Domains</Label>
                    <p className="text-xs text-zinc-500">For security, the widget will only load on domains you whitelist.</p>
                    <div className="space-y-2">
                      {domains.map(d => (
                        <div key={d.id} className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-900 px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800">
                          <span className="text-sm font-medium">{d.domain}</span>
                          <button onClick={() => handleRemoveDomain(d.id)} className="text-red-500 hover:text-red-600 text-xs font-semibold">Remove</button>
                        </div>
                      ))}

                      <form onSubmit={handleAddDomain} className="flex gap-2 pt-1">
                        <Input
                          placeholder="e.g. example.com or localhost"
                          value={newDomain}
                          onChange={(e) => setNewDomain(e.target.value)}
                          className="flex-1"
                        />
                        <Button type="submit" variant="secondary">Add</Button>
                      </form>
                    </div>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <Label>2. Embed Script</Label>
                    <p className="text-xs text-zinc-500">Paste this script before the closing <code>&lt;/body&gt;</code> tag of your website.</p>
                    <div className="bg-zinc-950 rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-zinc-800">
                      <code className="text-xs text-emerald-400 font-mono break-all leading-relaxed">
                        {getEmbedCode(typeof window !== "undefined" ? window.location.origin : "", botIdForEmbed)}
                      </code>
                      <Button onClick={copyEmbedCode} size="sm" className="shrink-0 bg-white text-black hover:bg-zinc-200 shadow-none">
                        Copy
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* Live Preview Sidebar (35-40%) */}
        <div className="flex-[2] min-w-0 w-full">
          <div className="sticky top-8 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-zinc-400" /> Live Preview
            </h3>

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-xl shadow-zinc-200/40 dark:shadow-none flex flex-col h-[500px]">
              {/* Header */}
              <div
                className="p-4 flex items-center gap-3 text-white transition-colors duration-300"
                style={{ backgroundColor: bot.theme_color }}
              >
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm leading-tight">{bot.name}</h3>
                  <span className="text-[11px] font-medium opacity-90 flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online
                  </span>
                </div>
              </div>

              {/* Chat Body */}
              <div className="flex-1 p-4 bg-zinc-50 dark:bg-zinc-900 space-y-4 overflow-y-auto">
                <div className="flex items-start">
                  <div
                    className="px-4 py-2.5 rounded-2xl text-white max-w-[85%] rounded-tl-sm text-[13px] leading-relaxed shadow-sm transition-colors duration-300"
                    style={{ backgroundColor: bot.theme_color }}
                  >
                    {bot.greeting_message}
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 max-w-[85%] rounded-tr-sm text-[13px] shadow-sm">
                    Can I talk to a human?
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="px-4 py-3 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 max-w-[95%] rounded-tl-sm shadow-sm space-y-3 text-[13px]">
                    <p>Of course, you can reach our team via:</p>
                    <div className="flex flex-wrap gap-2">
                      {bot.escalation_whatsapp && (
                        <span className="px-2.5 py-1.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 font-medium text-[11px] border border-emerald-100 dark:border-emerald-900/50">
                          WhatsApp
                        </span>
                      )}
                      {bot.escalation_email && (
                        <span className="px-2.5 py-1.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 font-medium text-[11px] border border-amber-100 dark:border-amber-900/50">
                          Email
                        </span>
                      )}
                      {bot.escalation_phone && (
                        <span className="px-2.5 py-1.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 font-medium text-[11px] border border-blue-100 dark:border-blue-900/50">
                          Phone
                        </span>
                      )}
                      {bot.escalation_booking && (
                        <span className="px-2.5 py-1.5 rounded bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 font-medium text-[11px] border border-purple-100 dark:border-purple-900/50">
                          Book Meeting
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Fake Input */}
              <div className="p-3 bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
                <div className="flex-1 h-9 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-xs text-zinc-400 flex items-center">
                  Type your message...
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
