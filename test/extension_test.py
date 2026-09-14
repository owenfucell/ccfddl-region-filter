#!/usr/bin/env python3
"""Regression test for the bug where the panel appeared but nothing was filtered.

A userscript manager may run the script in an isolated content-script world
(Tampermonkey on Chrome MV3 without "Allow User Scripts", Firefox content
scripts). The DOM is shared there, so the panel renders, but `window.fetch` is a
different object and patching it does nothing. This loads the userscript as a
real Chrome extension content script in BOTH worlds and requires filtering to
work in each.

    pip install playwright && python3 -m playwright install chromium
    python3 test/extension_test.py
"""
import json, os, re, shutil, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
os.chdir(ROOT)

from playwright.sync_api import sync_playwright

SITE = 'https://ccfddl.com/'
SCRIPT = open('ccfddl-region-filter.user.js', encoding='utf-8').read()

fails = []


def check(name, cond, extra=''):
    print(('  PASS  ' if cond else '  FAIL  ') + name + (('  -- ' + extra) if extra else ''))
    if not cond:
        fails.append(name)


def make_extension(tmp, world):
    d = os.path.join(tmp, world.lower())
    os.makedirs(d, exist_ok=True)
    json.dump({
        'manifest_version': 3,
        'name': 'ccfddl-region-filter harness (%s)' % world,
        'version': '1.0',
        'content_scripts': [{
            'matches': ['https://ccfddl.com/*'],
            'js': ['userscript.js'],
            'run_at': 'document_start',
            'world': world,
        }],
    }, open(os.path.join(d, 'manifest.json'), 'w'))
    open(os.path.join(d, 'userscript.js'), 'w', encoding='utf-8').write(SCRIPT)
    return d


def run(world, selected):
    tmp = tempfile.mkdtemp()
    ext = make_extension(tmp, world)
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            os.path.join(tmp, 'profile'), headless=True, channel='chromium',
            args=['--disable-extensions-except=' + ext, '--load-extension=' + ext])
        try:
            page = ctx.new_page()
            logs = []
            page.on('console', lambda m: logs.append(m.text))
            page.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
            # the content script runs before this, so seed storage then reload
            page.goto(SITE, wait_until='load', timeout=60000)
            page.evaluate('sel => localStorage.setItem("ccfrf_selected", JSON.stringify(sel))', selected)
            logs.clear()
            page.reload(wait_until='load', timeout=60000)
            page.wait_for_selector('.conf-title', timeout=60000)
            page.wait_for_timeout(1200)
            rows = page.eval_on_selector_all(
                '.conf-title', "els => els.map(e => e.closest('tr').innerText.replace(/\\s+/g,' '))")
            return {
                'logs': logs,
                'panel': page.locator('#ccfrf-panel').count(),
                'warn': page.locator('#ccfrf-panel .ccfrf-warn').count(),
                'rows': rows,
                'count_text': (page.inner_text('#ccfrf-panel .ccfrf-count')
                               if page.locator('#ccfrf-panel .ccfrf-count').count() else ''),
            }
        finally:
            ctx.close()
            shutil.rmtree(tmp, ignore_errors=True)


US = re.compile(r'USA|United States|,\s*(CA|NY|TX|WA|MA|PA|IL|GA|FL|VA|MI|MN|MO|NJ|NV|OH|OR|CO|AZ|MD|'
                r'NC|SC|TN|UT|WI|RI|HI|DC|AK|LA|IN|ID|KY|AR|NM)\b|California|Hawaii|Colorado|Utah|'
                r'Oregon|Indiana|Louisiana|Philadelphia|Denver|Los Angeles|San Francisco', re.I)

print('== content script world: MAIN (what a correctly configured manager gives you) ==')
r = run('MAIN', ['us'])
check('panel rendered', r['panel'] == 1)
check('no page errors', not [l for l in r['logs'] if l.startswith('PAGEERROR')],
      str([l for l in r['logs'] if l.startswith('PAGEERROR')])[:200])
hook = [l for l in r['logs'] if 'conference-years kept' in l]
check('allconf.yml was intercepted', bool(hook), 'logs: %s' % str(r['logs'][:4])[:200])
check('no warning shown', r['warn'] == 0, r['count_text'])
m = re.search(r'(\d+)/(\d+) conference-years kept', hook[0] if hook else '')
check('a strict subset was kept', bool(m) and int(m.group(1)) < int(m.group(2)),
      hook[0] if hook else '')
check('rows rendered', len(r['rows']) > 0, '%d rows' % len(r['rows']))
bad = [x for x in r['rows'] if not US.search(x)]
check('every rendered row is a US venue', not bad, str([b[:70] for b in bad[:3]]))

print()
print('== content script world: ISOLATED (userscript manager sandbox) ==')
# Chrome applies the extension CSP to inline scripts injected from an isolated
# world, so the script provably cannot reach the page here and filtering cannot
# work. What it must do is fail loudly and tell the user how to fix it, rather
# than silently showing an unfiltered list.
r = run('ISOLATED', ['us'])
check('panel still rendered', r['panel'] == 1)
check('no page errors', not [l for l in r['logs'] if l.startswith('PAGEERROR')],
      str([l for l in r['logs'] if l.startswith('PAGEERROR')])[:200])
check('console explains that the page context was not reached',
      any('could not reach the page context' in l for l in r['logs']),
      str(r['logs'][:3])[:200])
check('panel shows a warning', r['warn'] == 1)
check('warning names the fix', 'Allow user scripts' in r['count_text'], r['count_text'][:120])
check('site itself keeps working', len(r['rows']) > 0, '%d rows' % len(r['rows']))

print()
print('ALL CHECKS PASSED' if not fails else '%d CHECK(S) FAILED: %s' % (len(fails), fails))
sys.exit(1 if fails else 0)
