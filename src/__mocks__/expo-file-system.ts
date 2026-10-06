// Minimal in-memory file system mock for Jest.
// Tracks which paths "exist" so attachment store logic can be tested
// without touching the real filesystem.
export const documentDirectory = '/mock-docs/';

const _files = new Map<string, boolean>();

export function __setFileExists(path: string, exists: boolean) {
  if (exists) _files.set(path, true);
  else _files.delete(path);
}

type UploadHandler = (url: string, uri: string, opts: any) => Promise<{ status: number; body: string }>;
const _noUpload: UploadHandler = async () => { throw new Error('network'); };
let _upload: UploadHandler = _noUpload;

/** Tests set how uploadAsync answers; the default behaves like no network. */
export function __setUpload(fn: UploadHandler) {
  _upload = fn;
}

export function __reset() {
  _files.clear();
  _upload = _noUpload;
}

export async function uploadAsync(url: string, uri: string, opts: any) {
  return _upload(url, uri, opts);
}

export async function getInfoAsync(path: string): Promise<{ exists: boolean; size?: number }> {
  return { exists: _files.has(path), size: 0 };
}

export async function makeDirectoryAsync(_path: string, _opts?: unknown): Promise<void> {}

export async function copyAsync({ to }: { from: string; to: string }): Promise<void> {
  _files.set(to, true);
}

export async function moveAsync({ from, to }: { from: string; to: string }): Promise<void> {
  _files.delete(from);
  _files.set(to, true);
}

export async function deleteAsync(path: string, _opts?: unknown): Promise<void> {
  _files.delete(path);
}

export async function readDirectoryAsync(_path: string): Promise<string[]> {
  return [];
}

export const FileSystemUploadType = { MULTIPART: 'multipart' };
