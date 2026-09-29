import { db } from './db/index';
import * as Crypto from 'expo-crypto';

export type ActionEvent =
  | 'record_save'
  | 'record_delete'
  | 'record_type_change'
  | 'attachment_add'
  | 'attachment_remove'
  | 'search'
  | 'filter_apply'
  | 'calendar_sync'
  | 'logout'
  | 'server_rediscover'
  | 'offline_login_attempt'
  | 'attachment_cache_clear';

export interface ErrorEvent {
  error_code: string;
  message: string;
  screen?: string;
  is_crash?: boolean;
}

let sessionId = '';
let userId = '';
let tenantId = '';

export function init(uid: string, tid: string) {
  sessionId = Crypto.randomUUID();
  userId = uid;
  tenantId = tid;
}

function write(
  event_type: string,
  event_name: string,
  metadata: Record<string, unknown> = {}
) {
  if (!sessionId) return; // not initialised yet — drop silently
  try {
    db.runSync(
      `INSERT INTO telemetry_events
        (session_id, user_id, tenant_id, event_type, event_name, timestamp, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      sessionId,
      userId,
      tenantId,
      event_type,
      event_name,
      new Date().toISOString(),
      JSON.stringify(metadata)
    );
  } catch {
    // telemetry must never crash the app
  }
}

export const telemetry = {
  sessionStart: () => write('session_start', 'session_start'),
  sessionEnd: () => write('session_end', 'session_end'),
  screenEnter: (screen: string) => write('screen_enter', screen),
  screenExit: (screen: string) => write('screen_exit', screen),
  action: (action: ActionEvent, meta?: Record<string, unknown>) =>
    write('action', action, meta ?? {}),
  error: (event: ErrorEvent) =>
    write('error', event.error_code, {
      message: event.message,
      screen: event.screen,
      is_crash: event.is_crash ?? false,
    }),
};
