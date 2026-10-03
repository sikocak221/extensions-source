// Checks whether sites answer, for planning a port. Reads JSON lines with "id" and "baseUrl" on stdin
// (e.g. from tachiyomi-meta.mjs) and prints one JSON line each with the outcome:
//   node --import ./scripts/public-dns.mjs scripts/probe-sites.mjs < en.jsonl > probe.jsonl
// outcome: ok | cloudflare | moved:<host> | http:<status> | dead:<error>
import { createInterface } from 'node:readline';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
const CONCURRENCY = 16;

async function probe(site) {
  if (!site.baseUrl) return { ...site, outcome: 'dead:no-baseUrl' };
  try {
    const response = await fetch(`${site.baseUrl}/`, {
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.text();
    const title = /<title[^>]*>([^<]*)/i.exec(body)?.[1]?.trim().slice(0, 80) ?? '';
    const finalHost = new URL(response.url).host;
    let outcome = 'ok';
    if (
      response.headers.get('cf-mitigated') === 'challenge' ||
      /Just a moment|Verifying your connection/i.test(title)
    ) {
      outcome = 'cloudflare';
    } else if (!response.ok) outcome = `http:${response.status}`;
    else if (finalHost !== new URL(site.baseUrl).host) outcome = `moved:${finalHost}`;
    return { id: site.id, baseUrl: site.baseUrl, outcome, title };
  } catch (error) {
    return { id: site.id, baseUrl: site.baseUrl, outcome: `dead:${error.cause?.code ?? error.name}` };
  }
}

const sites = [];
for await (const line of createInterface({ input: process.stdin })) if (line.trim()) sites.push(JSON.parse(line));
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < sites.length) {
      const site = sites[next++];
      console.log(JSON.stringify(await probe(site)));
    }
  }),
);
