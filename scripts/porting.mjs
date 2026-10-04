// Updates PORTING.md rows:  node scripts/porting.mjs [<lang>/]<id|theme> <status> [note]
// `<lang>/<id>` only touches that language's section (ids repeat across languages).
// Prints the next `todo` rows with no arguments, or `node scripts/porting.mjs --todo <lang>` for one language.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [target, status, ...note] = process.argv.slice(2);
const lines = readFileSync('PORTING.md', 'utf8').split('\n');

/** The `## <heading>` each line belongs to. */
const sections = [];
let current = '';
for (const line of lines) {
  if (line.startsWith('## ')) current = line.slice(3).trim();
  sections.push(current);
}

if (!target || target === '--todo') {
  console.log(
    lines
      .filter((l, i) => /\|\s*todo\s*\|/.test(l) && (target !== '--todo' || sections[i] === status))
      .slice(0, target === '--todo' ? undefined : 15)
      .join('\n'),
  );
  process.exit(0);
}

const [lang, id] = target.includes('/') ? target.split('/') : [undefined, target];
let found = false;
const out = lines.map((line, i) => {
  const cells = line.split('|').map((c) => c.trim());
  if (cells[1] !== id || (lang && sections[i] !== lang)) return line;
  found = true;
  if (cells.length === 6)
    return `| ${cells[1]} | ${cells[2]} | ${status} | ${note.length ? note.join(' ') : cells[4]} |`; // extension row
  return `| ${cells[1]} | ${cells[2]} | ${status} |`; // theme row
});
if (!found) throw new Error(`${target} not in PORTING.md`);
writeFileSync('PORTING.md', out.join('\n'));
execFileSync('pnpm', ['exec', 'prettier', '--write', 'PORTING.md'], { stdio: 'ignore' });
