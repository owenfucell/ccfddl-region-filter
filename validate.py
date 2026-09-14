#!/usr/bin/env python3
"""Offline check for the region table used by ccfddl-region-filter.user.js.

Mirrors the classification and YAML-filtering logic of the userscript (same
regexes, same order of fallbacks) and runs it over the real allconf.yml so the
shipped alias tables can be verified without a browser.

Usage: python3 validate.py [path/to/allconf.yml]

With no argument it uses ./allconf.yml when present (grab the live copy with
`curl -O https://ccfddl.com/conference/allconf.yml`), otherwise the trimmed
fixture in test/fixture.yml.
"""
import json, os, re, sys, unicodedata
from collections import Counter, OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(HERE, 'regions.data.json')), object_pairs_hook=OrderedDict)


def default_data_path():
    full = os.path.join(HERE, 'allconf.yml')
    return full if os.path.exists(full) else os.path.join(HERE, 'test', 'fixture.yml')

LEAVES = []
for g in DATA['tree']:
    if g.get('children'):
        LEAVES.extend(c['key'] for c in g['children'])
    else:
        LEAVES.append(g['key'])

CHAR_FIXES = {'ø': 'o', 'ł': 'l', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss',
              'đ': 'd', 'ð': 'd', 'þ': 'th', 'ı': 'i'}


def normalize(raw):
    s = ('' if raw is None else str(raw)).lower()
    s = ''.join(CHAR_FIXES.get(c, c) for c in s)
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[，、；;]', ',', s)
    s = s.replace('.', '')
    s = re.sub(r'[^a-z0-9,]+', ' ', s)
    s = re.sub(r'\s*,\s*', ',', s)
    s = re.sub(r',+', ',', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip(' ,')


def classify(place):
    norm = normalize(place)
    segs = [x for x in norm.split(',') if x] if norm else []
    hay = ' ' + ' '.join(segs) + ' '
    found = set()
    for alias, key in DATA['countries'].items():
        if ' ' + alias + ' ' in hay:
            found.add(key)
    if not found:
        for seg in segs:
            if seg in DATA['segments']:
                found.add(DATA['segments'][seg])
    if not found:
        for alias, key in DATA['places'].items():
            if ' ' + alias + ' ' in hay:
                found.add(key)
    for kw in DATA['virtual']:
        if ' ' + kw + ' ' in hay:
            found.add('other')
            break
    if not found:
        found.add('other')
    return found


def is_virtualish(place):
    hay = ' ' + normalize(place).replace(',', ' ') + ' '
    return any(' ' + kw + ' ' in hay for kw in DATA['virtual'])


def unquote(v):
    s = str(v).strip()
    if len(s) >= 2 and ((s[0] == "'" and s[-1] == "'") or (s[0] == '"' and s[-1] == '"')):
        return s[1:-1]
    return s


def filter_yaml(text, selected):
    """Port of filterYaml() from the userscript."""
    lines = text.split('\n')
    while lines and lines[-1] == '':
        lines.pop()

    pre, confs = [], []
    cur_conf = cur_year = None
    in_confs = False

    def push_year():
        nonlocal cur_year
        if cur_conf is not None and cur_year is not None:
            cur_conf['years'].append(cur_year)
        cur_year = None

    def push_conf():
        nonlocal cur_conf, in_confs
        push_year()
        if cur_conf is not None:
            confs.append(cur_conf)
        cur_conf = None
        in_confs = False

    for line in lines:
        if re.match(r'^- ', line):
            push_conf()
            cur_conf = {'head': [line], 'tail': [], 'years': []}
            continue
        if cur_conf is None:
            pre.append(line)
            continue
        if not in_confs:
            cur_conf['head'].append(line)
            if re.match(r'^ {2}confs:\s*$', line):
                in_confs = True
            continue
        if re.match(r'^ {2}- ', line):
            push_year()
            cur_year = {'lines': [line], 'place': ''}
            continue
        if re.match(r'^ {2}[^\s-]', line):
            push_year()
            cur_conf['tail'].append(line)
            continue
        if cur_year is not None:
            cur_year['lines'].append(line)
            m = re.match(r'^ {4}place:\s*(.*)$', line)
            if m:
                cur_year['place'] = unquote(m.group(1))
            continue
        cur_conf['head'].append(line)
    push_conf()

    filtering = bool(selected)
    out = list(pre)
    total = kept = 0
    item_regions, unknown = [], []
    leaf_counts = {k: 0 for k in LEAVES}

    for conf in confs:
        keep_years = []
        for y in conf['years']:
            regions = classify(y['place'])
            total += 1
            item_regions.append(regions)
            for r in regions:
                if r in leaf_counts:
                    leaf_counts[r] += 1
            if regions == {'other'} and normalize(y['place']) and not is_virtualish(y['place']):
                unknown.append(y['place'])
            if (not filtering) or (regions & selected):
                keep_years.append(y)
                kept += 1
        if keep_years:
            out.extend(conf['head'])
            for y in keep_years:
                out.extend(y['lines'])
            out.extend(conf['tail'])

    text_out = ('\n'.join(out) + '\n') if out else '[]\n'
    return dict(text=text_out, total=total, kept=kept, unknown=unknown,
                leaf_counts=leaf_counts, item_regions=item_regions, confs=confs)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else default_data_path()
    print('data: %s' % os.path.relpath(path, HERE))
    raw = open(path, encoding='utf-8').read()

    import yaml
    original = yaml.safe_load(raw)
    orig_years = sum(len(c['confs']) for c in original)

    res = filter_yaml(raw, set())
    print('conferences: %d   conference-years: %d (parser saw %d)'
          % (len(original), orig_years, res['total']))
    assert res['total'] == orig_years, 'line parser missed year entries'
    assert res['text'] == raw if raw.endswith('\n') else True

    print('\n-- distribution (a place may count in more than one bucket) --')
    for g in DATA['tree']:
        kids = g.get('children') or [g]
        tot = sum(res['leaf_counts'][c['key']] for c in kids)
        print('  %-28s %4d   %s' % (g['zh'] + '/' + g['en'], tot,
              '  '.join('%s=%d' % (c['zh'], res['leaf_counts'][c['key']]) for c in kids)
              if g.get('children') else ''))

    unk = Counter(res['unknown'])
    print('\n-- unclassified places: %d occurrences, %d distinct --' % (sum(unk.values()), len(unk)))
    for p, n in unk.most_common():
        print('   %3d  %r' % (n, p))

    # every year entry must land in at least one bucket
    assert all(r for r in res['item_regions']), 'empty region set produced'

    # round-trip: filtered output must stay valid YAML and only contain matches
    failures = 0
    for sel in [{'us'}, {'gc'}, {'sea', 'sas'}, {'mena'}, {'other'}, set(LEAVES), {'oce', 'ssa'}]:
        out = filter_yaml(raw, set(sel))
        parsed = yaml.safe_load(out['text'])
        if parsed is None:
            parsed = []
        n_years = sum(len(c['confs']) for c in parsed)
        bad = [y['place'] for c in parsed for y in c['confs']
               if not (classify(y['place']) & set(sel))]
        empty = [c['title'] for c in parsed if not c['confs']]
        ok = (n_years == out['kept']) and not bad and not empty
        if not ok:
            failures += 1
        print('  %-22s -> %4d/%d years, %3d confs, valid-yaml=%s, mismatches=%d, empty-confs=%d  %s'
              % ('+'.join(sorted(sel))[:22], n_years, out['total'], len(parsed),
                 parsed is not None, len(bad), len(empty), 'OK' if ok else 'FAIL'))

    # filtering everything out must still produce parseable YAML
    none_out = filter_yaml(raw, {'__nothing__'})
    assert yaml.safe_load(none_out['text']) == [], 'empty result is not valid YAML'
    print('  %-22s -> [] (valid empty document)' % 'no-match selection')

    print('\n%s' % ('ALL CHECKS PASSED' if failures == 0 else '%d CHECK(S) FAILED' % failures))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
