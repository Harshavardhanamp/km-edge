import type { SQLiteDatabase } from 'expo-sqlite';

export function migration002(db: SQLiteDatabase): void {
  // Defer blob purge until GKS acknowledges delete delta
  try {
    db.execSync(`ALTER TABLE attachments ADD COLUMN pending_delete INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }

  // Store GKS-assigned record ID on delta after acknowledgement
  try {
    db.execSync(`ALTER TABLE delta_log ADD COLUMN gks_record_id TEXT`);
  } catch { /* column already exists */ }

  // Index for pending-delete blob cleanup pass
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_attachments_pending_delete ON attachments(edge_attachment_id) WHERE pending_delete = 1`
  );

  db.runSync(
    `INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (2, ?)`,
    new Date().toISOString()
  );
}
