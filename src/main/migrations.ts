import Database from 'better-sqlite3'
import fs from 'fs'
import { join } from 'path'

interface Migration {
  version: number
  name: string
  sql: string
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'init',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS ecu_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        size INTEGER NOT NULL,
        ident TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS tuning_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ecu_file_id INTEGER NOT NULL REFERENCES ecu_files(id),
        stage INTEGER NOT NULL DEFAULT 1,
        addons TEXT, -- JSON array
        status TEXT NOT NULL DEFAULT 'draft',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS map_edits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES tuning_sessions(id),
        map_id TEXT NOT NULL,
        edit_type TEXT NOT NULL, -- 'multiply', 'addend', 'zone'
        value REAL,
        zone_data TEXT, -- JSON for zone edits
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `,
  },
  {
    version: 2,
    name: 'add_fingerprints',
    sql: `
      CREATE TABLE IF NOT EXISTS fingerprints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL UNIQUE,
        part_number TEXT,
        software_version TEXT,
        ecu_family TEXT,
        file_size INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_fingerprints_hash ON fingerprints(hash);
    `,
  },
]

export function runMigrations(db: Database.Database, migrationsDir?: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)

  const currentVersion = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null }
  const startVersion = currentVersion?.v ?? 0

  for (const migration of MIGRATIONS) {
    if (migration.version > startVersion) {
      console.log(`Applying migration ${migration.version}: ${migration.name}`)
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version)
    }
  }

  // Load external migrations from directory if provided
  if (migrationsDir && fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()
    
    for (const file of files) {
      const version = parseInt(file.split('_')[0], 10)
      if (version > startVersion) {
        const sql = fs.readFileSync(join(migrationsDir, file), 'utf-8')
        console.log(`Applying external migration: ${file}`)
        db.exec(sql)
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version)
      }
    }
  }

  const finalVersion = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null }
  console.log(`Database at version ${finalVersion?.v ?? 0}`)
}
