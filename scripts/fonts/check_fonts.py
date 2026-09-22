#!/usr/bin/env python3
"""design-spec §17 C-39's font clause, over the fonts a build actually serves.

Reads a manifest — `{"<family>": ["<woff2 path>", …]}` — on argv, and answers what §3
requires of each face:

  * ğ Ğ ş Ş İ ı ĳ Ĳ are covered. Per *face*, not per file: §3 splits every face into a
    Latin and a Latin Extended subset, and those letters are all in the second one, so a
    file-by-file reading would fail the Latin file of a face that is entirely correct.
  * JetBrains Mono covers ⌘ and ⇧, which §8.15's kbd hint draws.
  * DM Sans and Space Grotesk carry `tnum`, which is what law 6's typed-digits exception
    and every tabular readout in §3 render with.

Prints one line per family and exits non-zero on the first thing that is not true, with
the face and the letters named. Needs fontTools with brotli, which is what reads woff2:

    pip3 install --user fonttools brotli
"""

import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

TURKISH_DUTCH = "ğĞşŞİıĳĲ"
KBD = "⌘⇧"
TABULAR = ("DM Sans", "Space Grotesk")


def coverage(paths: list[str]) -> tuple[set[int], set[str]]:
    """Every code point and every OpenType feature a face's files carry, together."""
    points: set[int] = set()
    features: set[str] = set()
    for path in paths:
        font = TTFont(path)
        points.update(font.getBestCmap().keys())
        if "GSUB" in font:
            for record in font["GSUB"].table.FeatureList.FeatureRecord:
                features.add(record.FeatureTag)
    return points, features


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: check_fonts.py <manifest.json>", file=sys.stderr)
        return 2
    manifest: dict[str, list[str]] = json.loads(Path(sys.argv[1]).read_text())
    if not manifest:
        print("no fonts to check: the build served none", file=sys.stderr)
        return 1

    failures: list[str] = []
    for family, paths in sorted(manifest.items()):
        points, features = coverage(paths)
        missing = [letter for letter in TURKISH_DUTCH if ord(letter) not in points]
        if missing:
            failures.append(f"{family} covers none of {''.join(missing)}")
        if family == "JetBrains Mono":
            absent = [glyph for glyph in KBD if ord(glyph) not in points]
            if absent:
                failures.append(f"{family} is missing {''.join(absent)}")
        if family in TABULAR and "tnum" not in features:
            failures.append(f"{family} carries no tnum")
        print(f"{family}: {len(paths)} file(s), {len(points)} code points, tnum={'tnum' in features}")

    for failure in failures:
        print(failure, file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
