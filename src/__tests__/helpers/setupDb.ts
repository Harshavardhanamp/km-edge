// Runs all migrations against the in-memory SQLite shim so tests start
// with a fully-initialised schema. Call resetDb() in beforeEach.
import { openDatabaseSync, __resetDb } from 'expo-sqlite';
import { migration001 } from '../../lib/db/migrations/001_initial';
import { migration002 } from '../../lib/db/migrations/002_v2';
import { migration003 } from '../../lib/db/migrations/003_v2_attachment_sync';

export function resetDb() {
  __resetDb();
  const db = openDatabaseSync('test.db');
  migration001(db as any);
  migration002(db as any);
  migration003(db as any);
}
