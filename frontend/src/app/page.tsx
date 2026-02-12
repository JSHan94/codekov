"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";

const GameCanvas = dynamic(() => import("@/game/GameCanvas"), {
  ssr: false,
  loading: () => <TabLoading />,
});

const InventoryPage = dynamic(() => import("@/game/InventoryPage"), {
  ssr: false,
  loading: () => <TabLoading />,
});

const ShopPage = dynamic(() => import("@/game/ShopPage"), {
  ssr: false,
  loading: () => <TabLoading />,
});

function TabLoading() {
  return (
    <div className="flex-1 flex items-center justify-center text-white/30 font-mono text-sm">
      Loading...
    </div>
  );
}

type Tab = "inventory" | "shop" | "raid";

const TABS: { label: string; value: Tab }[] = [
  { label: "Inventory", value: "inventory" },
  { label: "Shop", value: "shop" },
  { label: "Raid", value: "raid" },
];

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOAuth = async (provider: "google" | "x") => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#1a1a2e] font-mono text-white">
      <h1 className="mb-2 text-4xl font-bold tracking-widest">CODEKOV</h1>
      <p className="mb-8 text-sm text-white/40">Sign in to start raiding</p>

      <div className="flex flex-col gap-3 w-64">
        <button
          onClick={() => handleOAuth("google")}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-bold text-gray-800 hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </button>

        <button
          onClick={() => handleOAuth("x")}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg bg-black border border-white/20 px-6 py-3 text-sm font-bold text-white hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Sign in with X
        </button>
      </div>

      {error && (
        <p className="mt-4 text-xs text-red-400">
          {error}
        </p>
      )}
      {loading && !error && (
        <p className="mt-4 text-xs text-white/30 animate-pulse">
          Redirecting...
        </p>
      )}
    </div>
  );
}

export default function Home() {
  const { user, loading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("raid");

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#1a1a2e] font-mono text-white/30 text-sm">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[#1a1a2e]">
      {/* Tab bar */}
      <nav className="flex items-center gap-1 border-b border-white/10 px-4 py-0 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-5 py-3 text-xs font-mono font-bold tracking-wide transition-colors border-b-2 ${
              activeTab === tab.value
                ? "border-blue-500 text-white"
                : "border-transparent text-white/40 hover:text-white/60"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          {user.user_metadata?.avatar_url && (
            <img
              src={user.user_metadata.avatar_url}
              alt=""
              className="w-6 h-6 rounded-full"
            />
          )}
          <span className="text-[10px] text-white/40 font-mono">
            {user.email || user.user_metadata?.name || "User"}
          </span>
          <button
            onClick={signOut}
            className="text-[10px] text-white/20 hover:text-white/50 font-mono transition-colors"
          >
            Sign Out
          </button>
          <span className="text-[10px] text-white/20 font-mono tracking-widest">
            CODEKOV
          </span>
        </div>
      </nav>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "inventory" && <InventoryPage />}
        {activeTab === "shop" && <ShopPage />}
        {activeTab === "raid" && <GameCanvas />}
      </div>
    </div>
  );
}
