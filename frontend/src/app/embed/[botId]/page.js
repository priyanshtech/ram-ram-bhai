'use client';
import { useState, useEffect } from 'react';
import { Send, Bot, BookOpen, MessageSquare, PhoneCall, X, RefreshCw } from 'lucide-react';

export default function EmbedWidgetPage({ params }) {
  const botId = params?.botId || 'demo';
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: 'Hello! Welcome to our website. How can I help you today?',
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [escalation, setEscalation] = useState(null);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input;
    const userMsg = { id: Date.now(), sender: 'visitor', text: userText };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Call Backend RAG Chat endpoint
      const res = await fetch(`http://localhost:8000/api/v1/chat/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_id: botId,
          visitor_session_id: 'session_demo_123',
          message: userText
        })
      });

      if (res.ok) {
        const data = await res.json();
        const botMsg = {
          id: Date.now() + 1,
          sender: 'bot',
          text: data.answer,
          citations: data.citations,
          fallback: data.fallback_triggered
        };
        setMessages((prev) => [...prev, botMsg]);
        if (data.escalation_links) {
          setEscalation(data.escalation_links);
        }
      } else {
        throw new Error('API error');
      }
    } catch (err) {
      // Offline / Fallback simulated answer
      const botMsg = {
        id: Date.now() + 1,
        sender: 'bot',
        text: 'Thank you for reaching out! Our team is available to assist you directly.',
        fallback: true
      };
      setMessages((prev) => [...prev, botMsg]);
      setEscalation({
        whatsapp: 'https://wa.me/+919876543210?text=Hello',
        email: 'mailto:support@example.com'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Widget Header */}
      <div className="bg-indigo-600 p-4 flex items-center justify-between text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm leading-tight">AI Customer Support</h1>
            <span className="text-[10px] opacity-80 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Verified Knowledge Base
            </span>
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-950 text-xs">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.sender === 'visitor' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`p-3 rounded-2xl max-w-[85%] leading-relaxed ${
                m.sender === 'visitor'
                  ? 'bg-indigo-600 text-white rounded-tr-none shadow-md'
                  : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/60 shadow'
              }`}
            >
              {m.text}
            </div>

            {/* Citations Tag */}
            {m.citations && m.citations.length > 0 && (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-indigo-400">
                <BookOpen className="w-3 h-3" />
                <span>Source: {m.citations[0].document_title}</span>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-indigo-400 text-[11px] p-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Searching support knowledge base...
          </div>
        )}

        {/* Escalation Options Payload */}
        {escalation && (
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2 mt-2">
            <p className="text-[11px] text-slate-300 font-medium">Connect with a human team member:</p>
            <div className="flex flex-wrap gap-2">
              {escalation.whatsapp && (
                <a
                  href={escalation.whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center gap-1.5 transition shadow"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> WhatsApp Support
                </a>
              )}
              {escalation.email && (
                <a
                  href={escalation.email}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700 flex items-center gap-1.5 transition"
                >
                  <PhoneCall className="w-3.5 h-3.5" /> Email Us
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2">
        <input
          type="text"
          placeholder="Ask a question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-md shadow-indigo-600/30"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
