import type { Page } from '@matane/extension-sdk';
import { fetchPages } from './speedbinb';

const queryParam = (url: string, name: string): string | undefined => {
  const match = new RegExp(`[?&]${name}=([^&#]*)`).exec(url);
  return match ? decodeURIComponent(match[1]!) : undefined;
};

/**
 * Pages of a SpeedBinb reader page (Kotlin: `OkHttpClient.fetchPages(document)`). Readers that serve
 * `data-ptimg` json files (no content-info API) are not supported.
 */
export async function readerPages(readerUrl: string, headers: Record<string, string>): Promise<Page[]> {
  const response = await http.get(readerUrl, { headers });
  const doc = html.load(response.body, { baseUrl: response.url });
  const content = doc.selectFirst('#content');
  if (!content) throw new Error('Reader not found');
  const info = content.absUrl('data-ptbinb');
  if (!info) throw new Error('This reader (ptimg) is not supported');
  const cid = content.attr('data-ptbinb-cid') || queryParam(response.url, 'cid');
  if (!cid) throw new Error('Could not find chapter ID');
  let url = info;
  for (let i = 0; i < 10; i++) {
    const value = queryParam(response.url, `u${i}`);
    if (value !== undefined && queryParam(url, `u${i}`) === undefined)
      url += `${url.includes('?') ? '&' : '?'}u${i}=${encodeURIComponent(value)}`;
  }
  return fetchPages(url, cid, headers);
}
