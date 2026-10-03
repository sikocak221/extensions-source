// Rewrites the "## Extensions" table of README.md from the manifests:  node scripts/readme-table.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SITE_OVERRIDES = { mangadex: 'https://mangadex.org' };
const rows = [];
for (const lang of readdirSync('src')) {
  for (const id of readdirSync(path.join('src', lang))) {
    const dir = path.join('src', lang, id);
    const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const langs = [...new Set(manifest.sources.map((s) => s.lang.toUpperCase()))].join(', ');
    const file = ['src/index.ts', 'src/api.ts']
      .map((f) => path.join(dir, f))
      .find((f) => existsSync(f) && /https:\/\//.test(readFileSync(f, 'utf8')));
    const site =
      SITE_OVERRIDES[id] ?? (file ? readFileSync(file, 'utf8').match(/https:\/\/[a-z0-9.-]+/)?.[0] : '') ?? '';
    rows.push([manifest.name, langs, site, manifest.nsfw ? 'yes' : '']);
  }
}
rows.sort((a, b) => a[0].localeCompare(b[0]));
const table = [
  '| Extension | Languages | Site | NSFW |',
  '| --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.join(' | ')} |`),
].join('\n');
const readme = readFileSync('README.md', 'utf8');
const start = readme.indexOf('| Extension');
const end = readme.indexOf('\n\n', start);
writeFileSync('README.md', readme.slice(0, start) + table + readme.slice(end));
execFileSync('pnpm', ['exec', 'prettier', '--write', 'README.md', 'scripts/readme-table.mjs'], { stdio: 'ignore' });
