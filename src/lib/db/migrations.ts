import type { SQLiteDatabase } from 'expo-sqlite';
import { migration001 } from './migrations/001_initial';
import { migration002 } from './migrations/002_v2';
import { migration003 } from './migrations/003_v2_attachment_sync';

const MIGRATIONS: { version: number; run: (db: SQLiteDatabase) => void }[] = [
  { version: 1, run: migration001 },
  { version: 2, run: migration002 },
  { version: 3, run: migration003 },
];

export function runMigrations(db: SQLiteDatabase): void {
  let applied: number[] = [];
  try {
    const rows = db.getAllSync<{ version: number }>(
      `SELECT version FROM schema_migrations`
    );
    applied = rows.map((r) => r.version);
  } catch {
    // schema_migrations doesn't exist yet — first run
  }

  for (const migration of MIGRATIONS) {
    if (!applied.includes(migration.version)) {
      migration.run(db);
    }
  }
}
