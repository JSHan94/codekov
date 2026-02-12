"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchProfile, fetchInventory, toggleEquip, sellItem } from "./api";
import type { PlayerProfile, InventoryItemData } from "./api";
import {
  ITEM_DATA,
  getItemInfo,
  formatStats,
  getTypeColor,
  getTypeLabel,
  type ItemType,
} from "./items";

type FilterType = "all" | ItemType;

const FILTERS: { label: string; value: FilterType }[] = [
  { label: "All", value: "all" },
  { label: "Weapon", value: "weapon" },
  { label: "Armor", value: "armor" },
  { label: "Consumable", value: "consumable" },
  { label: "Utility", value: "utility" },
  { label: "Valuable", value: "valuable" },
];

export default function InventoryPage() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [items, setItems] = useState<InventoryItemData[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedItem, setSelectedItem] = useState<InventoryItemData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [p, inv] = await Promise.all([fetchProfile(), fetchInventory()]);
    setProfile(p);
    setItems(inv);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleEquip = async (item: InventoryItemData) => {
    await toggleEquip(item.id, !item.equipped);
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, equipped: !i.equipped } : i,
      ),
    );
    if (selectedItem?.id === item.id) {
      setSelectedItem((prev) =>
        prev ? { ...prev, equipped: !prev.equipped } : null,
      );
    }
  };

  const handleSell = async (item: InventoryItemData) => {
    const res = await sellItem(item.id);
    if (res.success) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      if (res.gold !== undefined) {
        setProfile((prev) => (prev ? { ...prev, gold: res.gold! } : null));
      }
      setSelectedItem(null);
    }
  };

  const filtered =
    filter === "all"
      ? items
      : items.filter((i) => i.item_type === filter);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-white/30 font-mono text-sm">
        Loading inventory...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col font-mono text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <h2 className="text-lg font-bold tracking-wide">Inventory</h2>
          <p className="text-xs text-white/40">
            {profile?.username ?? "Player"} &middot; {items.length} items
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-yellow-900/30 px-4 py-2">
          <span className="text-yellow-400 text-sm font-bold">
            {profile?.gold ?? 0}
          </span>
          <span className="text-yellow-400/60 text-xs">GOLD</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-white/5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              filter === f.value
                ? "bg-white/10 text-white"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/20">
            <div className="text-4xl mb-3">📦</div>
            <div className="text-sm">No items</div>
            <div className="text-xs mt-1">Start a raid to collect loot!</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((item) => {
              const info = getItemInfo(item.item_id);
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`relative rounded-lg border p-3 text-left transition-all hover:bg-white/5 ${
                    selectedItem?.id === item.id
                      ? "border-white/30 bg-white/10"
                      : "border-white/5 bg-white/[0.02]"
                  }`}
                >
                  {item.equipped && (
                    <span className="absolute top-1.5 right-1.5 text-[9px] bg-green-900/60 text-green-400 px-1.5 py-0.5 rounded">
                      EQUIPPED
                    </span>
                  )}
                  <div
                    className={`text-xs font-bold mb-1 ${
                      info ? getTypeColor(info.type) : "text-white/50"
                    }`}
                  >
                    {info?.name ?? item.item_id}
                  </div>
                  <div className="text-[10px] text-white/30">
                    {info ? getTypeLabel(info.type) : item.item_type}
                  </div>
                  <div className="text-[10px] text-yellow-400/50 mt-1">
                    Sell: {info?.sellPrice ?? "?"}g
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Item detail popup */}
      {selectedItem && (
        <ItemDetailPopup
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onToggleEquip={() => handleToggleEquip(selectedItem)}
          onSell={() => handleSell(selectedItem)}
        />
      )}
    </div>
  );
}

function ItemDetailPopup({
  item,
  onClose,
  onToggleEquip,
  onSell,
}: {
  item: InventoryItemData;
  onClose: () => void;
  onToggleEquip: () => void;
  onSell: () => void;
}) {
  const info = getItemInfo(item.item_id);
  const stats = info ? formatStats(info.stats) : [];
  const isValuable = item.item_type === "valuable";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-80 rounded-xl border border-white/10 bg-[#1a1a2e] p-5 font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div
              className={`text-sm font-bold ${
                info ? getTypeColor(info.type) : "text-white"
              }`}
            >
              {info?.name ?? item.item_id}
            </div>
            <div className="text-[10px] text-white/30 mt-0.5">
              {info ? getTypeLabel(info.type) : item.item_type}
            </div>
          </div>
          {item.equipped && (
            <span className="text-[10px] bg-green-900/60 text-green-400 px-2 py-1 rounded">
              EQUIPPED
            </span>
          )}
        </div>

        {/* Stats */}
        {stats.length > 0 && (
          <div className="space-y-1 mb-4 p-3 rounded-lg bg-white/5">
            {stats.map((s) => (
              <div key={s} className="text-xs text-white/60">
                {s}
              </div>
            ))}
          </div>
        )}

        {/* Price */}
        <div className="text-xs text-yellow-400/60 mb-4">
          Sell price: {info?.sellPrice ?? "?"}g
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {!isValuable && (
            <button
              onClick={onToggleEquip}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition-colors ${
                item.equipped
                  ? "bg-white/10 text-white/70 hover:bg-white/15"
                  : "bg-blue-600/80 text-white hover:bg-blue-600"
              }`}
            >
              {item.equipped ? "Unequip" : "Equip"}
            </button>
          )}
          <button
            onClick={onSell}
            className="flex-1 rounded-lg bg-red-900/40 py-2 text-xs font-bold text-red-400 hover:bg-red-900/60 transition-colors"
          >
            Sell ({info?.sellPrice ?? "?"}g)
          </button>
        </div>
      </div>
    </div>
  );
}
