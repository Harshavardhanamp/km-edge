import { db } from './index';

// KK-2.2 E-D1: one local draft of the capture in progress (text and review-card choices).
// Reopened the next time Capture opens; Discard, Confirm and sign-out remove it.
export function saveCaptureDraft<T>(payload: T): void {
  db.runSync(
    `INSERT INTO capture_draft (id, payload, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    JSON.stringify(payload), new Date().toISOString()
  );
}

export function loadCaptureDraft<T>(): T | null {
  const row = db.getFirstSync<{ payload: string }>(`SELECT payload FROM capture_draft WHERE id = 1`);
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export function clearCaptureDraft(): void {
  db.runSync(`DELETE FROM capture_draft`);
}
