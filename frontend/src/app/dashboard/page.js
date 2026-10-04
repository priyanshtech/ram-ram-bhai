"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getStoredData } from "@/lib/api";
import {
  MessageSquare,
  HelpCircle,
  Users,
  CheckCircle2,
  Bot,
  Sparkles,
  Key,
  Copy,
  Building,
  AlertCircle,
  BarChart2,
  TrendingUp,
  Clock,
  FileText
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DashboardOverview() {
  const router = useRouter();
  const [bot, setBot] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      const { tenant_id } = getStoredData();
      if (!tenant_id) {
        router.push("/login");
        return;
      }

      try {
        const bots = await api.getBots(tenant_id);
        if (bots && bots.length > 0) {
          const currentBot = bots[0];
          setBot(currentBot);
          const overview = await api.getDashboardOverview(currentBot.id, tenant_id);
          setStats(overview);
        }
      } catch (err) {
        setError("Failed to fetch bot details.");
        if (err?.message?.includes("401")) router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(""), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 bg-zinc-100 dark:bg-zinc-900 rounded-xl w-full"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-zinc-100 dark:bg-zinc-900 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50 flex items-center gap-1.5 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Online
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            {bot ? bot.name.replace(/\s*AI$/i, '') : "Support Dashboard"}
          </h1>
          <p className="text-zinc-500 text-sm mt-1 dark:text-zinc-400 max-w-xl">
            Monitor your chatbot's performance, manage knowledge, and test interactions in real-time.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <Link href="/knowledge" className="flex-1 md:flex-none">
            <Button variant="outline" className="w-full gap-2 shadow-sm text-zinc-700 dark:text-zinc-300">
              <Sparkles className="w-4 h-4" />
              Manage Knowledge
            </Button>
          </Link>
          <Link href="/simulator" className="flex-1 md:flex-none">
            <Button className="w-full gap-2 bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 shadow-sm">
              <Bot className="w-4 h-4" />
              Open Simulator
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 min-w-0">

        <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
          <CardHeader className="p-6 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Conversations</CardTitle>
            <MessageSquare className="w-4 h-4 text-zinc-400" />
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <h3 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">{stats ? stats.total_conversations : "-"}</h3>
            <p className="text-xs text-zinc-500 mt-1">Chats initiated</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
          <CardHeader className="p-6 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Unique Visitors</CardTitle>
            <Users className="w-4 h-4 text-zinc-400" />
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <h3 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">{stats ? stats.unique_visitors : "-"}</h3>
            <p className="text-xs text-zinc-500 mt-1">Website traffic (est.)</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/10">
          <CardHeader className="p-6 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Leads Captured</CardTitle>
            <Users className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <h3 className="text-3xl font-semibold text-emerald-700 dark:text-emerald-400">{stats ? stats.total_leads : "-"}</h3>
            <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">Contact info collected</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
          <CardHeader className="p-6 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Lead Conversion Rate</CardTitle>
            <TrendingUp className="w-4 h-4 text-zinc-400" />
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <h3 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">{stats ? `${stats.lead_conversion_rate}%` : "-"}</h3>
            <p className="text-xs text-zinc-500 mt-1">From total conversations</p>
          </CardContent>
        </Card>



        <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
          <CardHeader className="p-6 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Human Handoffs</CardTitle>
            <HelpCircle className="w-4 h-4 text-zinc-400" />
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <h3 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">{stats ? stats.total_handoffs : "-"}</h3>
            <p className="text-xs text-zinc-500 mt-1">Escalated to human</p>
          </CardContent>
        </Card>


      </div>
    </div>
  );
}
