const ALLOWED_EXT = new Set([
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'md', 'csv', 'mp4', 'mov', 'mp3', 'm4a',
]);

const MAX_FILE_BYTES = 50 * 1024 * 1024;    // 50MB per file (matches record total cap)
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;   // 50MB per record total
const MAX_COUNT = 10;

export function validateFile(file: {
  name: string;
  size: number;
}): { ok: true } | { ok: false; reason: string } {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXT.has(ext)) {
    return {
      ok: false,
      reason: `${file.name} isn't supported. Supported types: ${[...ALLOWED_EXT].join(', ')}.`,
    };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, reason: `${file.name} exceeds the 50MB per-file limit.` };
  }
  return { ok: true };
}

export function validateRecordLimits(
  existingCount: number,
  existingTotalBytes: number,
  newFileBytes: number
): { ok: true } | { ok: false; reason: string } {
  if (existingCount >= MAX_COUNT) {
    return { ok: false, reason: 'Records can have up to 10 attachments.' };
  }
  const usedMB = (existingTotalBytes / 1024 / 1024).toFixed(1);
  if (existingTotalBytes + newFileBytes > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      reason: `Adding this file would exceed the 50MB limit (currently ${usedMB} MB used).`,
    };
  }
  return { ok: true };
}
