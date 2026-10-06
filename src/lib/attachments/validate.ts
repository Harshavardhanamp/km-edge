const ALLOWED_EXT = new Set([
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'md', 'csv', 'mp4', 'mov', 'mp3', 'm4a',
]);

const MAX_FILE_BYTES = 50 * 1024 * 1024;    // 50MB per file (matches record total cap)
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;   // 50MB per record total
const MAX_COUNT = 10;

/** Server limits from GKS capabilities.attachments (contract §2); the defaults apply when absent. */
export interface AttachmentLimits {
  allowed_extensions?: string[];
  max_file_bytes?: number;
  max_record_total_bytes?: number;
  max_files_per_record?: number;
}

// An empty list or a 0 limit means "not provided" — never "allow nothing".
const extensions = (l?: AttachmentLimits) => (l?.allowed_extensions?.length ? new Set(l.allowed_extensions.map((e) => e.toLowerCase())) : ALLOWED_EXT);
const limit = (value: number | undefined, fallback: number) => (value && value > 0 ? value : fallback);
const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

export function validateFile(file: {
  name: string;
  size: number;
}, limits?: AttachmentLimits): { ok: true } | { ok: false; reason: string } {
  const allowed = extensions(limits);
  const maxFile = limit(limits?.max_file_bytes, MAX_FILE_BYTES);
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!allowed.has(ext)) {
    return {
      ok: false,
      reason: `${file.name} isn't supported. Supported types: ${[...allowed].join(', ')}.`,
    };
  }
  if (file.size > maxFile) {
    return { ok: false, reason: `${file.name} exceeds the ${mb(maxFile)}MB per-file limit.` };
  }
  return { ok: true };
}

export function validateRecordLimits(
  existingCount: number,
  existingTotalBytes: number,
  newFileBytes: number,
  limits?: AttachmentLimits
): { ok: true } | { ok: false; reason: string } {
  const maxCount = limit(limits?.max_files_per_record, MAX_COUNT);
  const maxTotal = limit(limits?.max_record_total_bytes, MAX_TOTAL_BYTES);
  if (existingCount >= maxCount) {
    return { ok: false, reason: `Records can have up to ${maxCount} attachments.` };
  }
  const usedMB = (existingTotalBytes / 1024 / 1024).toFixed(1);
  if (existingTotalBytes + newFileBytes > maxTotal) {
    return {
      ok: false,
      reason: `Adding this file would exceed the ${mb(maxTotal)}MB limit (currently ${usedMB} MB used).`,
    };
  }
  return { ok: true };
}
