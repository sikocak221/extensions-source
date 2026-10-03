// Updates PORTING.md rows:  node scripts/porting.mjs <id|theme> <status> [note]
// Prints the next `todo` rows with no arguments.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [id, status, ...note] = process.argv.slice(2);
const lines = readFileSync('PORTING.md', 'utf8').split('\n');
if (!id) {
  console.log(
    lines
      .filter((l) => /\|\s*todo\s*\|/.test(l))
      .slice(0, 15)
      .join('\n'),
  );
  process.exit(0);
}
let found = false;
const out = lines.map((line) => {
  const cells = line.split('|').map((c) => c.trim());
  if (cells[1] !== id) return line;
  found = true;
  if (cells.length === 6)
    return `| ${cells[1]} | ${cells[2]} | ${status} | ${note.length ? note.join(' ') : cells[4]} |`; // extension row
  return `| ${cells[1]} | ${cells[2]} | ${status} |`; // theme row
});
if (!found) throw new Error(`${id} not in PORTING.md`);
writeFileSync('PORTING.md', out.join('\n'));
execFileSync('pnpm', ['exec', 'prettier', '--write', 'PORTING.md'], { stdio: 'ignore' });
