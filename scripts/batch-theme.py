#!/usr/bin/env python3
"""Scaffolds themed extensions in bulk from Tachiyomi metadata, applying the simple overrides.

    python3 scripts/batch-theme.py <meta.jsonl> <tachiyomi src dir> <lang> id1 id2 ...

For each id: scripts/new-extension.mjs with the theme and icon, the subclass switched to the Kotlin base
class (e.g. MadaraNoAjax), and the members from scripts/kotlin-overrides.py inserted. Prints the Kotlin
lines that still need a hand port, per extension.
"""
import json
import subprocess
import sys
from pathlib import Path

meta_file, tachiyomi, lang, *ids = sys.argv[1:]
ids = " ".join(ids).split()
meta = {m["id"]: m for m in map(json.loads, Path(meta_file).read_text().splitlines())}

for ext_id in ids:
    m = meta[ext_id]
    src = Path(tachiyomi) / lang / m["dir"]
    args = [
        "node", "scripts/new-extension.mjs", "--lang", lang, "--id", ext_id, "--name", m["name"],
        "--url", m["baseUrl"], "--theme", m["theme"], "--icon", str(src),
    ]
    if m["nsfw"]:
        args.append("--nsfw")
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)
    conv = json.loads(subprocess.check_output(["python3", "scripts/kotlin-overrides.py", str(src)]))
    index = Path("src") / lang / ext_id / "src" / "index.ts"
    text = index.read_text()
    theme_dir = Path("src") / lang / ext_id / "src" / m["theme"]
    base = conv["base"]
    if base and (theme_dir / f"{base}.ts").exists():
        import re
        current = re.search(r"import \{ (\w+) \} from '\./" + m["theme"] + r"/(\w+)';", text)
        if current and current.group(1) != base:
            text = text.replace(current.group(0), f"import {{ {base} }} from './{m['theme']}/{base}';")
            text = text.replace(f"extends {current.group(1)} {{", f"extends {base} {{")
    if conv["members"]:
        marker = "  readonly baseUrl = "
        start = text.index(marker)
        end = text.index("\n", start) + 1
        text = text[:end] + "\n" + "\n".join(conv["members"]) + "\n" + text[end:]
    index.write_text(text)
    if conv["manual"]:
        print(f"== {ext_id} (manual):")
        for line in conv["manual"]:
            print(f"   {line}")
