import { validateFile, validateRecordLimits } from '../lib/attachments/validate';

const MB = 1024 * 1024;

describe('validateFile — extension', () => {
  test('accepts every allowed extension', () => {
    const allowed = [
      'photo.jpg', 'photo.jpeg', 'image.png', 'image.webp', 'anim.gif',
      'raw.heic', 'doc.pdf', 'doc.txt', 'note.md', 'data.csv',
      'word.doc', 'word.docx', 'sheet.xls', 'sheet.xlsx',
      'deck.ppt', 'deck.pptx', 'video.mp4', 'video.mov',
      'audio.mp3', 'audio.m4a',
    ];
    for (const name of allowed) {
      expect(validateFile({ name, size: 1 })).toEqual({ ok: true });
    }
  });

  test('rejects rtf (removed from allowed list)', () => {
    const result = validateFile({ name: 'doc.rtf', size: 1 });
    expect(result.ok).toBe(false);
    expect((result as any).reason).toContain('doc.rtf');
  });

  test('rejects json (removed from allowed list)', () => {
    expect(validateFile({ name: 'data.json', size: 1 }).ok).toBe(false);
  });

  test('rejects svg (removed from allowed list)', () => {
    expect(validateFile({ name: 'image.svg', size: 1 }).ok).toBe(false);
  });

  test('rejects zip archive', () => {
    expect(validateFile({ name: 'archive.zip', size: 1 }).ok).toBe(false);
  });

  test('rejects exe executable', () => {
    expect(validateFile({ name: 'setup.exe', size: 1 }).ok).toBe(false);
  });

  test('rejects file with no extension', () => {
    expect(validateFile({ name: 'noextension', size: 1 }).ok).toBe(false);
  });

  test('extension check is case-insensitive', () => {
    expect(validateFile({ name: 'Photo.JPG', size: 1 })).toEqual({ ok: true });
    expect(validateFile({ name: 'doc.PDF', size: 1 })).toEqual({ ok: true });
  });
});

describe('validateFile — size', () => {
  test('accepts file exactly at 50MB limit', () => {
    expect(validateFile({ name: 'big.pdf', size: 50 * MB })).toEqual({ ok: true });
  });

  test('rejects file one byte over 50MB', () => {
    const result = validateFile({ name: 'toobig.pdf', size: 50 * MB + 1 });
    expect(result.ok).toBe(false);
    expect((result as any).reason).toContain('50MB');
  });
});

describe('validateRecordLimits', () => {
  test('accepts adding first attachment', () => {
    expect(validateRecordLimits(0, 0, 1 * MB)).toEqual({ ok: true });
  });

  test('accepts adding 10th attachment', () => {
    expect(validateRecordLimits(9, 0, 1 * MB)).toEqual({ ok: true });
  });

  test('rejects adding when already at 10 attachments', () => {
    const result = validateRecordLimits(10, 0, 1 * MB);
    expect(result.ok).toBe(false);
    expect((result as any).reason).toContain('10');
  });

  test('accepts total exactly at 50MB', () => {
    expect(validateRecordLimits(1, 40 * MB, 10 * MB)).toEqual({ ok: true });
  });

  test('rejects total exceeding 50MB by one byte', () => {
    const result = validateRecordLimits(1, 50 * MB, 1);
    expect(result.ok).toBe(false);
    expect((result as any).reason).toContain('50MB');
  });

  test('reason includes currently used MB', () => {
    const result = validateRecordLimits(1, 30 * MB, 25 * MB);
    expect(result.ok).toBe(false);
    expect((result as any).reason).toContain('30.0 MB');
  });
});
