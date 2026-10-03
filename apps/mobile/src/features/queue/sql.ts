/**
 * Minimal SQL port. `expo-sqlite`'s SQLiteDatabase satisfies it on the device; the unit tests use
 * Node's built-in `node:sqlite`, so the real SQL of the offline queue is exercised in CI.
 */
export type SqlValue = string | number | null;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlValue[]): Promise<SqlRunResult>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
}
