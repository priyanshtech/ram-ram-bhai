"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  BookOpen,
  PlayCircle,
  LogOut,
  ChevronDown,
  Settings,
  Menu,
  X,
  MessageSquare,
  Smartphone,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { clearAuthData, getStoredData, api } from "@/lib/api";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tenantName, setTenantName] = useState("Loading...");
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved) setIsCollapsed(saved === 'true');
  }, []);

  const toggleSidebar = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem('sidebar_collapsed', next.toString());
  };

  useEffect(() => {
    const fetchUnread = async () => {
      if (pathname === '/conversations') {
        setUnreadCount(0);
        return;
      }
      try {
        const authData = getStoredData();
        if (!authData?.bot_id || !authData?.tenant_id) return;

        const convs = await api.getConversations(authData.bot_id, authData.tenant_id);
        const lastViewedStr = localStorage.getItem('last_viewed_conversations_at');

        if (!lastViewedStr) {
          setUnreadCount(convs.length);
        } else {
          const lastViewed = new Date(lastViewedStr);
          const count = convs.filter(c => {
            const convDateStr = c.created_at.endsWith('Z') ? c.created_at : `${c.created_at}Z`;
            return new Date(convDateStr) > lastViewed;
          }).length;
          setUnreadCount(count);
        }
      } catch (e) {
        console.error("Failed to fetch unread conversations", e);
      }
    };

    const handleViewed = () => setUnreadCount(0);
    window.addEventListener('conversations_viewed', handleViewed);

    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);

    return () => {
      window.removeEventListener('conversations_viewed', handleViewed);
      clearInterval(interval);
    };
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
    const authData = getStoredData();
    if (authData && authData.tenant_name) {
      setTenantName(authData.tenant_name);
    } else {
      setTenantName("Your Workspace");
    }
  }, []);

  if (pathname === "/login" || pathname === "/signup" || pathname === "/") {
    return null;
  }

  const mainNavItems = [
    { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
    { name: "Conversations", href: "/conversations", icon: MessageSquare },
    { name: "WhatsApp", href: "/whatsapp", icon: Smartphone },
    { name: "Knowledge Base", href: "/knowledge", icon: BookOpen },
    { name: "AI Configuration", href: "/bots", icon: Bot },
    { name: "Simulator", href: "/simulator", icon: PlayCircle },
  ];



  const handleLogout = async () => {
    clearAuthData();
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Supabase signout error:", e);
    }
    router.push("/");
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-zinc-50 border-r border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 relative group">
      {/* Collapse Toggle */}
      <button
        onClick={toggleSidebar}
        className="hidden md:flex absolute -right-3 top-6 z-10 w-6 h-6 items-center justify-center bg-white border border-zinc-200 rounded-full text-zinc-500 hover:text-zinc-900 shadow-sm transition-all opacity-0 group-hover:opacity-100 dark:bg-zinc-900 dark:border-zinc-700 dark:hover:text-zinc-50"
      >
        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {/* Brand Workspace Switcher */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
        <button className={`flex items-center w-full p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors ${isCollapsed ? 'justify-center' : 'justify-between text-left'}`}>
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Konvert AI" className="w-8 h-8 rounded-lg object-cover shadow-sm shrink-0" />
            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 leading-none truncate max-w-[120px]">Konvert AI</span>
                <span className="text-[10px] text-zinc-500 font-medium mt-1 uppercase tracking-wider">Beta, testing phase</span>
              </div>
            )}
          </div>
          {!isCollapsed && <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-4 px-3 overflow-y-auto overflow-x-hidden">
        {!isCollapsed && (
          <div className="mb-2 px-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Platform
          </div>
        )}
        <nav className={`space-y-1 ${isCollapsed ? 'mt-2' : ''}`}>
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                title={isCollapsed ? item.name : undefined}
                onClick={() => setIsMobileOpen(false)}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${isCollapsed ? 'justify-center gap-0' : 'gap-3'
                  } ${isActive
                    ? "bg-zinc-200/50 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-50 dark:hover:bg-zinc-900"
                  }`}
              >
                <div className="relative flex items-center justify-center shrink-0">
                  <Icon className={`w-4 h-4 ${isActive ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500 dark:text-zinc-400"}`} />
                  {isCollapsed && item.name === "Conversations" && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 w-2 h-2 bg-indigo-500 rounded-full" />
                  )}
                </div>
                {!isCollapsed && <span className="flex-1 whitespace-nowrap">{item.name}</span>}
                {!isCollapsed && item.name === "Conversations" && unreadCount > 0 && (
                  <span className="bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                    {unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
        <button
          onClick={handleLogout}
          title={isCollapsed ? "Sign out" : undefined}
          className={`flex items-center w-full px-3 py-2 rounded-md text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-50 dark:hover:bg-zinc-900 transition-colors ${isCollapsed ? 'justify-center gap-0' : 'gap-3'
            }`}
        >
          <div className="relative flex items-center justify-center shrink-0">
            <LogOut className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          </div>
          {!isCollapsed && (
            <span className="flex-1 text-left whitespace-nowrap">Sign out</span>
          )}
        </button>
      </div>
    </div>
  );

  if (!mounted) return null;

  return (
    <>
      {/* Mobile Toggle */}
      <button
        className="md:hidden fixed top-4 right-4 z-50 p-2 bg-white dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-800 shadow-sm"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
      >
        {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex flex-col h-screen sticky top-0 shrink-0 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar overlay */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileOpen(false)}>
          <aside
            className="w-64 h-full bg-white dark:bg-zinc-950 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  );
}
