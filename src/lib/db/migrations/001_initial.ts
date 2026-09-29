import type { SQLiteDatabase } from 'expo-sqlite';

export function migration001(db: SQLiteDatabase): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS records (
      edge_id TEXT PRIMARY KEY,
      gks_id TEXT,
      schema_version INTEGER NOT NULL DEFAULT 1,
      type TEXT NOT NULL,
      capture_kind TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'human',
      classification TEXT NOT NULL DEFAULT 'NORMAL',
      importance TEXT NOT NULL DEFAULT 'NORMAL',
      tags TEXT NOT NULL DEFAULT '[]',
      life_areas TEXT NOT NULL DEFAULT '[]',
      place TEXT,
      about TEXT NOT NULL DEFAULT '[]',
      relationships TEXT NOT NULL DEFAULT '[]',
      captured_at TEXT NOT NULL,
      updated_at TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'PENDING',
      content_sha256 TEXT NOT NULL,
      native_calendar_event_id TEXT,
      has_calendar_entry INTEGER NOT NULL DEFAULT 0,
      reminder_minutes INTEGER
    )
  `);

  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_records_captured_at ON records(captured_at DESC) WHERE is_deleted = 0`
  );
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_records_sync_status ON records(sync_status) WHERE is_deleted = 0`
  );

  db.execSync(`
    CREATE TABLE IF NOT EXISTS delta_log (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      edge_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      record_type TEXT NOT NULL,
      capture_kind TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      content_sha256 TEXT,
      attachment_edge_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'PENDING',
      gks_id TEXT,
      gks_acknowledged_at TEXT,
      gks_error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_delta_pending ON delta_log(seq) WHERE status = 'PENDING'`
  );

  db.execSync(`
    CREATE TABLE IF NOT EXISTS attachments (
      edge_attachment_id TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL UNIQUE,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      blob_path TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      gks_attachment_id TEXT
    )
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS record_attachments (
      edge_id TEXT NOT NULL,
      edge_attachment_id TEXT NOT NULL,
      PRIMARY KEY (edge_id, edge_attachment_id)
    )
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_name TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      transmitted INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_telemetry_pending ON telemetry_events(id) WHERE transmitted = 0`
  );

  db.runSync(
    `INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, ?)`,
    new Date().toISOString()
  );
}
