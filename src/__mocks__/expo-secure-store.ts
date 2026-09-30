const _store = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return _store.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  _store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  _store.delete(key);
}

export function __reset() {
  _store.clear();
}
