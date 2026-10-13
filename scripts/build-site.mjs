// Builds the documentation site (VitePress, docs/) from the repository that `mr-ext repo build` just wrote into
// public/, and copies it into public/ so that one Pages deploy serves the site, index.json and the archives together.
//
//   pnpm repo:build && node scripts/build-site.mjs
//
// docs/repository.md, docs/extensions.md and docs/.vitepress/data/ are written here (git-ignored): the key and the
// list come from the built index and its signature, never from a copy that could go stale.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');
const DOCS = join(ROOT, 'docs');
const URL_ = process.env['MR_REPO_BASE_URL'] ?? 'https://sikocak221.github.io/extensions-source/';

if (!existsSync(join(PUBLIC, 'index.json')))
  throw new Error('public/index.json is missing: run `pnpm repo:build` first.');
const index = JSON.parse(readFileSync(join(PUBLIC, 'index.json'), 'utf8'));
// The key is announced in the signed index itself; a signature file only exists for a signed build.
const signed = existsSync(join(PUBLIC, 'index.json.sig'));
const key = signed && typeof index.publicKey === 'string' ? index.publicKey : null;
const fingerprint = key ? `${key.slice(0, 12)}…${key.slice(-4)}` : null;

writeFileSync(
  join(DOCS, 'repository.md'),
  `# Add the repository

In your app, open **Extensions → Repositories → Add repository** and paste:

\`\`\`
${URL_}
\`\`\`

${
  key
    ? `Compare the key the app shows with this one, then choose **Trust this key**:

\`\`\`
Signing key:  ${key}
Fingerprint:  ${fingerprint}
\`\`\``
    : '::: warning Unsigned build\nThis build of the site was made without a signing key and is not published.\n:::'
}

${index.extensions.length} extensions.

If the fingerprint is different, do not trust it: the address may not be this repository.
`,
);

mkdirSync(join(DOCS, '.vitepress', 'data'), { recursive: true });
const entries = index.extensions
  .map((e) => ({
    id: e.id,
    name: e.name,
    version: e.version,
    langs: e.langs,
    nsfw: Boolean(e.nsfw),
    icon: e.icon ?? null,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(DOCS, '.vitepress', 'data', 'extensions.json'), `${JSON.stringify(entries)}\n`);
writeFileSync(
  join(DOCS, 'extensions.md'),
  `# Extensions

${entries.length} extensions in this repository. They contain source code only. An extension may stop working for a while when what it reads changes: see the [FAQ](/faq).

<ExtensionList />
`,
);

const built = spawnSync('pnpm', ['exec', 'vitepress', 'build', 'docs'], { cwd: ROOT, stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 1);
// index.json, its signature, the archives and the icons are already in public/; the site adds its own files.
cpSync(join(DOCS, '.vitepress', 'dist'), PUBLIC, { recursive: true });
console.log(`✓ site and repository in ${PUBLIC}`);
