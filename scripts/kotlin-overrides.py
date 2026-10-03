#!/usr/bin/env python3
"""Converts the simple overrides of a themed Tachiyomi extension to TypeScript class members.

    python3 scripts/kotlin-overrides.py <tachiyomi extension dir>
    → JSON: {"base": "Madara|MadaraNoAjax|...", "members": [ts lines], "manual": [kotlin lines left over]}

Handled: `override val x = "..."`/number/boolean, `ChapterMode.X`, DateTimeFormatter.ofPattern(...) date
formats (→ chapterDatePattern / datePattern), and `override fun f() = "..."` selector functions.
Anything else (and every non-trivial line) is reported in "manual" for a human port.
"""
import json
import re
import sys
from pathlib import Path

IGNORED = re.compile(
    r"^\s*($|import |package |@Source|}\s*$|\)\s*$|//|override fun OkHttpClient\.Builder\.configureClient|"
    r"\.rateLimit|rateLimit\(|readTimeout|connectTimeout)"
)
# Kotlin name → TS member name, per theme (where they differ).
RENAMES = {
    "chapterDateFormat": "chapterDatePattern",
    "dateFormat": "datePattern",
}
DROPPED = {"supportsPostId", "sendViewCount", "useLoadMoreRequest", "versionId"}

def ts_string(value):
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"

def main():
    root = Path(sys.argv[1])
    text = "\n".join(p.read_text() for p in sorted(root.rglob("*.kt")))
    base = None
    m = re.search(r"class \w+\s*(?:\([^)]*\))?\s*:\s*(\w+)\(", text)
    if m:
        base = m.group(1)
    members, manual = [], []
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        i += 1
        if IGNORED.match(line) or re.match(r"^(abstract )?(open )?class ", stripped):
            continue
        # DateTimeFormatter.ofPattern("...")
        m = re.match(r'override val (\w+)(?:\s*:\s*\w+)?\s*=\s*(?:DateTimeFormatter\.ofPattern|SimpleDateFormat)\("([^"]+)"', stripped)
        if m:
            name = RENAMES.get(m.group(1), m.group(1))
            members.append(f"  override {name} = {ts_string(m.group(2).replace('uuuu', 'yyyy').replace('yyy,', 'yyyy,'))};")
            continue
        m = re.match(r"override val chapterMode\s*=\s*ChapterMode\.(\w+)$", stripped)
        if m:
            members.append(f"  override chapterMode = '{m.group(1)}' as const;")
            continue
        m = re.match(r'override val (\w+)(?:\s*:\s*[\w?]+)?\s*=\s*"((?:[^"\\]|\\.)*)"$', stripped)
        if m:
            name = RENAMES.get(m.group(1), m.group(1))
            if name in DROPPED:
                continue
            value = m.group(2).replace('\\"', '"').replace("\\$", "$")
            value = value.replace(":containsOwn(", ":contains(")
            # CSS needs ":" escaped in attribute names (Livewire "wire:key").
            value = re.sub(r"\[(\w+):(\w)", lambda mm: "[" + mm.group(1) + "\\:" + mm.group(2), value)
            if "${" in value:
                manual.append(stripped)
                continue
            members.append(f"  override {name} = {ts_string(value)};")
            continue
        m = re.match(r"override val (\w+)(?:\s*:\s*\w+)?\s*=\s*(true|false|-?\d+)$", stripped)
        if m:
            if m.group(1) in DROPPED:
                continue
            members.append(f"  override {RENAMES.get(m.group(1), m.group(1))} = {m.group(2)};")
            continue
        m = re.match(r'override fun (\w+)\(\)(?:\s*:\s*String)?\s*=\s*"((?:[^"\\]|\\.)*)"$', stripped)
        if m:
            value = m.group(2).replace('\\"', '"').replace(":containsOwn(", ":contains(")
            value = re.sub(r"\[(\w+):(\w)", lambda mm: "[" + mm.group(1) + "\\:" + mm.group(2), value)
            members.append(f"  override {m.group(1)}(): string {{\n    return {ts_string(value)};\n  }}")
            continue
        manual.append(stripped)
    print(json.dumps({"base": base, "members": members, "manual": manual}))

main()
