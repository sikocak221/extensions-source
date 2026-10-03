// Prints recorded fixture responses for debugging a port:
//   node scripts/fixture.mjs src/id/foo [url-regex] [body-regex]   (body-regex prints matches with context)
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const [dir, urlPattern = '', bodyPattern] = process.argv.slice(2);
const fixtures = path.join(dir, 'test/fixtures');
for (const file of readdirSync(fixtures)) {
  const { request, response } = JSON.parse(readFileSync(path.join(fixtures, file), 'utf8'));
  if (!new RegExp(urlPattern).test(request.url)) continue;
  const body = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
  console.log(`== ${request.method} ${request.url} → ${response.status} (${body.length} chars)`);
  if (!bodyPattern) continue;
  for (const match of body.matchAll(new RegExp(`[\\s\\S]{0,120}(?:${bodyPattern})[\\s\\S]{0,300}`, 'g'))) {
    console.log(match[0].replace(/\s+/g, ' '), '\n--');
  }
}
