import { supabase } from "@/lib/supabase";

const API_BASE =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL?.replace(/^ws/, "http") ||
  "http://localhost:2567";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Get current session token for authenticated requests
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  return res.json() as Promise<T>;
}

// ── Types ──

export interface PlayerProfile {
  id: string;
  username: string;
  gold: number;
}

export interface InventoryItemData {
  id: string;
  item_id: string;
  item_type: string;
  stats: Record<string, unknown>;
  equipped: boolean;
}

// ── API calls ──

export async function fetchProfile(): Promise<PlayerProfile> {
  return apiFetch<PlayerProfile>("/api/profile");
}

export async function fetchInventory(): Promise<InventoryItemData[]> {
  const res = await apiFetch<{ items: InventoryItemData[] }>("/api/inventory");
  return res.items ?? [];
}

export async function toggleEquip(
  loadoutId: string,
  equipped: boolean,
): Promise<{ success?: boolean; error?: string }> {
  return apiFetch("/api/inventory/equip", {
    method: "POST",
    body: JSON.stringify({ loadoutId, equipped }),
  });
}

export async function buyItem(
  itemId: string,
): Promise<{ success?: boolean; gold?: number; error?: string }> {
  return apiFetch("/api/shop/buy", {
    method: "POST",
    body: JSON.stringify({ itemId }),
  });
}

export async function sellItem(
  loadoutId: string,
): Promise<{ success?: boolean; gold?: number; error?: string }> {
  return apiFetch("/api/shop/sell", {
    method: "POST",
    body: JSON.stringify({ loadoutId }),
  });
}
