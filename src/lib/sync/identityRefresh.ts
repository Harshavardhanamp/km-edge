import { identities } from '../gksClient';
import { replaceIdentities, type CachedIdentity } from '../db/identityCache';

/**
 * KK-2.2 E3.2: refresh the identity-name cache by paging `GET /api/v1/edge/identities`
 * until `next` is null. The cache is replaced only when every page arrived, so a failed
 * refresh leaves the previous cache in place. Returns whether the cache was replaced.
 */
export async function refreshIdentityCache(baseUrl: string, pageSize = 1000): Promise<boolean> {
  const rows: CachedIdentity[] = [];
  let after: string | null = null;
  for (let page = 0; page < 1000; page += 1) {
    const result = await identities(baseUrl, after, pageSize);
    if (!result.ok || !Array.isArray(result.body?.items)) return false;
    rows.push(...result.body.items);
    after = result.body.next;
    if (!after) {
      replaceIdentities(rows);
      return true;
    }
  }
  return false; // ponytail: hard stop after 1000 pages (1M names); raise if a household ever gets there
}
