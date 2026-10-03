# Inserts class members into a themed extension's src/index.ts (after `readonly baseUrl`):
#   python3 scripts/set-overrides.py src/id/foo "  override mangaUrlDirectory = '/komik';" [import-line]
import re, sys
path = f"{sys.argv[1]}/src/index.ts"
body, imports = sys.argv[2], sys.argv[3:] if len(sys.argv) > 3 else []
s = open(path).read()
s = re.sub(r"(  readonly baseUrl = [^\n]*\n)(?:.*\n)*?(}\n\nexport default)", lambda m: m.group(1) + ("\n" + body.rstrip() + "\n" if body.strip() else "") + m.group(2), s, count=1)
for line in imports:
    if line not in s:
        s = line + "\n" + s
open(path, "w").write(s)
