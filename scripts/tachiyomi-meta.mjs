// Lists the Tachiyomi extensions of a language as JSON lines, for planning a port:
//   node scripts/tachiyomi-meta.mjs <tachiyomi src dir> <lang>
//   → {"id","dir","name","baseUrl","nsfw","theme","lines"} per extension (lines = Kotlin source lines)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const [root, lang] = process.argv.slice(2);
if (!root || !lang) throw new Error('usage: tachiyomi-meta.mjs <src dir> <lang>');

function ktLines(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.kt')) {
      total += readFileSync(path.join(entry.parentPath, entry.name), 'utf8').split('\n').length;
    }
  }
  return total;
}

for (const dir of readdirSync(path.join(root, lang)).sort()) {
  const full = path.join(root, lang, dir);
  if (!statSync(full).isDirectory()) continue;
  let gradle = '';
  try {
    gradle = readFileSync(path.join(full, 'build.gradle.kts'), 'utf8');
  } catch {
    continue;
  }
  let baseUrl = /baseUrl\s*=\s*"([^"]+)"/.exec(gradle)?.[1] ?? /custom\("([^"]+)"\)/.exec(gradle)?.[1];
  if (!baseUrl) {
    // Some extensions set baseUrl in Kotlin.
    const sources = readdirSync(full, { recursive: true })
      .filter((f) => String(f).endsWith('.kt'))
      .map((f) => readFileSync(path.join(full, String(f)), 'utf8'))
      .join('\n');
    baseUrl = /override val baseUrl\s*=\s*"([^"]+)"/.exec(sources)?.[1];
  }
  const sourceCount = (gradle.match(/source\s*\{/g) ?? []).length;
  console.log(
    JSON.stringify({
      id: dir.toLowerCase(),
      dir,
      name: /name\s*=\s*"([^"]+)"/.exec(gradle)?.[1] ?? dir,
      baseUrl: baseUrl?.replace(/\/+$/, '') ?? '',
      nsfw: /ContentWarning\.NSFW/.test(gradle),
      theme: /theme\s*=\s*"([^"]+)"/.exec(gradle)?.[1] ?? 'standalone',
      sources: sourceCount,
      lines: ktLines(full),
    }),
  );
}
