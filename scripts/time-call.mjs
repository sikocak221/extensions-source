// Times one source call against recorded fixtures (QuickJS stops code that runs > 2 s without yielding):
//   node scripts/time-call.mjs src/id/foo getChapters '{"url":"/manga/x/","title":""}'
import path from 'node:path';
import { createRequire } from 'node:module';

const [dir, method, ...args] = process.argv.slice(2);
const require = createRequire(path.resolve(dir, 'package.json'));
const { buildExtension, createFixtureHost } = await import(require.resolve('@matane/extension-cli'));
const { ExtensionRuntime } = await import(require.resolve('@matane/extension-runtime'));
const { code, manifest } = await buildExtension(path.resolve(dir), { write: false });
const host = createFixtureHost({ dir: path.resolve(dir, 'test/fixtures'), record: false });
const runtime = await ExtensionRuntime.create({
  code,
  manifest,
  host,
  hostInfo: { appName: 'Matane', appVersion: '0.0.0-test', apiVersion: 1 },
});
const started = performance.now();
const result = await runtime.call(
  manifest.sources[0].key,
  method,
  args.map((a) => JSON.parse(a)),
  { prefs: {} },
);
console.log(
  `${method}: ${(performance.now() - started).toFixed(0)} ms`,
  Array.isArray(result) ? `${result.length} items` : '',
);
if (process.env.SHOW) console.log(JSON.stringify(result, null, 1).slice(0, Number(process.env.SHOW)));
runtime.dispose();
