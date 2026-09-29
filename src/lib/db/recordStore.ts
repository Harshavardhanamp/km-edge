import { db } from './index';
import type { EdgeRecord, LifeArea, SyncStatus } from '../types';

type RecordRow = {
  edge_id: string;
  gks_id: string | null;
  schema_version: number;
  type: string;
  capture_kind: string;
  title: string;
  content: string;
  created: string;
  author: string;
  classification: string;
  importance: string;
  tags: string;
  life_areas: string;
  place: string | null;
  about: string;
  relationships: string;
  captured_at: string;
  updated_at: string | null;
  is_deleted: number;
  deleted_at: string | null;
  sync_status: string;
  content_sha256: string;
  native_calendar_event_id: string | null;
  has_calendar_entry: number;
  reminder_minutes: number | null;
};

function rowToRecord(row: RecordRow): EdgeRecord {
  return {
    edge_id: row.edge_id,
    gks_id: row.gks_id,
    schema_version: 1,
    type: row.type as EdgeRecord['type'],
    capture_kind: row.capture_kind as EdgeRecord['capture_kind'],
    title: row.title,
    content: row.content,
    created: row.created,
    author: 'human',
    classification: row.classification as EdgeRecord['classification'],
    importance: row.importance as EdgeRecord['importance'],
    tags: JSON.parse(row.tags) as string[],
    life_areas: JSON.parse(row.life_areas) as LifeArea[],
    place: row.place ? (JSON.parse(row.place) as EdgeRecord['place']) : null,
    about: JSON.parse(row.about) as string[],
    relationships: JSON.parse(row.relationships) as string[],
    attachments: [],
    captured_at: row.captured_at,
    sync_status: row.sync_status as SyncStatus,
    sync_error: null,
  };
}

export function createRecord(
  record: Omit<EdgeRecord, 'attachments'> & {
    content_sha256: string;
    native_calendar_event_id?: string | null;
    has_calendar_entry?: boolean;
    reminder_minutes?: number | null;
  }
): void {
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO records (
        edge_id, gks_id, schema_version, type, capture_kind, title, content,
        created, author, classification, importance, tags, life_areas, place,
        about, relationships, captured_at, sync_status, content_sha256,
        native_calendar_event_id, has_calendar_entry, reminder_minutes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      record.edge_id,
      record.gks_id,
      record.schema_version,
      record.type,
      record.capture_kind,
      record.title,
      record.content,
      record.created,
      record.author,
      record.classification,
      record.importance,
      JSON.stringify(record.tags),
      JSON.stringify(record.life_areas),
      record.place ? JSON.stringify(record.place) : null,
      JSON.stringify(record.about),
      JSON.stringify(record.relationships),
      record.captured_at,
      record.sync_status,
      record.content_sha256,
      record.native_calendar_event_id ?? null,
      record.has_calendar_entry ? 1 : 0,
      record.reminder_minutes ?? null
    );

    db.runSync(
      `INSERT INTO delta_log (
        edge_id, operation, record_type, capture_kind, timestamp,
        content_sha256, attachment_edge_ids, status
      ) VALUES (?, 'CREATE', ?, ?, ?, ?, '[]', 'PENDING')`,
      record.edge_id,
      record.type,
      record.capture_kind,
      new Date().toISOString(),
      record.content_sha256
    );
  });
}

export function updateRecord(
  edge_id: string,
  changes: Partial<EdgeRecord> & {
    content_sha256?: string;
    native_calendar_event_id?: string | null;
    has_calendar_entry?: boolean;
    reminder_minutes?: number | null;
  }
): void {
  db.withTransactionSync(() => {
    const existing = db.getFirstSync<RecordRow>(
      `SELECT * FROM records WHERE edge_id = ? AND is_deleted = 0`,
      edge_id
    );
    if (!existing) return;

    const now = new Date().toISOString();
    const merged = {
      gks_id: changes.gks_id ?? existing.gks_id,
      type: changes.type ?? existing.type,
      capture_kind: changes.capture_kind ?? existing.capture_kind,
      title: changes.title ?? existing.title,
      content: changes.content ?? existing.content,
      created: changes.created ?? existing.created,
      classification: changes.classification ?? existing.classification,
      importance: changes.importance ?? existing.importance,
      tags: changes.tags ? JSON.stringify(changes.tags) : existing.tags,
      life_areas: changes.life_areas ? JSON.stringify(changes.life_areas) : existing.life_areas,
      place: changes.place !== undefined
        ? (changes.place ? JSON.stringify(changes.place) : null)
        : existing.place,
      about: changes.about ? JSON.stringify(changes.about) : existing.about,
      relationships: changes.relationships
        ? JSON.stringify(changes.relationships)
        : existing.relationships,
      sync_status: changes.sync_status ?? existing.sync_status,
      content_sha256: changes.content_sha256 ?? existing.content_sha256,
    };

    db.runSync(
      `UPDATE records SET
        gks_id = ?, type = ?, capture_kind = ?, title = ?, content = ?,
        created = ?, classification = ?, importance = ?, tags = ?,
        life_areas = ?, place = ?, about = ?, relationships = ?,
        sync_status = ?, content_sha256 = ?, updated_at = ?
      WHERE edge_id = ? AND is_deleted = 0`,
      merged.gks_id,
      merged.type,
      merged.capture_kind,
      merged.title,
      merged.content,
      merged.created,
      merged.classification,
      merged.importance,
      merged.tags,
      merged.life_areas,
      merged.place,
      merged.about,
      merged.relationships,
      merged.sync_status,
      merged.content_sha256,
      now,
      edge_id
    );

    db.runSync(
      `INSERT INTO delta_log (
        edge_id, operation, record_type, capture_kind, timestamp,
        content_sha256, attachment_edge_ids, status
      ) VALUES (?, 'UPDATE', ?, ?, ?, ?, '[]', 'PENDING')`,
      edge_id,
      merged.type,
      merged.capture_kind,
      now,
      merged.content_sha256
    );
  });
}

export function softDeleteRecord(edge_id: string): void {
  db.withTransactionSync(() => {
    const existing = db.getFirstSync<RecordRow>(
      `SELECT type, capture_kind FROM records WHERE edge_id = ? AND is_deleted = 0`,
      edge_id
    );
    if (!existing) return;

    const now = new Date().toISOString();
    db.runSync(
      `UPDATE records SET is_deleted = 1, deleted_at = ?, sync_status = 'PENDING'
       WHERE edge_id = ?`,
      now,
      edge_id
    );

    db.runSync(
      `INSERT INTO delta_log (
        edge_id, operation, record_type, capture_kind, timestamp,
        attachment_edge_ids, status
      ) VALUES (?, 'DELETE', ?, ?, ?, '[]', 'PENDING')`,
      edge_id,
      existing.type,
      existing.capture_kind,
      now
    );
  });
}

export function getRecord(edge_id: string): EdgeRecord | null {
  const row = db.getFirstSync<RecordRow>(
    `SELECT * FROM records WHERE edge_id = ? AND is_deleted = 0`,
    edge_id
  );
  return row ? rowToRecord(row) : null;
}

export function listRecords(limit: number, offset: number): EdgeRecord[] {
  const rows = db.getAllSync<RecordRow>(
    `SELECT * FROM records WHERE is_deleted = 0 ORDER BY captured_at DESC LIMIT ? OFFSET ?`,
    limit,
    offset
  );
  return rows.map(rowToRecord);
}

export function getRecentRecords(n: number): EdgeRecord[] {
  const rows = db.getAllSync<RecordRow>(
    `SELECT * FROM records WHERE is_deleted = 0 ORDER BY captured_at DESC LIMIT ?`,
    n
  );
  return rows.map(rowToRecord);
}

export interface CalendarFields {
  native_calendar_event_id: string | null;
  has_calendar_entry: boolean;
  reminder_minutes: number | null;
}

export function getCalendarFields(edge_id: string): CalendarFields | null {
  const row = db.getFirstSync<Pick<RecordRow, 'native_calendar_event_id' | 'has_calendar_entry' | 'reminder_minutes'>>(
    `SELECT native_calendar_event_id, has_calendar_entry, reminder_minutes FROM records WHERE edge_id = ?`,
    edge_id
  );
  if (!row) return null;
  return {
    native_calendar_event_id: row.native_calendar_event_id,
    has_calendar_entry: row.has_calendar_entry === 1,
    reminder_minutes: row.reminder_minutes,
  };
}
