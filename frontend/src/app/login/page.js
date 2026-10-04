"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, setAuthData } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Bot, LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Only listen for new sign-in events (like returning from Google OAuth)
    // Do not auto-login just because a session exists in local storage
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.access_token) {
        handleSupabaseLogin(session.access_token);
      }
    });
    
    return () => subscription.unsubscribe();
  }, []);

  const handleSupabaseLogin = async (token) => {
    setLoading(true);
    try {
      let API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
      if (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.endsWith('/api/v1')) {
        API_BASE = `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')}/api/v1`;
      }
      const res = await fetch(`${API_BASE}/auth/supabase-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supabase_token: token })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Google login failed");
      }
      const data = await res.json();
      setAuthData(data);
      router.push("/dashboard");
    } catch (err) {
      setError(err.message);
      setLoading(false);
      // Optional: sign out of supabase so they can try again if backend fails
      await supabase.auth.signOut();
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`
      }
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      
      <Card className="w-full max-w-[440px] shadow-xl border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl z-10">
        <CardHeader className="space-y-4 text-center pb-6 pt-10 px-10">
          <div className="flex justify-center mb-3">
            <img src="/logo.png" alt="Konvert AI" className="h-16 w-16 rounded-2xl object-cover shadow-md" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Welcome back</CardTitle>
          <CardDescription className="text-sm text-zinc-500 dark:text-zinc-400">
            Sign in to your account with Google
          </CardDescription>
        </CardHeader>
        <div className="px-10 pb-10 flex flex-col space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-100 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400">
              {error}
            </div>
          )}
          
          <Button 
            type="button" 
            variant="outline" 
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-11 text-base font-medium border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>
            Continue with Google
          </Button>

          <div className="text-center text-sm text-zinc-500 dark:text-zinc-400 pt-2">
            Don't have an account?{" "}
            <Link href="/signup" className="text-zinc-900 font-medium underline underline-offset-4 hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-300">
              Sign up
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
