"use client";

import { useState } from "react";
import { STRATEGY_PRESETS, STRATEGY_COLORS } from "./constants";
import type { Strategy } from "./strategyTypes";

const SERVER_HTTP_URL =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL?.replace("ws://", "http://").replace("wss://", "https://") || "http://localhost:2567";

interface LobbyScreenProps {
  onStartRaid: (myStrategy: Strategy, aiMode: boolean) => void;
  avatarUrl?: string;
  userName?: string;
}

const STRATEGY_DESCRIPTIONS: Record<string, string> = {
  Aggressive: "Attacks enemies on sight. Only heals at critical HP.",
  Looter: "Focuses on collecting loot. Flees from close enemies.",
  Survivor: "Plays safe. Heals often and extracts early.",
  Explorer: "Roams the map for loot. Fights only when cornered.",
  Rusher: "Rushes straight to extraction point.",
};

export default function LobbyScreen({ onStartRaid, avatarUrl, userName }: LobbyScreenProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [aiMode, setAiMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiStrategy, setAiStrategy] = useState<Strategy | null>(null);

  const selected = aiStrategy ?? (STRATEGY_PRESETS[selectedIdx] as Strategy);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAiStrategy(null);

    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/ai/generate-strategy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: aiPrompt.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setAiError(data.error);
      } else if (data.strategy) {
        setAiStrategy(data.strategy as Strategy);
        setAiMode(true);
      }
    } catch {
      setAiError("Failed to connect to server");
    } finally {
      setAiLoading(false);
    }
  };

  const handleClearAi = () => {
    setAiStrategy(null);
    setAiError(null);
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#1a1a2e] font-mono text-white">
      {avatarUrl && (
        <img src={avatarUrl} alt="" className="w-12 h-12 rounded-full mb-3" />
      )}
      <h1 className="mb-1 text-3xl font-bold tracking-widest">CODEKOV</h1>
      {userName && (
        <p className="mb-1 text-xs text-white/50">{userName}</p>
      )}
      {/* Mode Selector */}
      <div className="flex gap-3 mb-8">
        <button
          onClick={() => setAiMode(false)}
          className={`rounded-lg border px-6 py-3 text-left transition-all ${
            !aiMode
              ? "border-blue-500/50 bg-blue-600/20 scale-105"
              : "border-white/5 bg-white/[0.02] hover:bg-white/5"
          }`}
        >
          <div className={`text-sm font-bold mb-0.5 ${!aiMode ? "text-blue-400" : "text-white/50"}`}>
            Manual Play
          </div>
          <div className="text-[10px] text-white/30">WASD + Mouse control</div>
        </button>
        <button
          onClick={() => setAiMode(true)}
          className={`rounded-lg border px-6 py-3 text-left transition-all ${
            aiMode
              ? "border-purple-500/50 bg-purple-600/20 scale-105"
              : "border-white/5 bg-white/[0.02] hover:bg-white/5"
          }`}
        >
          <div className={`text-sm font-bold mb-0.5 ${aiMode ? "text-purple-400" : "text-white/50"}`}>
            AI Strategy
          </div>
          <div className="text-[10px] text-white/30">AI controls your agent</div>
        </button>
      </div>

      {aiMode && (
        <>
          <p className="mb-4 text-sm text-white/40">Choose your strategy</p>

          {/* AI Strategy Generator */}
          <div className="mb-6 w-[600px]">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-purple-400 font-bold uppercase tracking-wider">AI Strategy</span>
                <span className="text-[10px] text-white/30">Describe your strategy in natural language</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAiGenerate()}
                  placeholder="e.g. 공격적으로 루팅하고 체력 낮으면 도망"
                  maxLength={500}
                  className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50"
                  disabled={aiLoading}
                />
                <button
                  onClick={handleAiGenerate}
                  disabled={!aiPrompt.trim() || aiLoading}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {aiLoading ? "Generating..." : "AI Generate"}
                </button>
              </div>
              {aiError && (
                <div className="mt-2 text-xs text-red-400">{aiError}</div>
              )}
              {aiStrategy && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-green-400">Generated: {aiStrategy.name}</span>
                  <span className="text-[10px] text-white/30">({aiStrategy.rules.length} rules)</span>
                  <button
                    onClick={handleClearAi}
                    className="text-[10px] text-white/30 hover:text-white/60 ml-auto"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Preset Strategy Buttons */}
          {!aiStrategy && (
            <div className="flex gap-2 mb-6">
              {STRATEGY_PRESETS.map((preset, i) => {
                const color = STRATEGY_COLORS[preset.name] ?? "#888";
                const active = i === selectedIdx;
                return (
                  <button
                    key={preset.name}
                    onClick={() => setSelectedIdx(i)}
                    className={`w-28 rounded-lg border p-3 text-left transition-all ${
                      active
                        ? "border-white/30 bg-white/10 scale-105"
                        : "border-white/5 bg-white/[0.02] hover:bg-white/5"
                    }`}
                    style={{ borderBottom: `3px solid ${active ? color : "transparent"}` }}
                  >
                    <div
                      className={`text-xs font-bold mb-1 ${active ? "" : "text-white/50"}`}
                      style={active ? { color } : undefined}
                    >
                      {preset.name}
                    </div>
                    <div className="text-[10px] text-white/30 leading-snug">
                      {STRATEGY_DESCRIPTIONS[preset.name] ?? `${preset.rules.length} rules`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {!aiMode && (
        <p className="mb-6 text-sm text-white/30">
          Use WASD to move, F to loot, Click to attack, Space to dodge
        </p>
      )}

      <button
        onClick={() => onStartRaid(selected, aiMode)}
        className={`rounded-lg px-10 py-3 text-sm font-bold tracking-wide text-white transition-colors shadow-lg ${
          aiMode
            ? "bg-purple-600 hover:bg-purple-700 shadow-purple-600/20"
            : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/20"
        }`}
      >
        {aiMode ? "Start AI Raid" : "Start Raid"}
      </button>
    </div>
  );
}
