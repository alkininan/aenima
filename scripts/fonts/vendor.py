#!/usr/bin/env python3
"""Vendor DM Sans and JetBrains Mono from upstream, as design-spec §3 requires.

Google Fonts' builds of these two fall short of §3 — its DM Sans carries no `tnum`, so
law 6's typed-digits exception cannot render, and its JetBrains Mono lacks Ĳ ĳ and the
⌘ ⇧ the kbd hint draws. So both faces come from their own repositories, pinned to the
commits below, and are cut here into the two subsets §3 preloads: Latin, and Latin
Extended, which is where TR `ğĞşŞİı` and NL `ĳĲ` live.

**The ranges are not written here.** They are read out of `src/app/fonts.ts`, where each
`@font-face` declares the range it covers, so the file a browser is told to use for a
letter is the file that was cut to hold it. One range, in the place that has to state it.

Run from the repository root, with fontTools and brotli installed:

    pip3 install --user fonttools brotli
    python3 scripts/fonts/vendor.py

It writes `src/app/fonts/*.woff2` and each face's licence. It is not part of any build:
the woff2 files are committed, and this file is how they are reproduced or refreshed.
"""

import re
import subprocess
import sys
import urllib.request
from pathlib import Path

FACES = [
    {
        "slug": "dm-sans",
        "font": "https://raw.githubusercontent.com/googlefonts/dm-fonts/4412393b/Sans/fonts/variable/DMSans%5Bopsz,wght%5D.ttf",
        "licence": "https://raw.githubusercontent.com/googlefonts/dm-fonts/4412393b/Sans/OFL.txt",
    },
    {
        "slug": "jetbrains-mono",
        "font": "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/02bb50b0/fonts/variable/JetBrainsMono%5Bwght%5D.ttf",
        "licence": "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/02bb50b0/OFL.txt",
    },
]

FONTS_TS = Path("src/app/fonts.ts")
OUT = Path("src/app/fonts")
WORK = Path(".fonts-upstream")


def ranges() -> dict[str, str]:
    """Each subset file `fonts.ts` loads, with the `unicode-range` it declares for it."""
    source = FONTS_TS.read_text()
    found = {
        match.group(1): re.sub(r"\s", "", match.group(2))
        for match in re.finditer(
            r'src:\s*"\./fonts/([\w-]+)\.woff2"[\s\S]*?"(U\+[^"]+)"', source
        )
    }
    if not found:
        raise SystemExit(f"{FONTS_TS} declares no subsets to cut")
    return found


def fetch(url: str, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        with urllib.request.urlopen(url) as response, path.open("wb") as file:
            file.write(response.read())
    return path


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    declared = ranges()
    for face in FACES:
        source = fetch(face["font"], WORK / f"{face['slug']}.ttf")
        fetch(face["licence"], OUT / f"{face['slug']}-OFL.txt")
        subsets = {name: unicodes for name, unicodes in declared.items()
                   if name.startswith(f"{face['slug']}-")}
        if not subsets:
            raise SystemExit(f"{FONTS_TS} loads no subset of {face['slug']}")
        for name, unicodes in subsets.items():
            target = OUT / f"{name}.woff2"
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "fontTools.subset",
                    str(source),
                    f"--unicodes={unicodes}",
                    # Every OpenType feature the face ships, so `tnum` survives the cut.
                    "--layout-features=*",
                    "--name-IDs=*",
                    "--flavor=woff2",
                    f"--output-file={target}",
                ],
                check=True,
            )
            print(f"{target} {target.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
