/**
 * App Settings — chave/valor persistido em banco, editável via UI admin.
 *
 * Estratégia:
 *  - Configs que mudam com frequência (Facebook App ID/Secret, webhook
 *    token, origem pública) ficam aqui. Editáveis pelo admin sem redeploy.
 *  - Bootstrap crítico (DATABASE_URL, JWT_SECRET) continua no .env porque
 *    o app precisa deles ANTES de abrir o banco.
 *  - Cache em memória com TTL de 30s evita martelar o banco em cada request.
 *  - Auto-criação da tabela no boot via `ensureAppSettingsTable()` — não
 *    precisa rodar `drizzle-kit migrate` pra essa tabela funcionar.
 */

import { eq } from "drizzle-orm";
import { appSettings } from "../drizzle/schema";
import { getDb, getRawConnection } from "./db";

export type SettingKey =
  | "FACEBOOK_APP_ID"
  | "FACEBOOK_APP_SECRET"
  | "WHATSAPP_WEBHOOK_TOKEN"
  | "APP_ORIGIN"
  | "OWNER_OPEN_ID";

const CACHE_TTL_MS = 30_000;

type CacheEntry = { value: string | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

let tableEnsured = false;

/**
 * Cria a tabela `app_settings` se ainda não existir. Idempotente.
 * Chamado lazy uma vez por processo, na primeira leitura/escrita.
 */
async function ensureAppSettingsTable(): Promise<void> {
  if (tableEnsured) return;
  const conn = await getRawConnection();
  if (!conn) return;
  await conn.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      \`key\` VARCHAR(64) NOT NULL PRIMARY KEY,
      \`value\` TEXT,
      \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  tableEnsured = true;
}

function readEnvFallback(key: SettingKey): string | null {
  const v = process.env[key];
  return v && v.length > 0 ? v : null;
}

/**
 * Lê uma config priorizando: banco > process.env > null.
 * Resultado é cacheado em memória por CACHE_TTL_MS.
 */
export async function getSetting(key: SettingKey): Promise<string | null> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  await ensureAppSettingsTable();
  const db = await getDb();
  let value: string | null = null;

  if (db) {
    try {
      const rows = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, key))
        .limit(1);
      if (rows.length > 0 && rows[0].value && rows[0].value.length > 0) {
        value = rows[0].value;
      }
    } catch (err) {
      console.warn(`[Settings] read failed for ${key}, falling back to env:`, err);
    }
  }

  if (value === null) value = readEnvFallback(key);

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Versão sync que retorna apenas o cache (útil pra hot paths). Se o cache
 * estiver vazio, retorna o fallback do env imediatamente — sem ir ao banco.
 * Use `getSetting()` (async) sempre que possível.
 */
export function getSettingCached(key: SettingKey): string | null {
  const cached = cache.get(key);
  if (cached) return cached.value;
  return readEnvFallback(key);
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await ensureAppSettingsTable();
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const trimmed = value.trim();
  // upsert: tenta update, se 0 rows mudou faz insert
  const existing = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(appSettings)
      .set({ value: trimmed })
      .where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value: trimmed });
  }

  cache.set(key, { value: trimmed || null, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function getAllSettings(): Promise<Record<SettingKey, string | null>> {
  const keys: SettingKey[] = [
    "FACEBOOK_APP_ID",
    "FACEBOOK_APP_SECRET",
    "WHATSAPP_WEBHOOK_TOKEN",
    "APP_ORIGIN",
    "OWNER_OPEN_ID",
  ];
  const entries = await Promise.all(keys.map(async (k) => [k, await getSetting(k)] as const));
  return Object.fromEntries(entries) as Record<SettingKey, string | null>;
}

/** Invalida o cache de uma chave (chamado após update). */
export function invalidateCache(key?: SettingKey): void {
  if (key) cache.delete(key);
  else cache.clear();
}
