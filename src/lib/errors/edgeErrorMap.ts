export type ErrorAction =
  | 'login'
  | 'update_app'
  | 'none'
  | 'edit'
  | 'remove'
  | 'revert_type'
  | 'dismiss'
  | 'retry';

export interface ErrorEntry {
  sentence: string;
  action: ErrorAction;
  retryable: boolean;
}

// Every code that appears in contract §8 and in the pinned fixtures.
export const edgeErrorMap: Record<string, ErrorEntry> = {
  EDGE_CONTRACT_UNSUPPORTED: {
    sentence: 'Update KM-Edge to keep syncing.',
    action: 'update_app',
    retryable: false,
  },
  EDGE_SESSION_EXPIRED: {
    sentence: 'Please log in again.',
    action: 'login',
    retryable: false,
  },
  EDGE_SESSION_REVOKED: {
    sentence: 'This phone was signed out by your administrator.',
    action: 'login',
    retryable: false,
  },
  EDGE_PASSWORD_CHANGE_REQUIRED: {
    sentence: 'Change your password in Kashyap’s Knowledge, then log in again.',
    action: 'none',
    retryable: false,
  },
  EDGE_VALIDATION: {
    sentence: 'This record couldn’t be sent. Contact your administrator.',
    action: 'none',
    retryable: false,
  },
  EDGE_CONTENT_TOO_LONG: {
    sentence: 'This record is too long to sync (limit 100,000 characters).',
    action: 'edit',
    retryable: false,
  },
  EDGE_TYPE_INVALID: {
    sentence: 'This record couldn’t be sent. Contact your administrator.',
    action: 'none',
    retryable: false,
  },
  EDGE_TYPE_LOCKED: {
    sentence: 'Type can only be changed on desktop.',
    action: 'revert_type',
    retryable: false,
  },
  EDGE_CHECKSUM_MISMATCH: {
    sentence: 'This record couldn’t be verified. Contact your administrator.',
    action: 'retry',
    retryable: true,
  },
  EDGE_RECORD_DELETED: {
    sentence: 'This record was removed in Kashyap’s Knowledge.',
    action: 'dismiss',
    retryable: false,
  },
  EDGE_NOT_FOUND: {
    sentence: 'This record couldn’t be sent. Contact your administrator.',
    action: 'none',
    retryable: false,
  },
  EDGE_FILE_TYPE_NOT_SUPPORTED: {
    sentence: 'Kashyap’s Knowledge doesn’t accept this file type. Remove it from the record.',
    action: 'remove',
    retryable: false,
  },
  EDGE_FILE_TOO_LARGE: {
    sentence: 'This file is too large to sync.',
    action: 'remove',
    retryable: false,
  },
  EDGE_RECORD_ATTACHMENT_LIMIT: {
    sentence: 'This record has too many attachments.',
    action: 'remove',
    retryable: false,
  },
  EDGE_TEST_MODE_ACTIVE: {
    sentence: '',
    action: 'none',
    retryable: true,
  },
  EDGE_SERVER_ERROR: {
    sentence: '',
    action: 'none',
    retryable: true,
  },
  INVALID_LOGIN: {
    sentence: 'Incorrect username or password.',
    action: 'none',
    retryable: false,
  },
  RATE_LIMITED: {
    sentence: 'Too many login attempts. Please wait and try again.',
    action: 'none',
    retryable: true,
  },
};

export function mapError(code: string): ErrorEntry {
  return (
    edgeErrorMap[code] ?? {
      sentence: 'This record couldn’t be sent. Contact your administrator.', // REQ-0013 C6.1
      action: 'none',
      retryable: false,
    }
  );
}
