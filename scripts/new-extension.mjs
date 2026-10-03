// Scaffolds an extension ported from Tachiyomi (see PORTING.md).
//
//   node scripts/new-extension.mjs --lang id --id kanzenin --name Kanzenin --url https://kanzenin.info \
//     [--theme mangathemesia|common] [--nsfw] [--icon <tachiyomi extension dir>]
//
// With --theme, the theme template from lib-multisrc/<theme>/src is copied into src/<theme>/ and
// src/index.ts subclasses it; with --theme common (standalone extensions) only the shared helpers are
// copied (src/common/utils.ts) and src/index.ts is a stub to fill in.
import { copyFile, cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: opts } = parseArgs({
  options: {
    lang: { type: 'string' },
    id: { type: 'string' },
    name: { type: 'string' },
    url: { type: 'string' },
    theme: { type: 'string' },
    nsfw: { type: 'boolean', default: false },
    icon: { type: 'string' },
    force: { type: 'boolean', default: false },
  },
});
for (const key of ['lang', 'id', 'name', 'url']) {
  if (!opts[key]) throw new Error(`--${key} is required`);
}

const id = opts.id.toLowerCase();
const dir = path.join('src', opts.lang, id);
if (existsSync(dir) && !opts.force) throw new Error(`${dir} exists (use --force to overwrite)`);
const baseUrl = opts.url.replace(/\/+$/, '');
let className = opts.name.replace(/[^A-Za-z0-9]/g, '').replace(/^(\d)/, '_$1');

await mkdir(path.join(dir, 'src'), { recursive: true });
await mkdir(path.join(dir, 'test'), { recursive: true });

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
await writeFile(
  path.join(dir, 'manifest.json'),
  json({
    id,
    name: opts.name,
    version: '1.0.0',
    apiVersion: 1,
    nsfw: opts.nsfw,
    rateLimit: { requests: 5, perMs: 1000 },
    sources: [{ key: opts.lang, lang: opts.lang, name: opts.name }],
  }),
);
await writeFile(
  path.join(dir, 'package.json'),
  json({
    name: id,
    version: '1.0.0',
    private: true,
    license: 'MIT',
    type: 'module',
    scripts: {
      build: 'mr-ext build --minify',
      'mr-ext': 'mr-ext',
      smoke: 'mr-ext test',
      test: 'vitest run',
      typecheck: 'tsc -p tsconfig.json && tsc -p tsconfig.test.json',
    },
    devDependencies: {
      '@matane/extension-cli': 'catalog:',
      '@matane/extension-runtime': 'catalog:',
      '@matane/extension-sdk': 'catalog:',
      '@types/node': 'catalog:',
    },
  }),
);
await writeFile(
  path.join(dir, 'tsconfig.json'),
  json({ extends: '../../../tsconfig.base.json', compilerOptions: { lib: ['ES2022'], types: [] }, include: ['src'] }),
);
await writeFile(
  path.join(dir, 'tsconfig.test.json'),
  json({ extends: '../../../tsconfig.base.json', compilerOptions: { types: ['node'] }, include: ['test'] }),
);
await writeFile(
  path.join(dir, 'src/env.d.ts'),
  "// Sandbox globals (http, html, storage, prefs, …) injected by the host.\nimport '@matane/extension-sdk/globals';\n",
);

let index;
if (opts.theme === 'common') {
  await cp(path.join('lib-multisrc', 'common', 'src'), path.join(dir, 'src', 'common'), { recursive: true });
  index = `import { defineExtension } from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = ${JSON.stringify(baseUrl)};

// TODO: port from Tachiyomi
export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
  }),
});
`;
} else if (opts.theme) {
  const themeDir = path.join('lib-multisrc', opts.theme, 'src');
  await cp(themeDir, path.join(dir, 'src', opts.theme), { recursive: true });
  const [file] = (await readdir(themeDir)).filter((f) => f.endsWith('.ts'));
  const base = path.basename(file, '.ts');
  // A site named like its theme (e.g. Guya) would shadow the base class.
  if (className === base) className = `${className}Source`;
  index = `import { defineExtension } from '@matane/extension-sdk';
import { ${base} } from './${opts.theme}/${base}';

class ${className} extends ${base} {
  readonly name = ${JSON.stringify(opts.name)};
  readonly baseUrl = ${JSON.stringify(baseUrl)};
}

export default defineExtension({
  createSource: () => new ${className}().toSource(),
});
`;
} else {
  index = `import { defineExtension } from '@matane/extension-sdk';

const BASE_URL = ${JSON.stringify(baseUrl)};

// TODO: port from Tachiyomi
export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
  }),
});
`;
}
await writeFile(path.join(dir, 'src/index.ts'), index);

const test = await readFile('scripts/templates/extension.test.ts', 'utf8');
await writeFile(path.join(dir, 'test', `${id}.test.ts`), test.replace("'__NAME__'", JSON.stringify(opts.name)));

if (opts.icon) {
  for (const density of ['xxxhdpi', 'xxhdpi', 'xhdpi']) {
    const icon = path.join(opts.icon, 'res', `mipmap-${density}`, 'ic_launcher.png');
    if (existsSync(icon)) {
      await copyFile(icon, path.join(dir, 'icon.png'));
      break;
    }
  }
}
console.log(`Created ${dir}`);
