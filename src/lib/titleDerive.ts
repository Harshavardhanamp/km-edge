const MD_STRIP = /[*_#`~\[\]>|]+/g;

export function deriveTitle(content: string): string {
  const first = content.trim().split(/[.!?\n]/)[0] ?? '';
  const clean = first.replace(MD_STRIP, '').trim();
  if (!clean) return 'Untitled';
  return clean.length <= 100 ? clean : clean.slice(0, 97) + '…';
}
