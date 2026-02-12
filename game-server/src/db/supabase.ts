import jwt from "jsonwebtoken";
import { getSupabase, SUPABASE_JWT_SECRET } from "../config/env.js";
import { ITEM_REGISTRY, type ItemDefinition } from "../types/items.js";
import type { InventoryItem } from "../rooms/schema/RaidState.js";

export interface JwtPayload {
  sub: string;
  email?: string;
}

export function verifySupabaseJwt(token: string): JwtPayload {
  const decoded = jwt.verify(token, SUPABASE_JWT_SECRET) as JwtPayload;
  if (!decoded.sub) {
    throw new Error("Invalid JWT: missing sub claim");
  }
  return decoded;
}

export interface LoadoutItem {
  item_id: string;
  item_type: string;
  stats: Record<string, unknown>;
}

export async function loadPlayerLoadout(
  playerId: string,
): Promise<LoadoutItem[]> {
  const { data, error } = await getSupabase()
    .from("player_loadouts")
    .select("item_id, item_type, stats")
    .eq("player_id", playerId)
    .eq("equipped", true);

  if (error) {
    console.error("Failed to load loadout:", error.message);
    return [];
  }
  return data ?? [];
}

export async function saveRaidResult(params: {
  playerId: string;
  roomId: string;
  result: "survived" | "died";
  lootGained: Array<{ itemId: string; quantity: number }>;
  durationSeconds: number;
}): Promise<void> {
  const { error } = await getSupabase().from("raid_logs").insert({
    player_id: params.playerId,
    room_id: params.roomId,
    result: params.result,
    loot_gained: params.lootGained,
    duration_seconds: params.durationSeconds,
  });

  if (error) {
    console.error("Failed to save raid result:", error.message);
  }
}

export async function deletePlayerEquipment(
  playerId: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("player_loadouts")
    .delete()
    .eq("player_id", playerId)
    .eq("equipped", true);

  if (error) {
    console.error("Failed to delete equipment:", error.message);
  }
}

export async function saveLootToLoadout(
  playerId: string,
  items: InventoryItem[],
): Promise<void> {
  if (items.length === 0) return;

  const rows = items.map((item) => {
    const def = ITEM_REGISTRY[item.itemId];
    return {
      player_id: playerId,
      item_id: item.itemId,
      item_type: item.itemType,
      stats: def ? def.stats : {},
      equipped: true,
    };
  });

  const { error } = await getSupabase().from("player_loadouts").insert(rows);

  if (error) {
    console.error("Failed to save loot to loadout:", error.message);
  }
}

// ── Profile & Inventory ──

export interface PlayerProfile {
  id: string;
  username: string;
  gold: number;
}

export async function getPlayerProfile(
  playerId: string,
): Promise<PlayerProfile | null> {
  const { data, error } = await getSupabase()
    .from("players")
    .select("id, username, gold")
    .eq("id", playerId)
    .single();

  if (error) {
    console.error("Failed to get player profile:", error.message);
    return null;
  }
  return data;
}

export interface PlayerInventoryItem {
  id: string;
  item_id: string;
  item_type: string;
  stats: Record<string, unknown>;
  equipped: boolean;
}

export async function getPlayerInventory(
  playerId: string,
): Promise<PlayerInventoryItem[]> {
  const { data, error } = await getSupabase()
    .from("player_loadouts")
    .select("id, item_id, item_type, stats, equipped")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to get inventory:", error.message);
    return [];
  }
  return data ?? [];
}

export async function toggleEquip(
  playerId: string,
  loadoutId: string,
  equipped: boolean,
): Promise<boolean> {
  const { error } = await getSupabase()
    .from("player_loadouts")
    .update({ equipped })
    .eq("id", loadoutId)
    .eq("player_id", playerId);

  if (error) {
    console.error("Failed to toggle equip:", error.message);
    return false;
  }
  return true;
}

export async function sellItem(
  playerId: string,
  loadoutId: string,
): Promise<{ success: boolean; gold?: number; error?: string }> {
  // Get the item first
  const { data: item, error: fetchError } = await getSupabase()
    .from("player_loadouts")
    .select("item_id")
    .eq("id", loadoutId)
    .eq("player_id", playerId)
    .single();

  if (fetchError || !item) {
    return { success: false, error: "Item not found" };
  }

  const def: ItemDefinition | undefined = ITEM_REGISTRY[item.item_id];
  if (!def) {
    return { success: false, error: "Unknown item" };
  }

  // Delete item and add gold
  const { error: deleteError } = await getSupabase()
    .from("player_loadouts")
    .delete()
    .eq("id", loadoutId)
    .eq("player_id", playerId);

  if (deleteError) {
    return { success: false, error: "Failed to delete item" };
  }

  // Add gold to player
  const { data: player, error: goldError } = await getSupabase()
    .rpc("increment_gold", { player_id_input: playerId, amount: def.sellPrice });

  if (goldError) {
    // Fallback: manual update
    const { data: currentPlayer } = await getSupabase()
      .from("players")
      .select("gold")
      .eq("id", playerId)
      .single();

    const currentGold = currentPlayer?.gold ?? 0;
    const newGold = currentGold + def.sellPrice;
    await getSupabase()
      .from("players")
      .update({ gold: newGold })
      .eq("id", playerId);

    return { success: true, gold: newGold };
  }

  // Get updated gold
  const profile = await getPlayerProfile(playerId);
  return { success: true, gold: profile?.gold ?? 0 };
}

export async function buyItem(
  playerId: string,
  itemId: string,
): Promise<{ success: boolean; gold?: number; error?: string }> {
  const def: ItemDefinition | undefined = ITEM_REGISTRY[itemId];
  if (!def || def.buyPrice === null) {
    return { success: false, error: "Item not purchasable" };
  }

  // Check gold
  const { data: player, error: fetchError } = await getSupabase()
    .from("players")
    .select("gold")
    .eq("id", playerId)
    .single();

  if (fetchError || !player) {
    return { success: false, error: "Player not found" };
  }

  if (player.gold < def.buyPrice) {
    return { success: false, error: "Not enough gold" };
  }

  // Deduct gold
  const newGold = player.gold - def.buyPrice;
  const { error: updateError } = await getSupabase()
    .from("players")
    .update({ gold: newGold })
    .eq("id", playerId);

  if (updateError) {
    return { success: false, error: "Failed to update gold" };
  }

  // Add item to loadout
  const { error: insertError } = await getSupabase()
    .from("player_loadouts")
    .insert({
      player_id: playerId,
      item_id: itemId,
      item_type: def.type,
      stats: def.stats,
      equipped: false,
    });

  if (insertError) {
    // Refund gold on failure
    await getSupabase()
      .from("players")
      .update({ gold: player.gold })
      .eq("id", playerId);
    return { success: false, error: "Failed to add item" };
  }

  return { success: true, gold: newGold };
}
