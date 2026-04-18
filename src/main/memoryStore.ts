/**
 * memoryStore.ts — local SQLite memory for the scanner/tuner.
 *
 * Stores confirmed map fingerprints so the scanner can auto-identify maps on
 * future binaries instead of guessing from scratch every time.
 *
 * Design:
 *   - One SQLite file, default location = %APPDATA%/DCTuning/memory.db.
 *   - User can point it at a OneDrive / Google Drive folder via Settings →
 *     the file syncs automatically, gives free multi-device + backup without
 *     adding any cloud code here.
 *   - One table `fingerprints` + an ancillary `meta` table.
 *   - All database work runs on the Electron MAIN process via the sync API of
 *     better-sqlite3. Queries are fast enough (<1 ms at 100k rows with the
 *     indexes below) that a sync API inside an async IPC handler is fine.
 *   - Renderer talks to this only via IPC — never imports better-sqlite3
 *     directly.
 */

import Database from 'better-sqlite3'
import type { Database as DB, Statement } from 'better-sqlite3'
import { app } from 'electron'
import { dirname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'

// ─── Types ────────────────────────────────────────────────────────────────────

/** One confirmed-map record. sigHex is the 12-byte Kf_ header in lowercase hex. */
export interface FingerprintEntry {
  id: string
  ecuFamily: string
  partNumber: string | null
  sigHex: string
  rows: number
  cols: number
  dtype: 'uint8' | 'int8' | 'uint16' | 'int16'
  le: boolean
  factor: number
  offsetVal: number
  unit: string | null
  mapDefId: string | null
  mapName: string
  category: string | null
  xAxis: number[] | null
  yAxis: number[] | null
  dataMin: number | null
  dataMax: number | null
  dataMean: number | null
  dna128: number[] | null
  confirmedBy: string | null
  confirmedAt: string    // ISO8601
  lastSeenAt: string     // ISO8601
  seenCount: number
  notes: string | null
}

export interface ImportResult {
  imported: number
  skipped: number
  updated: number
}

export interface StoreStatus {
  path: string
  exists: boolean
  count: number
  sizeBytes: number
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS fingerprints (
    id            TEXT PRIMARY KEY,
    ecu_family    TEXT NOT NULL,
    part_number   TEXT,
    sig_hex       TEXT NOT NULL,
    rows          INTEGER NOT NULL,
    cols          INTEGER NOT NULL,
    dtype         TEXT NOT NULL,
    le            INTEGER NOT NULL,
    factor        REAL NOT NULL,
    offset_val    REAL NOT NULL DEFAULT 0,
    unit          TEXT,
    map_def_id    TEXT,
    map_name      TEXT NOT NULL,
    category      TEXT,
    x_axis        TEXT,
    y_axis        TEXT,
    data_min      REAL,
    data_max      REAL,
    data_mean     REAL,
    dna128        TEXT,
    confirmed_by  TEXT,
    confirmed_at  TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL,
    seen_count    INTEGER NOT NULL DEFAULT 1,
    notes         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_fp_sig      ON fingerprints(sig_hex);
  CREATE INDEX IF NOT EXISTS idx_fp_family   ON fingerprints(ecu_family);
  CREATE INDEX IF NOT EXISTS idx_fp_partnum  ON fingerprints(part_number);
  CREATE INDEX IF NOT EXISTS idx_fp_sig_dims ON fingerprints(sig_hex, rows, cols);

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`

// ─── Row mapping ──────────────────────────────────────────────────────────────

interface Row {
  id: string
  ecu_family: string
  part_number: string | null
  sig_hex: string
  rows: number
  cols: number
  dtype: string
  le: number
  factor: number
  offset_val: number
  unit: string | null
  map_def_id: string | null
  map_name: string
  category: string | null
  x_axis: string | null
  y_axis: string | null
  data_min: number | null
  data_max: number | null
  data_mean: number | null
  dna128: string | null
  confirmed_by: string | null
  confirmed_at: string
  last_seen_at: string
  seen_count: number
  notes: string | null
}

function rowToEntry(r: Row): FingerprintEntry {
  return {
    id: r.id,
    ecuFamily: r.ecu_family,
    partNumber: r.part_number,
    sigHex: r.sig_hex,
    rows: r.rows,
    cols: r.cols,
    dtype: r.dtype as FingerprintEntry['dtype'],
    le: r.le === 1,
    factor: r.factor,
    offsetVal: r.offset_val,
    unit: r.unit,
    mapDefId: r.map_def_id,
    mapName: r.map_name,
    category: r.category,
    xAxis: r.x_axis ? JSON.parse(r.x_axis) : null,
    yAxis: r.y_axis ? JSON.parse(r.y_axis) : null,
    dataMin: r.data_min,
    dataMax: r.data_max,
    dataMean: r.data_mean,
    dna128: r.dna128 ? JSON.parse(r.dna128) : null,
    confirmedBy: r.confirmed_by,
    confirmedAt: r.confirmed_at,
    lastSeenAt: r.last_seen_at,
    seenCount: r.seen_count,
    notes: r.notes,
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

class MemoryStore {
  private db: DB | null = null
  private path: string = ''

  // Prepared statements — rebuilt after each init()/relocate()
  private stmtFindBySig: Statement | null = null
  private stmtFindBySigDims: Statement | null = null
  private stmtUpsert: Statement | null = null
  private stmtDelete: Statement | null = null
  private stmtCount: Statement | null = null

  /** Absolute path we'd use if the user never overrides. */
  defaultPath(): string {
    return join(app.getPath('userData'), 'memory.db')
  }

  /** Open (or create) the DB at `path` (or the default). Safe to call again to relocate. */
  init(path?: string): StoreStatus {
    this.close()
    const target = path && path.trim() !== '' ? path : this.defaultPath()
    const dir = dirname(target)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    this.db = new Database(target)
    // WAL mode = better concurrency + crash safety; suited for a local single-writer app.
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.exec(SCHEMA)
    this.path = target
    this.prepare()
    return this.status()
  }

  close(): void {
    if (this.db) {
      try { this.db.close() } catch { /* ignore close errors */ }
      this.db = null
    }
    this.stmtFindBySig = null
    this.stmtFindBySigDims = null
    this.stmtUpsert = null
    this.stmtDelete = null
    this.stmtCount = null
  }

  private ensure(): DB {
    if (!this.db) return this.init().exists ? this.db! : (this.init() && this.db!)
    return this.db
  }

  private prepare(): void {
    const db = this.db!
    this.stmtFindBySig = db.prepare(`SELECT * FROM fingerprints WHERE sig_hex = ? ORDER BY seen_count DESC, last_seen_at DESC`)
    this.stmtFindBySigDims = db.prepare(`SELECT * FROM fingerprints WHERE sig_hex = ? AND rows = ? AND cols = ? ORDER BY seen_count DESC, last_seen_at DESC`)
    this.stmtUpsert = db.prepare(`
      INSERT INTO fingerprints (
        id, ecu_family, part_number, sig_hex, rows, cols, dtype, le, factor, offset_val,
        unit, map_def_id, map_name, category, x_axis, y_axis, data_min, data_max, data_mean,
        dna128, confirmed_by, confirmed_at, last_seen_at, seen_count, notes
      ) VALUES (
        @id, @ecu_family, @part_number, @sig_hex, @rows, @cols, @dtype, @le, @factor, @offset_val,
        @unit, @map_def_id, @map_name, @category, @x_axis, @y_axis, @data_min, @data_max, @data_mean,
        @dna128, @confirmed_by, @confirmed_at, @last_seen_at, @seen_count, @notes
      )
      ON CONFLICT(id) DO UPDATE SET
        ecu_family   = excluded.ecu_family,
        part_number  = excluded.part_number,
        sig_hex      = excluded.sig_hex,
        rows         = excluded.rows,
        cols         = excluded.cols,
        dtype        = excluded.dtype,
        le           = excluded.le,
        factor       = excluded.factor,
        offset_val   = excluded.offset_val,
        unit         = excluded.unit,
        map_def_id   = excluded.map_def_id,
        map_name     = excluded.map_name,
        category     = excluded.category,
        x_axis       = excluded.x_axis,
        y_axis       = excluded.y_axis,
        data_min     = excluded.data_min,
        data_max     = excluded.data_max,
        data_mean    = excluded.data_mean,
        dna128       = excluded.dna128,
        confirmed_by = excluded.confirmed_by,
        last_seen_at = excluded.last_seen_at,
        seen_count   = excluded.seen_count,
        notes        = excluded.notes
    `)
    this.stmtDelete = db.prepare(`DELETE FROM fingerprints WHERE id = ?`)
    this.stmtCount = db.prepare(`SELECT COUNT(*) as n FROM fingerprints`)
  }

  // ─── Queries ────────────────────────────────────────────────────────────────

  /** Return the best hit for the given Kf_ sigHex (and optionally dims). */
  find(sigHex: string, rows?: number, cols?: number): FingerprintEntry[] {
    const db = this.ensure(); if (!db) return []
    const sig = sigHex.toLowerCase()
    const rows_ = (rows !== undefined && cols !== undefined)
      ? (this.stmtFindBySigDims!.all(sig, rows, cols) as Row[])
      : (this.stmtFindBySig!.all(sig) as Row[])
    return rows_.map(rowToEntry)
  }

  /** Insert or update (by id). If id is not provided we generate one. */
  save(entry: Partial<FingerprintEntry> & Omit<FingerprintEntry, 'id' | 'confirmedAt' | 'lastSeenAt' | 'seenCount'>): FingerprintEntry {
    const db = this.ensure(); if (!db) throw new Error('memory store not available')
    const now = new Date().toISOString()
    const id = entry.id ?? randomUUID()

    // Bump seen_count if it's an upsert to an existing id
    let seenCount = entry.seenCount ?? 1
    if (entry.id) {
      const existing = db.prepare(`SELECT seen_count FROM fingerprints WHERE id = ?`).get(entry.id) as { seen_count: number } | undefined
      if (existing) seenCount = existing.seen_count + 1
    }

    const final: FingerprintEntry = {
      id,
      ecuFamily: entry.ecuFamily,
      partNumber: entry.partNumber ?? null,
      sigHex: entry.sigHex.toLowerCase(),
      rows: entry.rows,
      cols: entry.cols,
      dtype: entry.dtype,
      le: entry.le,
      factor: entry.factor,
      offsetVal: entry.offsetVal ?? 0,
      unit: entry.unit ?? null,
      mapDefId: entry.mapDefId ?? null,
      mapName: entry.mapName,
      category: entry.category ?? null,
      xAxis: entry.xAxis ?? null,
      yAxis: entry.yAxis ?? null,
      dataMin: entry.dataMin ?? null,
      dataMax: entry.dataMax ?? null,
      dataMean: entry.dataMean ?? null,
      dna128: entry.dna128 ?? null,
      confirmedBy: entry.confirmedBy ?? null,
      confirmedAt: entry.confirmedAt ?? now,
      lastSeenAt: now,
      seenCount,
      notes: entry.notes ?? null,
    }

    this.stmtUpsert!.run({
      id:           final.id,
      ecu_family:   final.ecuFamily,
      part_number:  final.partNumber,
      sig_hex:      final.sigHex,
      rows:         final.rows,
      cols:         final.cols,
      dtype:        final.dtype,
      le:           final.le ? 1 : 0,
      factor:       final.factor,
      offset_val:   final.offsetVal,
      unit:         final.unit,
      map_def_id:   final.mapDefId,
      map_name:     final.mapName,
      category:     final.category,
      x_axis:       final.xAxis ? JSON.stringify(final.xAxis) : null,
      y_axis:       final.yAxis ? JSON.stringify(final.yAxis) : null,
      data_min:     final.dataMin,
      data_max:     final.dataMax,
      data_mean:    final.dataMean,
      dna128:       final.dna128 ? JSON.stringify(final.dna128) : null,
      confirmed_by: final.confirmedBy,
      confirmed_at: final.confirmedAt,
      last_seen_at: final.lastSeenAt,
      seen_count:   final.seenCount,
      notes:        final.notes,
    })
    return final
  }

  /** Bump seen_count + last_seen_at without any other changes. Used by the scanner
   *  path when we auto-identify a map from memory — record that we've seen it again. */
  markSeen(id: string): void {
    const db = this.ensure(); if (!db) return
    const now = new Date().toISOString()
    db.prepare(`UPDATE fingerprints SET seen_count = seen_count + 1, last_seen_at = ? WHERE id = ?`).run(now, id)
  }

  /** Delete by id. Returns true if a row was removed. */
  deleteById(id: string): boolean {
    const db = this.ensure(); if (!db) return false
    const info = this.stmtDelete!.run(id)
    return info.changes > 0
  }

  /** Paginated list with optional filters. */
  list(opts: { limit?: number; offset?: number; ecuFamily?: string; search?: string } = {}): { entries: FingerprintEntry[]; total: number } {
    const db = this.ensure(); if (!db) return { entries: [], total: 0 }
    const limit = Math.max(1, Math.min(1000, opts.limit ?? 100))
    const offset = Math.max(0, opts.offset ?? 0)
    const where: string[] = []
    const params: any[] = []
    if (opts.ecuFamily) { where.push(`ecu_family = ?`); params.push(opts.ecuFamily) }
    if (opts.search) {
      where.push(`(map_name LIKE ? OR part_number LIKE ? OR sig_hex LIKE ?)`)
      const like = `%${opts.search}%`
      params.push(like, like, like.toLowerCase())
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = (db.prepare(`SELECT COUNT(*) as n FROM fingerprints ${whereSql}`).get(...params) as { n: number }).n
    const rows = db.prepare(`
      SELECT * FROM fingerprints ${whereSql}
      ORDER BY last_seen_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Row[]
    return { entries: rows.map(rowToEntry), total }
  }

  /** Number of rows. */
  count(): number {
    const db = this.ensure(); if (!db) return 0
    return (this.stmtCount!.get() as { n: number }).n
  }

  // ─── Export / Import ───────────────────────────────────────────────────────

  /** Dump every row as FingerprintEntry[] — suitable for JSON serialisation. */
  exportAll(): FingerprintEntry[] {
    const db = this.ensure(); if (!db) return []
    const rows = db.prepare(`SELECT * FROM fingerprints ORDER BY confirmed_at ASC`).all() as Row[]
    return rows.map(rowToEntry)
  }

  /** Bulk-merge. Existing IDs are updated, new IDs inserted. */
  importAll(entries: FingerprintEntry[]): ImportResult {
    const db = this.ensure(); if (!db) return { imported: 0, skipped: 0, updated: 0 }
    let imported = 0, updated = 0, skipped = 0
    const tx = db.transaction((batch: FingerprintEntry[]) => {
      for (const e of batch) {
        if (!e.id || !e.sigHex || !e.mapName || !e.ecuFamily || e.rows == null || e.cols == null) {
          skipped++; continue
        }
        const existing = db.prepare(`SELECT id FROM fingerprints WHERE id = ?`).get(e.id)
        this.stmtUpsert!.run({
          id:           e.id,
          ecu_family:   e.ecuFamily,
          part_number:  e.partNumber ?? null,
          sig_hex:      e.sigHex.toLowerCase(),
          rows:         e.rows,
          cols:         e.cols,
          dtype:        e.dtype,
          le:           e.le ? 1 : 0,
          factor:       e.factor,
          offset_val:   e.offsetVal ?? 0,
          unit:         e.unit ?? null,
          map_def_id:   e.mapDefId ?? null,
          map_name:     e.mapName,
          category:     e.category ?? null,
          x_axis:       e.xAxis ? JSON.stringify(e.xAxis) : null,
          y_axis:       e.yAxis ? JSON.stringify(e.yAxis) : null,
          data_min:     e.dataMin ?? null,
          data_max:     e.dataMax ?? null,
          data_mean:    e.dataMean ?? null,
          dna128:       e.dna128 ? JSON.stringify(e.dna128) : null,
          confirmed_by: e.confirmedBy ?? null,
          confirmed_at: e.confirmedAt ?? new Date().toISOString(),
          last_seen_at: e.lastSeenAt ?? new Date().toISOString(),
          seen_count:   e.seenCount ?? 1,
          notes:        e.notes ?? null,
        })
        if (existing) updated++; else imported++
      }
    })
    tx(entries)
    return { imported, updated, skipped }
  }

  // ─── Status ─────────────────────────────────────────────────────────────────

  status(): StoreStatus {
    let sizeBytes = 0
    try {
      if (this.path && existsSync(this.path)) {
        const { statSync } = require('fs') as typeof import('fs')
        sizeBytes = statSync(this.path).size
      }
    } catch { /* ignore stat errors */ }
    return {
      path: this.path,
      exists: !!this.path && existsSync(this.path),
      count: this.db ? this.count() : 0,
      sizeBytes,
    }
  }

  getPath(): string { return this.path }
}

// Singleton — one store per app lifetime.
export const memoryStore = new MemoryStore()
