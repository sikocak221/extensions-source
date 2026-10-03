// Copies each theme template (lib-multisrc/<theme>/src) into the extensions that use it
// (src/<lang>/<id>/src/<theme>/). With --check, only reports copies that differ (for CI).
//
//   node scripts/sync-multisrc.mjs [--check]
//
// Themes that contain src/utils.ts get it from lib-multisrc/common/src/utils.ts first.
import { cp, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const check = process.argv.includes('--check');
const stale = [];

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name)));
}

// lib-multisrc/common/src/utils.ts is the single source of every theme's src/utils.ts (standalone
// extensions get lib-multisrc/common/src/ itself, as src/common/).
const commonFile = path.join('lib-multisrc', 'common', 'src', 'utils.ts');
const common = await readFile(commonFile, 'utf8');
for (const theme of await readdir('lib-multisrc')) {
  const utils = path.join('lib-multisrc', theme, 'src', 'utils.ts');
  if (theme !== 'common' && existsSync(utils) && (await readFile(utils, 'utf8')) !== common) {
    if (check) stale.push(utils);
    else await cp(commonFile, utils);
  }
}

for (const theme of await readdir('lib-multisrc')) {
  const template = path.join('lib-multisrc', theme, 'src');
  if (!existsSync(template)) continue;
  for (const lang of await readdir('src')) {
    for (const id of await readdir(path.join('src', lang))) {
      const copy = path.join('src', lang, id, 'src', theme);
      if (!existsSync(copy)) continue;
      for (const file of await files(template)) {
        const target = path.join(copy, file);
        const same =
          existsSync(target) &&
          (await readFile(path.join(template, file), 'utf8')) === (await readFile(target, 'utf8'));
        if (same) continue;
        if (check) stale.push(target);
        else await cp(path.join(template, file), target);
      }
    }
  }
}

if (check && stale.length > 0) {
  console.error(`Theme copies differ from lib-multisrc (run node scripts/sync-multisrc.mjs):\n  ${stale.join('\n  ')}`);
  process.exit(1);
}
