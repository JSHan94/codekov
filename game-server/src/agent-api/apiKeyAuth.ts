const DEV_MODE = process.env.DEV_MODE === "true";

function getValidApiKeys(): Set<string> {
  const raw = process.env.AGENT_API_KEYS ?? "";
  const keys = new Set<string>();
  for (const k of raw.split(",")) {
    const trimmed = k.trim();
    if (trimmed) keys.add(trimmed);
  }
  return keys;
}

const validKeys = getValidApiKeys();

export function validateApiKey(ctx: { headers: Headers }): boolean {
  if (DEV_MODE) return true;

  const auth = ctx.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const key = auth.slice(7);
  return validKeys.has(key);
}
