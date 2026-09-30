import { capabilities } from './gksClient';
import type { Capabilities } from './contract';

/** Normalise a user-typed address to a full https/http URL. */
export function normaliseUrl(raw: string): string {
  const s = raw.trim();
  if (/^https?:\/\//i.test(s)) return s.replace(/\/+$/, '');
  // Tailscale MagicDNS name e.g. gks.tail1234.ts.net → https://…
  return `https://${s.replace(/\/+$/, '')}`;
}

/** Parse a `kmedge://connect?url=…&name=…` or plain URL from a QR scan. */
export function parseConnectQr(data: string): { url: string; name: string | null } | null {
  try {
    if (data.startsWith('kmedge://connect')) {
      const u = new URL(data);
      const url = u.searchParams.get('url');
      if (!url) return null;
      return { url: normaliseUrl(url), name: u.searchParams.get('name') };
    }
    // Plain URL fallback — only accept if the raw data already looks like a URL
    if (!/^https?:\/\//i.test(data) && !data.includes('.')) return null;
    const url = normaliseUrl(data);
    new URL(url); // validate
    return { url, name: null };
  } catch {
    return null;
  }
}

export interface DiscoveredServer {
  url: string;
  displayName: string;
  caps: Capabilities;
}

/** Probe a URL for capabilities; returns the server info or null on failure. */
export async function probeServer(rawUrl: string): Promise<DiscoveredServer | null> {
  const url = normaliseUrl(rawUrl);
  try { new URL(url); } catch { return null; }
  const result = await capabilities(url);
  if (!result.ok) return null;
  return {
    url,
    displayName: result.body.server.display_name,
    caps: result.body,
  };
}
