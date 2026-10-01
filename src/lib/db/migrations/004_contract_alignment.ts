import type { SQLiteDatabase } from 'expo-sqlite';

export function migration004(db: SQLiteDatabase): void {
  // EVENT start/end stored as columns, not injected into body (contract §4)
  try {
    db.execSync(`ALTER TABLE records ADD COLUMN event_start TEXT`);
  } catch {}

  try {
    db.execSync(`ALTER TABLE records ADD COLUMN event_end TEXT`);
  } catch {}

  // Hash the server last acknowledged — used as base_content_sha256 in PUT
  try {
    db.execSync(`ALTER TABLE records ADD COLUMN synced_content_sha256 TEXT`);
  } catch {}

  // Backfill synced_content_sha256 from the most recent ACKNOWLEDGED delta
  db.execSync(`
    UPDATE records
    SET synced_content_sha256 = (
      SELECT d.content_sha256
      FROM delta_log d
      WHERE d.edge_id = records.edge_id
        AND d.status = 'ACKNOWLEDGED'
        AND d.content_sha256 IS NOT NULL
      ORDER BY d.seq DESC
      LIMIT 1
    )
    WHERE synced_content_sha256 IS NULL
  `);

  // Telemetry table is superseded by contract telemetry endpoint (K5)
  db.execSync(`DELETE FROM telemetry_events`);

  db.runSync(
    `INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (4, ?)`,
    new Date().toISOString()
  );
}
