const { DatabaseSync } = require('node:sqlite');
class Store {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id));');
  }
  get(kind, id) { const row = this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind,id); return row ? JSON.parse(row.value) : null; }
  list(kind) { return this.db.prepare('SELECT value FROM records WHERE kind=?').all(kind).map(r => JSON.parse(r.value)); }
  put(kind, id, value) { this.db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind,id,JSON.stringify(value)); return value; }
  remove(kind, id) { this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind,id); }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch(e) { this.db.exec('ROLLBACK'); throw e; } }
  close() { this.db.close(); }
}
module.exports = Store;
