"use client";

import Link from "next/link";
import {
  Bot,
  MessageSquare,
  Zap,
  ShieldCheck,
  BarChart3,
  ArrowRight,
  Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-50 selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-zinc-900">
      {/* Navigation */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Konvert AI" className="w-9 h-9 rounded-xl object-cover shadow-sm" />
          <span className="text-xl font-bold tracking-tight">Konvert AI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors hidden sm:block">
            Log in
          </Link>
          <Link href="/signup">
            <Button className="bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 shadow-sm rounded-full px-6">
              Sign up
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center">
        {/* Hero Section */}
        <section className="w-full max-w-5xl mx-auto px-6 py-24 md:py-32 flex flex-col items-center text-center space-y-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-medium">
            <SparklesIcon className="w-4 h-4 text-emerald-500" />
            <span className="text-zinc-700 dark:text-zinc-300">Next-Generation AI Customer Support</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl leading-tight md:leading-[1.1]">
            Resolve support tickets <span className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-500 to-zinc-900 dark:from-zinc-400 dark:to-zinc-50">before they happen.</span>
          </h1>

          <p className="text-lg md:text-xl text-zinc-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
            Instantly answer customer questions based exclusively on your documentation. Connect your knowledge base and let your AI resolve up to 80% of inquiries autonomously.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 w-full sm:w-auto">
            <Link href="/signup" className="w-full sm:w-auto">
              <Button size="lg" className="w-full h-14 px-8 text-base font-semibold bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 rounded-full shadow-lg">
                Start your free trial <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Link href="/login" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full h-14 px-8 text-base font-semibold rounded-full border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                Log in to dashboard
              </Button>
            </Link>
          </div>
        </section>

        {/* Features Section */}
        <section className="w-full bg-zinc-50 dark:bg-zinc-900/50 py-24 border-y border-zinc-200 dark:border-zinc-800">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Everything you need to scale support</h2>
              <p className="text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto">
                Built for modern SaaS businesses, Konvert AI provides enterprise-grade reliability with unparalleled ease of use.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <FeatureCard
                icon={<MessageSquare className="w-6 h-6" />}
                title="Ground-Truth RAG"
                description="The AI strictly follows your uploaded documents. No hallucinations, no generic answers."
              />
              <FeatureCard
                icon={<Globe className="w-6 h-6" />}
                title="Universal Widget"
                description="Deploy a beautiful chat widget to any website with a single line of JavaScript."
              />
              <FeatureCard
                icon={<Zap className="w-6 h-6" />}
                title="Real-time Streaming"
                description="Provide incredibly fast, token-by-token streaming responses for a premium user experience."
              />
              <FeatureCard
                icon={<ShieldCheck className="w-6 h-6" />}
                title="Human Escalation"
                description="Automatically routes complex queries to your human team based on customizable confidence thresholds."
              />
              <FeatureCard
                icon={<Bot className="w-6 h-6" />}
                title="Branded Identity"
                description="Fully customize the AI's name, avatar, theme color, and behavioral prompt."
              />
              <FeatureCard
                icon={<BarChart3 className="w-6 h-6" />}
                title="Powerful Analytics"
                description="Track resolution rates, fallback percentages, and total conversation volume directly in your dashboard."
              />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white dark:bg-zinc-950 py-8 px-6 border-t border-zinc-200 dark:border-zinc-800 text-center text-zinc-500 dark:text-zinc-400 text-sm">
        <p>© {new Date().getFullYear()} Konvert AI Inc. All rights reserved.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }) {
  return (
    <div className="p-8 rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-900 dark:text-zinc-50 mb-6">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed text-sm">{description}</p>
    </div>
  );
}

function SparklesIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}
