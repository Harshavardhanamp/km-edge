import type { SQLiteDatabase } from 'expo-sqlite';
import { migration001 } from './migrations/001_initial';

const MIGRATIONS: { version: number; run: (db: SQLiteDatabase) => void }[] = [
  { version: 1, run: migration001 },
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
