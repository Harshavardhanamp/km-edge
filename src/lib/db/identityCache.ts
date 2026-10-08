import { db } from './index';

// KK-2.2 E3: Topic / Place / Person names from GKS (`GET /api/v1/edge/identities`),
// names only. Replaced on every refresh; cleared on sign-out (E3.3).
export type IdentityKind = 'topic' | 'place' | 'person';
export interface CachedIdentity {
  identity_id: string;
  kind: IdentityKind;
  name: string;
  distinction: string | null;
}

export const nameKey = (value: string) => value.normalize('NFC').toLocaleLowerCase().split(/\s+/).filter(Boolean).join(' ');

export function replaceIdentities(rows: CachedIdentity[], fetchedAt = new Date().toISOString()): void {
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM identity_cache`);
    for (const row of rows) {
      db.runSync(
        `INSERT OR REPLACE INTO identity_cache (identity_id, kind, name, name_key, distinction, fetched_at) VALUES (?, ?, ?, ?, ?, ?)`,
        row.identity_id, row.kind, row.name, nameKey(row.name), row.distinction ?? null, fetchedAt
      );
    }
  });
}

/** Prefix matches first, then other substring matches; one row per identity (aliases collapse). */
export function searchIdentities(kind: IdentityKind, text: string, limit = 20): CachedIdentity[] {
  const key = nameKey(text);
  const rows = db.getAllSync<CachedIdentity & { name_key: string }>(
    `SELECT identity_id, kind, name, name_key, distinction FROM identity_cache WHERE kind = ? AND name_key LIKE ? ORDER BY name_key`,
    kind, `%${key.replace(/[%_]/g, '')}%`
  );
  const ranked = [...rows.filter((r: { name_key: string }) => r.name_key.startsWith(key)), ...rows.filter((r: { name_key: string }) => !r.name_key.startsWith(key))];
  const seen = new Set<string>();
  const out: CachedIdentity[] = [];
  for (const r of ranked) {
    if (seen.has(r.identity_id)) continue;
    seen.add(r.identity_id);
    out.push({ identity_id: r.identity_id, kind: r.kind, name: r.name, distinction: r.distinction ?? null });
    if (out.length >= limit) break;
  }
  return out;
}

/** Cached identities whose name (or alias) is exactly this name — for "Use existing ✓". */
export function exactIdentities(kind: IdentityKind, name: string): CachedIdentity[] {
  return db.getAllSync<CachedIdentity>(
    `SELECT DISTINCT identity_id, kind, name, distinction FROM identity_cache WHERE kind = ? AND name_key = ?`,
    kind, nameKey(name)
  );
}

export function identityCount(): number {
  return db.getFirstSync<{ n: number }>(`SELECT COUNT(DISTINCT identity_id) AS n FROM identity_cache`)?.n ?? 0;
}

export function clearIdentities(): void {
  db.runSync(`DELETE FROM identity_cache`);
}

/** The cached name for an identity id (first row), for suggested chips. */
export function identityName(identityId: string): string | null {
  return db.getFirstSync<{ name: string }>(`SELECT name FROM identity_cache WHERE identity_id = ? ORDER BY name LIMIT 1`, identityId)?.name ?? null;
}
