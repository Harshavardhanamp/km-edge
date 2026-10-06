import type { SQLiteDatabase } from 'expo-sqlite';

export function migration005(db: SQLiteDatabase): void {
  // Scanner result GKS stored for the uploaded file (contract §6); NULL until synced.
  try {
    db.execSync(`ALTER TABLE attachments ADD COLUMN scan_status TEXT`);
  } catch {}

  db.runSync(
    `INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (5, ?)`,
    new Date().toISOString()
  );
}
