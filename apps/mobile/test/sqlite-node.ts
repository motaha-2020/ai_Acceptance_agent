import type { SqlDb, SqlRunResult, SqlValue } from '../src/features/queue/sql';

interface Statement {
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: SqlValue[]): unknown[];
  get(...params: SqlValue[]): unknown;
}
interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
}

/**
 * SqlDb over Node's built-in `node:sqlite` (Node >= 22.5). Loaded via getBuiltinModule so Vite does
 * not try to bundle it. A file path lets tests "restart the app" by reopening the same database.
 */
export function openNodeSqlite(file = ':memory:'): SqlDb & { close(): void } {
  const mod = process.getBuiltinModule('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSync };
  const db = new mod.DatabaseSync(file);
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params): Promise<SqlRunResult> {
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getAllAsync<T>(sql: string, params: SqlValue[]) {
      return db.prepare(sql).all(...params).map((row) => ({ ...(row as object) })) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[]) {
      const row = db.prepare(sql).get(...params);
      return (row ? { ...(row as object) } : null) as T | null;
    },
    close() {
      db.close();
    },
  };
}
