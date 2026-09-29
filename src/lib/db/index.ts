import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { runMigrations } from './migrations';

const db: SQLiteDatabase = openDatabaseSync('km-edge.db');
runMigrations(db);

export { db };
