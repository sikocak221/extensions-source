// Scaffolds Tachiyomi extensions from their build.gradle.kts (see PORTING.md).
//
//   node scripts/scaffold.mjs <lang> <id>... [--theme <theme>|common] [--force]
//
// The name, base URL, NSFW flag and theme come from
// ../clone-extension/extensions-source/src/<lang>/<id>/build.gradle.kts. Without --theme, an extension
// whose Tachiyomi theme is already in lib-multisrc/ gets that theme, one without a theme gets `common`,
// and one whose theme is not ported yet is skipped with a message. An id already used by another
// language gets the package/manifest id `<id>-<lang>` so the workspace stays unique.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const CLONE = '../clone-extension/extensions-source/src';
const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: { theme: { type: 'string' }, force: { type: 'boolean', default: false } },
});
const [lang, ...ids] = positionals;
if (!lang || ids.length === 0) throw new Error('usage: node scripts/scaffold.mjs <lang> <id>... [--theme <theme>]');

/** Every id used under src/ or pending/ by another language. */
const usedElsewhere = new Set(
  ['src', 'pending'].flatMap((root) =>
    existsSync(root)
      ? readdirSync(root)
          .filter((l) => l !== lang)
          .flatMap((l) => (existsSync(path.join(root, l)) ? readdirSync(path.join(root, l)) : []))
      : [],
  ),
);

for (const id of ids) {
  const source = path.join(CLONE, lang, id);
  const gradle = readFileSync(path.join(source, 'build.gradle.kts'), 'utf8');
  const field = (name) => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(gradle)?.[1];
  const name = field('name');
  // `baseUrl = "…"`, or a `baseUrl { custom("…") / mirrors("…", …) }` block (first url).
  const baseUrl = field('baseUrl') ?? /\bbaseUrl\s*\{[^}]*?"(https?:\/\/[^"]+)"/.exec(gradle)?.[1];
  if (!name || !baseUrl) {
    console.log(`skip ${id}: no name/baseUrl in build.gradle.kts (multi-source? scaffold it by hand)`);
    continue;
  }
  const nsfw = /ContentWarning\.NSFW/.test(gradle);
  const gradleTheme = field('theme');
  let theme = opts.theme;
  if (!theme) {
    if (!gradleTheme) theme = 'common';
    else if (existsSync(path.join('lib-multisrc', gradleTheme))) theme = gradleTheme;
    else {
      console.log(`skip ${id}: theme ${gradleTheme} is not in lib-multisrc/ yet`);
      continue;
    }
  }
  const args = ['scripts/new-extension.mjs', '--lang', lang, '--id', id, '--name', name, '--url', baseUrl];
  args.push('--theme', theme, '--icon', source);
  if (nsfw) args.push('--nsfw');
  if (opts.force) args.push('--force');
  execFileSync('node', args, { stdio: ['ignore', 'ignore', 'inherit'] });

  if (usedElsewhere.has(id)) {
    const unique = `${id}-${lang}`;
    for (const file of ['manifest.json', 'package.json']) {
      const filePath = path.join('src', lang, id, file);
      const json = JSON.parse(readFileSync(filePath, 'utf8'));
      if (file === 'manifest.json') json.id = unique;
      else json.name = unique;
      writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
    }
    console.log(`scaffolded ${lang}/${id} (${theme}, package ${unique})`);
  } else console.log(`scaffolded ${lang}/${id} (${theme})`);
}
