"""Regression cases for md2notion.py, run as `python3 scripts/notion/test_md2notion.py`.

Each fixture in fixtures/ has a .expected.md beside it holding the exact blocks the
converter must produce. Regenerate an expectation deliberately with --write, never to
make a red run go green: the two cases here are the two defects the Documents mirror
run found, and both were invisible in the converter's own output.
"""
import os, sys, difflib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from md2notion import convert

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')
CASES = ['fences', 'code-span']


def render(name):
    src = open(os.path.join(FIXTURES, name + '.md'), encoding='utf-8').read()
    return '\n'.join(convert(src)) + '\n'


def main():
    write = '--write' in sys.argv
    failed = 0
    for name in CASES:
        got = render(name)
        path = os.path.join(FIXTURES, name + '.expected.md')
        if write:
            open(path, 'w', encoding='utf-8').write(got)
            print('wrote', path)
            continue
        want = open(path, encoding='utf-8').read()
        if got == want:
            print('ok    ', name)
            continue
        failed += 1
        print('FAIL  ', name)
        sys.stdout.writelines(difflib.unified_diff(
            want.splitlines(True), got.splitlines(True),
            fromfile=name + '.expected.md', tofile='converted'))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
