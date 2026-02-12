"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchProfile,
  fetchInventory,
  buyItem,
  sellItem,
} from "./api";
import type { PlayerProfile, InventoryItemData } from "./api";
import {
  ITEM_DATA,
  getItemInfo,
  formatStats,
  getTypeColor,
  getTypeLabel,
  type ItemInfo,
} from "./items";

type ShopTab = "buy" | "sell";

export default function ShopPage() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [inventory, setInventory] = useState<InventoryItemData[]>([]);
  const [tab, setTab] = useState<ShopTab>("buy");
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [p, inv] = await Promise.all([fetchProfile(), fetchInventory()]);
    setProfile(p);
    setInventory(inv);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const gold = profile?.gold ?? 0;

  const handleBuy = async (itemId: string) => {
    const res = await buyItem(itemId);
    if (res.success) {
      if (res.gold !== undefined) {
        setProfile((prev) => (prev ? { ...prev, gold: res.gold! } : null));
      }
      // Refresh inventory to get new item
      const inv = await fetchInventory();
      setInventory(inv);
    }
  };

  const handleSell = async (loadoutId: string) => {
    const res = await sellItem(loadoutId);
    if (res.success) {
      setInventory((prev) => prev.filter((i) => i.id !== loadoutId));
      if (res.gold !== undefined) {
        setProfile((prev) => (prev ? { ...prev, gold: res.gold! } : null));
      }
    }
  };

  // Purchasable items (exclude valuables)
  const purchasableItems = Object.values(ITEM_DATA).filter(
    (item) => item.buyPrice !== null,
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-white/30 font-mono text-sm">
        Loading shop...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col font-mono text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h2 className="text-lg font-bold tracking-wide">Shop</h2>
        <div className="flex items-center gap-2 rounded-lg bg-yellow-900/30 px-4 py-2">
          <span className="text-yellow-400 text-sm font-bold">{gold}</span>
          <span className="text-yellow-400/60 text-xs">GOLD</span>
        </div>
      </div>

      {/* Buy / Sell tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-white/5">
        <button
          onClick={() => setTab("buy")}
          className={`px-4 py-1.5 rounded text-xs font-bold transition-colors ${
            tab === "buy"
              ? "bg-white/10 text-white"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setTab("sell")}
          className={`px-4 py-1.5 rounded text-xs font-bold transition-colors ${
            tab === "sell"
              ? "bg-white/10 text-white"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          Sell
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "buy" ? (
          <BuySection
            items={purchasableItems}
            gold={gold}
            onBuy={handleBuy}
          />
        ) : (
          <SellSection
            inventory={inventory}
            onSell={handleSell}
          />
        )}
      </div>
    </div>
  );
}

function BuySection({
  items,
  gold,
  onBuy,
}: {
  items: ItemInfo[];
  gold: number;
  onBuy: (itemId: string) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const canAfford = gold >= (item.buyPrice ?? Infinity);
        const stats = formatStats(item.stats);
        return (
          <div
            key={item.id}
            className="flex items-center gap-4 rounded-lg border border-white/5 bg-white/[0.02] p-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-bold ${getTypeColor(item.type)}`}
                >
                  {item.name}
                </span>
                <span className="text-[10px] text-white/30">
                  {getTypeLabel(item.type)}
                </span>
              </div>
              <div className="text-[10px] text-white/40 mt-1">
                {stats.join(" · ")}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-yellow-400 font-bold">
                {item.buyPrice}g
              </span>
              <button
                onClick={() => onBuy(item.id)}
                disabled={!canAfford}
                className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-colors ${
                  canAfford
                    ? "bg-blue-600/80 text-white hover:bg-blue-600"
                    : "bg-white/5 text-white/20 cursor-not-allowed"
                }`}
              >
                Buy
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SellSection({
  inventory,
  onSell,
}: {
  inventory: InventoryItemData[];
  onSell: (loadoutId: string) => void;
}) {
  if (inventory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/20">
        <div className="text-4xl mb-3">🏪</div>
        <div className="text-sm">Nothing to sell</div>
        <div className="text-xs mt-1">Collect loot from raids first!</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {inventory.map((item) => {
        const info = getItemInfo(item.item_id);
        return (
          <div
            key={item.id}
            className="flex items-center gap-4 rounded-lg border border-white/5 bg-white/[0.02] p-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-bold ${
                    info ? getTypeColor(info.type) : "text-white/50"
                  }`}
                >
                  {info?.name ?? item.item_id}
                </span>
                <span className="text-[10px] text-white/30">
                  {info ? getTypeLabel(info.type) : item.item_type}
                </span>
                {item.equipped && (
                  <span className="text-[9px] bg-green-900/60 text-green-400 px-1.5 py-0.5 rounded">
                    EQUIPPED
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-yellow-400 font-bold">
                {info?.sellPrice ?? "?"}g
              </span>
              <button
                onClick={() => onSell(item.id)}
                className="rounded-lg bg-red-900/40 px-4 py-1.5 text-xs font-bold text-red-400 hover:bg-red-900/60 transition-colors"
              >
                Sell
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
