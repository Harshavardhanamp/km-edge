import type { SQLiteDatabase } from 'expo-sqlite';

export function migration003(db: SQLiteDatabase): void {
  try {
    db.execSync(
      `ALTER TABLE attachments ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'PENDING'`
    );
  } catch {}

  try {
    db.execSync(`ALTER TABLE attachments ADD COLUMN sync_error TEXT`);
  } catch {}

  try {
    db.execSync(
      `ALTER TABLE attachments ADD COLUMN delete_delta_seq INTEGER`
    );
  } catch {}

  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_attachments_purge_eligible
     ON attachments(edge_attachment_id)
     WHERE pending_delete = 1`
  );

  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_attachments_sync_status
     ON attachments(sync_status)
     WHERE sync_status = 'PENDING'`
  );

  db.runSync(
    `INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (3, ?)`,
    new Date().toISOString()
  );
}
