import type { SQLiteDatabase } from 'expo-sqlite';

// KK-2.2 Packet E2 (GKS contract v2): structure entered at capture, the server's
// resolution list, the identity-name cache (E3) and one capture draft (E-D1).
export function migration006(db: SQLiteDatabase): void {
  for (const column of ['structure_json TEXT', 'resolution_json TEXT']) {
    try {
      db.execSync(`ALTER TABLE records ADD COLUMN ${column}`);
    } catch {}
  }
  db.execSync(`
    CREATE TABLE IF NOT EXISTS identity_cache (
      identity_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      distinction TEXT,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (kind, identity_id, name)
    );
    CREATE INDEX IF NOT EXISTS identity_cache_name_idx ON identity_cache (kind, name_key);
    CREATE TABLE IF NOT EXISTS capture_draft (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.runSync(
    `INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (6, ?)`,
    new Date().toISOString()
  );
}
