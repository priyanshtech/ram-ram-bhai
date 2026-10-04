'use client';
import { useState, useEffect } from 'react';
import { MessageSquare, Users, AlertCircle, Clock, CheckCircle2, ChevronLeft, Loader2, Bot, User } from 'lucide-react';
import { api, getStoredData } from '@/lib/api';

const getSafeMessageContent = (text) => {
  const technicalKeywords = ['500 internal', 'traceback', 'internal server error', 'failed to fetch', 'typeerror', 'rate-limit', 'openrouter', 'unexpected token', 'json', 'status code'];
  const lowerText = (text || '').toLowerCase();
  for (const keyword of technicalKeywords) {
    if (lowerText.includes(keyword)) {
      return "The assistant could not respond at this time. Please try again later or contact support.";
    }
  }
  return text;
};

export default function ConversationsPage() {
  const [activeTab, setActiveTab] = useState('conversations'); // 'conversations' | 'leads'
  const [selectedConv, setSelectedConv] = useState(null);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  
  const [conversations, setConversations] = useState([]);
  const [leads, setLeads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const markViewed = () => {
      localStorage.setItem('last_viewed_conversations_at', new Date().toISOString());
      window.dispatchEvent(new Event('conversations_viewed'));
    };
    
    markViewed();
    const interval = setInterval(markViewed, 5000);
    fetchData();

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedConv) {
      fetchMessages(selectedConv.id);
    } else {
      setMessages([]);
    }
  }, [selectedConv]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const authData = getStoredData();
      if (!authData?.bot_id || !authData?.tenant_id) {
        throw new Error('Please login to view conversations.');
      }
      
      const [convsData, leadsData] = await Promise.all([
        api.getConversations(authData.bot_id, authData.tenant_id),
        api.getLeads(authData.bot_id, authData.tenant_id)
      ]);
      
      setConversations(convsData);
      setLeads(leadsData);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conversationId) => {
    setMessagesLoading(true);
    try {
      const authData = getStoredData();
      const msgs = await api.getMessages(authData.bot_id, conversationId, authData.tenant_id);
      setMessages(msgs);
    } catch (err) {
      console.error(err);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleSelectConv = (c) => {
    setSelectedConv(c);
    setShowMobileDetail(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4 text-zinc-400">
          <Loader2 className="w-8 h-8 text-zinc-900 dark:text-zinc-50 animate-spin" />
          <p className="text-sm font-medium">Loading conversations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-red-500 gap-2">
        <AlertCircle className="w-5 h-5" />
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">Conversations</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
          Review customer chats, identify buying intent, and follow up with leads.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-8 overflow-x-auto">
        <button
          onClick={() => setActiveTab('conversations')}
          className={`pb-4 font-semibold text-sm transition flex items-center gap-2 border-b-2 whitespace-nowrap ${
            activeTab === 'conversations'
              ? 'border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" /> All Conversations ({conversations.length})
        </button>
        <button
          onClick={() => setActiveTab('leads')}
          className={`pb-4 font-semibold text-sm transition flex items-center gap-2 border-b-2 whitespace-nowrap ${
            activeTab === 'leads'
              ? 'border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          <Users className="w-4 h-4" /> Captured Leads ({leads.length})
        </button>
      </div>

      {/* Content View 1: Conversations */}
      {activeTab === 'conversations' && (
        <div className="flex flex-col lg:flex-row gap-6 lg:h-[700px]">
          
          {/* List - Left Column */}
          <div className={`flex-[1] min-w-[320px] max-w-full lg:max-w-[400px] flex flex-col gap-3 ${showMobileDetail ? 'hidden lg:flex' : 'flex'}`}>
            <div className="overflow-y-auto pr-2 space-y-3 h-full">
              {conversations.map((c) => {
                const isSelected = selectedConv?.id === c.id;
                // Determine if this conversation has a lead
                const hasLead = leads.some(l => l.conversation_id === c.id || l.name === c.visitor_name);
                
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectConv(c)}
                    className={`p-4 rounded-xl cursor-pointer transition-all border ${
                      isSelected 
                        ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-50 dark:bg-zinc-900' 
                        : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-semibold text-sm ${isSelected ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-200'}`}>
                        Visitor {c.visitor_session_id ? c.visitor_session_id.substring(0,8) : 'Unknown'}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                        c.status === 'escalated'
                          ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                          : 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                      }`}>
                        {c.status}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {new Date(c.created_at).toLocaleDateString()}
                      </div>
                      {hasLead && (
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          Lead Captured
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {conversations.length === 0 && (
                <div className="text-sm text-zinc-500 text-center py-12 px-4 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">No conversations yet.</p>
                  <p>Customer conversations will appear here when visitors interact with your assistant.</p>
                </div>
              )}
            </div>
          </div>

          {/* Messages Detail View - Right Column */}
          <div className={`flex-[2] flex flex-col bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden ${!showMobileDetail ? 'hidden lg:flex' : 'flex h-[700px] lg:h-auto'}`}>
            {selectedConv ? (
              <>
                {/* Detail Header */}
                <div className="border-b border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 flex items-center justify-between shrink-0 bg-zinc-50 dark:bg-zinc-900/50">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setShowMobileDetail(false)}
                      className="lg:hidden p-1 -ml-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 text-base">
                        Visitor {selectedConv.visitor_session_id ? selectedConv.visitor_session_id.substring(0,8) : 'Unknown'}
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Started on {new Date(selectedConv.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="hidden sm:flex items-center gap-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Status:</span>
                    <span className="text-xs font-medium capitalize text-zinc-700 dark:text-zinc-300">{selectedConv.status}</span>
                  </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                  {messagesLoading ? (
                    <div className="flex justify-center py-20">
                      <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-sm text-zinc-500 text-center py-20">
                      No messages in this conversation.
                    </div>
                  ) : (
                    messages.map((m, idx) => {
                      const isBot = m.sender === 'bot';
                      const isSystem = m.sender === 'system';
                      
                      if (isSystem) {
                        return (
                          <div key={m.id || idx} className="flex justify-center my-4">
                            <span className="text-[11px] font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400 px-3 py-1 rounded-full">
                              {getSafeMessageContent(m.text_content)}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={m.id || idx}
                          className={`flex items-end gap-2 ${isBot ? 'flex-row' : 'flex-row-reverse'}`}
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mb-1 ${isBot ? 'bg-zinc-100 dark:bg-zinc-800' : 'bg-zinc-200 dark:bg-zinc-700'}`}>
                            {isBot ? <Bot className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" /> : <User className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />}
                          </div>
                          
                          <div className={`p-3.5 rounded-2xl text-[13px] leading-relaxed max-w-[85%] sm:max-w-[75%] ${
                            !isBot
                              ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 rounded-br-sm'
                              : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-bl-sm shadow-sm'
                          }`}>
                            <p className="whitespace-pre-wrap">{getSafeMessageContent(m.text_content)}</p>
                            
                            {m.sources && m.sources.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-white/20 dark:border-black/10 space-y-1.5">
                                <p className="text-[10px] font-medium opacity-70">Sources used:</p>
                                {m.sources.map((src, i) => (
                                  <div key={i} className="text-[10px] bg-black/10 dark:bg-white/10 px-2 py-1 rounded truncate">
                                    {src.title || 'Knowledge Base'}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-zinc-400 dark:text-zinc-500 p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center mb-4">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-200 mb-1">Select a conversation</p>
                <p className="text-xs">Choose a conversation from the list to view the full chat history.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content View 2: Leads Table */}
      {activeTab === 'leads' && (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50 text-sm">Captured Leads List</h2>
            <button className="px-3 py-1.5 rounded-md bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm">
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50/50 dark:bg-zinc-900/20">
                  <th className="py-3 px-5 font-medium">Visitor Name</th>
                  <th className="py-3 px-5 font-medium">Email</th>
                  <th className="py-3 px-5 font-medium">Phone / WhatsApp</th>
                  <th className="py-3 px-5 font-medium">Query Context</th>
                  <th className="py-3 px-5 font-medium text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
                {leads.map((l) => {
                  const maskString = (str) => {
                    if (!str || str === '-') return '-';
                    if (str.includes('@')) {
                      const [user, domain] = str.split('@');
                      return `${user.substring(0, 2)}***@${domain}`;
                    }
                    if (str.match(/\d/)) {
                      return str.substring(0, str.length - 4).replace(/\d/g, '*') + str.substring(str.length - 4);
                    }
                    return str;
                  };

                  return (
                    <tr key={l.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                      <td className="py-4 px-5 font-medium text-zinc-900 dark:text-zinc-100">{l.name || 'Anonymous'}</td>
                      <td className="py-4 px-5 text-sm text-zinc-600 dark:text-zinc-400">{maskString(l.email)}</td>
                      <td className="py-4 px-5 text-sm text-zinc-600 dark:text-zinc-400 font-mono">{maskString(l.phone)}</td>
                      <td className="py-4 px-5 text-sm text-zinc-600 dark:text-zinc-400 max-w-[250px] truncate" title={l.query || l.requirement}>
                        {l.query || l.requirement || '-'}
                      </td>
                      <td className="py-4 px-5 text-sm text-zinc-500 dark:text-zinc-500 text-right whitespace-nowrap">
                        {new Date(l.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-zinc-500 dark:text-zinc-400 text-sm bg-zinc-50/50 dark:bg-zinc-900/20">
                      No leads captured yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
