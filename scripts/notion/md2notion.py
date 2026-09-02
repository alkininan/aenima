import re, sys, json, os

ESC = set('<>{}|^$~[]')

WIDE = ESC | set('`*\\')

def code_span(width, body):
    # Notion's inline code is single-backtick only: there is no `` form, and a
    # backslash inside a code span is literal (CommonMark), so a span holding a
    # backtick has no code representation at all. Emitting `` `x` `` verbatim
    # makes Notion drop the outer pair and the backticks with it; emitting
    # `\`x\`` makes it mis-pair the delimiters and corrupt the rest of the
    # paragraph — both observed on the schema mirror. So a wide span keeps every
    # character as escaped rich text and gives up the monospace styling, which is
    # the half of the trade that is presentation rather than content.
    if width == 1:
        return '`' + body + '`'
    if len(body) > 1 and body[0] == ' ' and body[-1] == ' ' and body.strip():
        body = body[1:-1]
    return ''.join('\\' + c if c in WIDE else c for c in body)

def esc_plain(s):
    # protect links [text](url), escape the rest
    out = []
    for sg in re.split(r'(\[[^\]]*\]\([^)]*\))', s):
        if re.fullmatch(r'\[[^\]]*\]\([^)]*\)', sg or ''):
            out.append(sg); continue
        out.append(''.join('\\' + c if c in ESC else c for c in sg))
    return ''.join(out)

def esc_prose(s):
    # protect inline code spans and links, escape the rest. A code span opens on a
    # run of N backticks and closes on a run of exactly N — pairing a run of 2 with
    # a run of 1 is what split the `` `x` `` spans apart.
    out, buf, i, n = [], [], 0, len(s)
    while i < n:
        if s[i] != '`':
            buf.append(s[i]); i += 1; continue
        run = len(s[i:]) - len(s[i:].lstrip('`'))
        j, close = i + run, -1
        while j < n:
            if s[j] == '`':
                r = len(s[j:]) - len(s[j:].lstrip('`'))
                if r == run and j > i + run:
                    close = j; break
                j += r
            else:
                j += 1
        if close < 0:                      # no closing run: literal backticks
            buf.append(s[i:i + run]); i += run; continue
        out.append(esc_plain(''.join(buf))); buf = []
        out.append(code_span(run, s[i + run:close]))
        i = close + run
    out.append(esc_plain(''.join(buf)))
    return ''.join(out)

def split_cells(line):
    line = line.strip()
    if line.startswith('|'): line = line[1:]
    if line.endswith('|'): line = line[:-1]
    line = line.replace('\\|', '\x00')
    cells = [c.replace('\x00', '\\|').strip() for c in line.split('|')]
    return cells

def is_sep(cells):
    return all(re.fullmatch(r':?-{2,}:?', c) or c == '' for c in cells) and any(c for c in cells)

def convert(text):
    lines = text.split('\n')
    blocks = []  # top-level block strings
    i = 0
    n = len(lines)
    para = []
    def flush_para():
        nonlocal para
        if para:
            blocks.append(esc_prose(' '.join(x.strip() for x in para)))
            para = []
    while i < n:
        ln = lines[i]
        s = ln.strip()
        # html comment block -> text code block
        if s.startswith('<!--'):
            flush_para()
            buf = []
            while i < n:
                t = lines[i]
                buf.append(t.replace('<!--', '').replace('-->', '').strip())
                if '-->' in t: break
                i += 1
            i += 1
            buf = [b for b in buf if b]
            blocks.append('```text\n' + '\n'.join(buf) + '\n```')
            continue
        # fenced code
        if s.startswith('```'):
            flush_para()
            # an undeclared language lets Notion guess one, and it guesses wrong —
            # CLAUDE.md's command list came back tagged javascript. Say text.
            info = s[3:].strip()
            buf = ['```' + (info or 'text')]
            i += 1
            while i < n and not lines[i].strip().startswith('```'):
                buf.append(lines[i]); i += 1
            buf.append('```')
            i += 1
            blocks.append('\n'.join(buf))
            continue
        # table
        if s.startswith('|'):
            flush_para()
            rows = []
            while i < n and lines[i].strip().startswith('|'):
                rows.append(split_cells(lines[i])); i += 1
            header = False
            if len(rows) >= 2 and is_sep(rows[1]):
                header = True
                rows = [rows[0]] + rows[2:]
            width = max(len(r) for r in rows)
            xml = ['<table header-row="%s">' % ('true' if header else 'false')]
            for r in rows:
                r = r + [''] * (width - len(r))
                xml.append('\t<tr>')
                for c in r:
                    xml.append('\t\t<td>%s</td>' % esc_prose(c))
                xml.append('\t</tr>')
            xml.append('</table>')
            blocks.append('\n'.join(xml))
            continue
        # blank
        if s == '':
            flush_para(); i += 1; continue
        # hr
        if re.fullmatch(r'-{3,}|\*{3,}', s):
            flush_para(); blocks.append('---'); i += 1; continue
        # heading
        m = re.match(r'^(#{1,6})\s+(.*)$', s)
        if m:
            flush_para()
            level = min(len(m.group(1)), 4)
            blocks.append('#' * level + ' ' + esc_prose(m.group(2)))
            i += 1; continue
        # quote
        if s.startswith('>'):
            flush_para()
            q = []
            while i < n and lines[i].strip().startswith('>'):
                q.append(lines[i].strip()[1:].strip()); i += 1
            blocks.append('> ' + esc_prose('<br>'.join(q)).replace('\\<br\\>', '<br>'))
            continue
        # list item (bulleted or numbered), with continuation and nesting
        m = re.match(r'^(\s*)([-*+]|\d+[.)])\s+(.*)$', ln)
        if m:
            flush_para()
            item_lines = []
            base_indent = len(m.group(1).replace('\t', '  '))
            # collect this list until blank line or non-list, non-continuation
            while i < n:
                t = lines[i]
                if t.strip() == '':
                    break
                mm = re.match(r'^(\s*)([-*+]|\d+[.)])\s+(.*)$', t)
                if mm:
                    ind = len(mm.group(1).replace('\t', '  '))
                    depth = max(0, (ind - base_indent + 1) // 2)
                    marker = '- ' if not mm.group(2)[0].isdigit() else '1. '
                    if marker == '- ' and mm.group(2) == '- [ ]': marker = '- [ ] '
                    txt = mm.group(3)
                    if txt.startswith('[ ] '): marker, txt = '- [ ] ', txt[4:]
                    elif txt.startswith('[x] '): marker, txt = '- [x] ', txt[4:]
                    item_lines.append([depth, marker, txt])
                    i += 1
                else:
                    ind = len(re.match(r'^(\s*)', t).group(1).replace('\t', '  '))
                    if ind > base_indent or (ind >= base_indent and item_lines):
                        # continuation of previous item
                        if item_lines:
                            item_lines[-1][2] += ' ' + t.strip()
                            i += 1
                            continue
                    break
            out = []
            for depth, marker, txt in item_lines:
                out.append('\t' * depth + marker + esc_prose(txt))
            blocks.append('\n'.join(out))
            continue
        # plain paragraph line
        para.append(ln)
        i += 1
    flush_para()
    return blocks

def chunk(blocks, limit):
    chunks, cur, size = [], [], 0
    for b in blocks:
        if cur and size + len(b) + 1 > limit:
            chunks.append('\n'.join(cur)); cur, size = [], 0
        cur.append(b); size += len(b) + 1
    if cur: chunks.append('\n'.join(cur))
    return chunks

if __name__ == '__main__':
    src, name, header, limit, outdir = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
    text = open(src, encoding='utf-8').read()
    blocks = convert(text)
    blocks.insert(0, header)
    os.makedirs(outdir, exist_ok=True)
    cs = chunk(blocks, limit)
    for k, c in enumerate(cs):
        open(os.path.join(outdir, f'{name}.{k}.md'), 'w', encoding='utf-8').write(c)
    print(name, 'blocks', len(blocks), 'chunks', len(cs), [len(c) for c in cs])
