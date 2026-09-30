// In-memory SQLite shim using better-sqlite3.
// Exposes the same synchronous API that expo-sqlite provides so that
// recordStore / attachmentStore / deltaStore can run in Node tests
// without any React Native runtime.
import Database from 'better-sqlite3';

let _db: Database.Database | null = null;

export function openDatabaseSync(_name: string) {
  if (!_db) {
    _db = new Database(':memory:');
  }
  return {
    runSync(sql: string, ...params: unknown[]) {
      _db!.prepare(sql).run(...(params as any[]));
    },
    getFirstSync<T>(sql: string, ...params: unknown[]): T | null {
      return (_db!.prepare(sql).get(...(params as any[])) as T) ?? null;
    },
    getAllSync<T>(sql: string, ...params: unknown[]): T[] {
      return _db!.prepare(sql).all(...(params as any[])) as T[];
    },
    execSync(sql: string) {
      _db!.exec(sql);
    },
    withTransactionSync(fn: () => void) {
      _db!.transaction(fn)();
    },
  };
}

// Reset between tests
export function __resetDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
