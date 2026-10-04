"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api, getStoredData } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import { Send, Bot, User, Sparkles, BookOpen, ShieldAlert, PhoneCall, AlertCircle, PlayCircle, Settings2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SimulatorPage() {
  const router = useRouter();
  const [bot, setBot] = useState(null);
  const [visitorToken, setVisitorToken] = useState(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState("");
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const initSimulator = async () => {
      const { tenant_id } = getStoredData();
      if (!tenant_id) {
        router.push("/login");
        return;
      }
      try {
        const bots = await api.getBots(tenant_id);
        if (bots.length > 0) {
          const currentBot = bots[0];
          setBot(currentBot);
          const session = await api.createWidgetSession(currentBot.public_key);
          setVisitorToken(session.visitor_session_token);
          setMessages([
            {
              id: "welcome",
              sender: "bot",
              text: session.greeting_message || "Hello! I am your AI assistant.",
              citations: []
            }
          ]);
        }
      } catch (err) {
        setInitError(err.message || "Failed to initialize simulator");
      }
    };
    initSimulator();
  }, [router]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading || !visitorToken) return;

    const userMsg = { id: Date.now().toString(), sender: "visitor", text: input };
    setMessages((prev) => [...prev, userMsg]);
    const currentQuery = input;
    setInput("");
    setLoading(true);
    setError("");

    // Create placeholder for bot response
    const botMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: botMsgId, sender: "bot", text: "", citations: [], fallback: false }]);

    try {
      let API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
      if (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.endsWith('/api/v1')) {
        API_BASE = `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')}/api/v1`;
      }
      const response = await fetch(`${API_BASE}/chat/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${visitorToken}`
        },
        body: JSON.stringify({ message: currentQuery })
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let pending = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop();
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              if (!dataStr) continue;
              try {
                const data = JSON.parse(dataStr);
                
                if (data.type === "error") throw new Error(data.message || "AI request failed");

                setMessages((prev) => prev.map((msg) => {
                  if (msg.id === botMsgId) {
                    if (data.type === "chunk" && data.text) {
                      return { ...msg, text: msg.text + data.text };
                    } else if (data.type === "done") {
                      return { 
                        ...msg,
                        text: data.answer ?? msg.text,
                        citations: data.citations || [], 
                        fallback: data.fallback_triggered || false 
                      };
                    }
                  }
                  return msg;
                }));
              } catch (e) {
                if (!(e instanceof SyntaxError)) throw e;
                console.error("Error parsing SSE chunk", e);
              }
            }
          }
        }
      }
    } catch (err) {
      setError(err.message || "Failed to send message");
      setMessages((prev) => prev.map((msg) => 
        msg.id === botMsgId ? { ...msg, text: "Error connecting to AI." } : msg
      ));
    } finally {
      setLoading(false);
    }
  };

  if (initError) {
    return (
      <div className="flex flex-col h-[60vh] items-center justify-center space-y-6 animate-in fade-in">
        <div className="p-6 bg-red-50 text-red-800 border border-red-200 rounded-xl text-sm flex flex-col gap-3 max-w-lg shadow-sm">
          <div className="flex items-center gap-2 font-bold text-red-900 text-lg">
            <AlertCircle className="w-5 h-5 shrink-0" />
            Initialization Failed
          </div>
          <p className="leading-relaxed">{initError}</p>
          {initError.includes("allowed domains") && (
            <p className="mt-2 text-red-700/80 p-3 bg-white/50 rounded-lg border border-red-100">
              Please go to <b>Bot Settings &gt; Installation</b> and add <code>localhost</code> to your allowed domains.
            </p>
          )}
        </div>
        <Button onClick={() => router.push("/bots")} variant="outline" className="shadow-sm">
          Go to Bot Settings
        </Button>
      </div>
    );
  }

  if (!bot || !visitorToken) {
    return (
      <div className="flex flex-col h-[50vh] items-center justify-center text-sm space-y-4 animate-pulse">
        <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
          <PlayCircle className="w-6 h-6 text-zinc-400" />
        </div>
        <div className="text-zinc-500 font-medium">Initializing Sandbox...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 h-[calc(100vh-6rem)] flex flex-col pb-4 min-w-0">
      <div className="shrink-0 flex flex-col pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
          Chat Simulator
        </h1>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col w-full max-w-5xl mx-auto pt-2">
        {/* Chat Console */}
        <div className="border border-zinc-200 bg-white rounded-2xl shadow-sm dark:border-zinc-800 dark:bg-zinc-950 flex flex-col overflow-hidden h-full">
          {/* Header */}
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/20 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center dark:bg-white dark:text-zinc-900 shadow-sm">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{bot.name}</h2>
            </div>
          </div>

          {/* Chat Messages Log */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.sender === "visitor" ? "justify-end" : "justify-start"} group`}
              >
                {m.sender === "bot" && (
                  <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 shrink-0 mt-0.5 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div className={`space-y-1.5 max-w-[85%] sm:max-w-[75%] ${m.sender === "visitor" ? "items-end" : "items-start"}`}>
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed shadow-sm ${
                      m.sender === "visitor"
                        ? "bg-zinc-900 text-white rounded-tr-sm dark:bg-zinc-100 dark:text-zinc-900"
                        : "bg-white text-zinc-800 rounded-tl-sm border border-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    {m.text ? (
                      <div className="prose-custom max-w-none">
                        <ReactMarkdown
                          components={{
                            p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                            strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
                            ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-1" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-1" {...props} />,
                            li: ({node, ...props}) => <li {...props} />,
                            h3: ({node, ...props}) => <h3 className="font-semibold mt-3 mb-1" {...props} />,
                            h4: ({node, ...props}) => <h4 className="font-medium mt-2 mb-1" {...props} />,
                          }}
                        >
                          {m.text}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <span className="flex gap-1 items-center h-5"><span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></span><span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-75"></span><span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-150"></span></span>
                    )}
                  </div>

                  {/* Citations & Fallbacks */}
                  {m.sender === "bot" && m.fallback && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 border border-amber-200/60 flex items-center gap-1 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-400 font-medium">
                        <PhoneCall className="w-3 h-3 text-amber-500" /> Human Escalation Triggered
                      </span>
                    </div>
                  )}
                </div>

                {m.sender === "visitor" && (
                  <div className="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 shrink-0 mt-0.5 dark:bg-zinc-700 dark:text-zinc-300">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} className="h-4" />
          </div>

          {/* Query Input */}
          <div className="p-4 bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800">
            <form onSubmit={handleSend} className="flex gap-2 max-w-4xl mx-auto">
              <Input
                type="text"
                placeholder="Ask a question to test the bot..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 rounded-full px-5 bg-zinc-50 border-zinc-200 focus-visible:ring-zinc-900 dark:bg-zinc-900 dark:border-zinc-800 dark:focus-visible:ring-zinc-300"
                disabled={loading}
              />
              <Button type="submit" disabled={loading || !input.trim()} className="rounded-full px-6 shadow-sm bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
                <Send className="w-4 h-4 mr-2" /> Send
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
