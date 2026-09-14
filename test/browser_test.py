#!/usr/bin/env python3
"""Optional end-to-end check against the live site (needs network + playwright).

    pip install playwright && python3 -m playwright install chromium
    python3 test/browser_test.py [--shot out.png]

Injects the userscript exactly the way Tampermonkey does (page context, before
any page script runs) and verifies the WASM app really renders the filtered set.
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
os.chdir(ROOT)

from playwright.sync_api import sync_playwright

SITE = 'https://ccfddl.com/'
SCRIPT = open('ccfddl-region-filter.user.js', encoding='utf-8').read()

shot = None
if '--shot' in sys.argv:
    shot = sys.argv[sys.argv.index('--shot') + 1]

fails = []


def check(name, cond, extra=''):
    print(('  PASS  ' if cond else '  FAIL  ') + name + (('  -- ' + extra) if extra else ''))
    if not cond:
        fails.append(name)


def rows(page):
    """(title-year, whole-row text) for every conference row currently rendered."""
    return page.eval_on_selector_all(
        '.conf-title',
        '''els => els.map(e => [
             e.textContent.trim().replace(/\\s+/g, ' '),
             e.closest('tr').innerText.replace(/\\s+/g, ' ')
           ])''')


with sync_playwright() as pw:
    browser = pw.chromium.launch()

    def open_site(selected, collapsed=False):
        ctx = browser.new_context(viewport={'width': 1280, 'height': 1400})
        ctx.add_init_script(
            'try{localStorage.setItem("ccfrf_selected",%r);'
            'localStorage.setItem("ccfrf_collapsed","%s");}catch(e){}'
            % (__import__('json').dumps(selected), '1' if collapsed else '0'))
        ctx.add_init_script(SCRIPT)
        page = ctx.new_page()
        logs = []
        page.on('console', lambda m: logs.append(m.text))
        page.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
        page.goto(SITE, wait_until='load', timeout=60000)
        page.wait_for_selector('.conf-title', timeout=60000)
        page.wait_for_timeout(800)
        return ctx, page, logs

    print('== live site, no filter ==')
    ctx, page, logs = open_site([])
    check('page renders conferences', len(rows(page)) > 0, '%d rows' % len(rows(page)))
    check('region panel injected', page.locator('#ccfrf-panel').count() == 1)
    check('no page errors', not [l for l in logs if l.startswith('PAGEERROR')],
          str([l for l in logs if l.startswith('PAGEERROR')])[:200])
    hook = [l for l in logs if 'ccf-region-filter' in l]
    check('userscript intercepted allconf.yml', bool(hook), str(logs[-3:])[:200])
    m = re.search(r'(\d+)/(\d+) conference-years kept', hook[0] if hook else '')
    total = int(m.group(2)) if m else 0
    check('all entries kept when nothing is selected', bool(m) and m.group(1) == m.group(2),
          hook[0] if hook else '')
    no_filter_pages = page.eval_on_selector_all(
        '.footer-pagination button, .footer-pagination li, .footer-pagination *',
        'els => els.map(e => e.textContent.trim()).filter(t => /^\\d+$/.test(t))')
    check('no warning banner shown',
          page.locator('#ccfrf-panel .ccfrf-warn').count() == 0)
    ctx.close()

    print('\n== live site, US only ==')
    ctx, page, logs = open_site(['us'])
    hook = [l for l in logs if 'conference-years kept' in l]
    m = re.search(r'(\d+)/(\d+) conference-years kept', hook[0] if hook else '')
    kept = int(m.group(1)) if m else -1
    check('fewer entries kept than the full set', 0 < kept < total, '%d of %d' % (kept, total))
    r = rows(page)
    check('rows still render after filtering', len(r) > 0, '%d rows' % len(r))
    bad = [x for x in r if not re.search(
        r'USA|United States|,\s*(CA|NY|TX|WA|MA|PA|IL|GA|FL|VA|MI|MN|MO|NJ|NV|OH|OR|CO|AZ|MD|NC|SC|TN|UT|WI|RI|HI|DC|AK|LA|IN|ID|KY|AR|NM)\b'
        r'|California|Hawaii|Colorado|Utah|Oregon|Indiana|Louisiana|Philadelphia|Denver|Los Angeles|San Francisco',
        x[1], re.I)]
    check('every visible row is a US venue', not bad, str(bad[:4]))
    check('panel reports the active filter',
          'US' in page.inner_text('#ccfrf-panel .ccfrf-sum') or
          '美国' in page.inner_text('#ccfrf-panel .ccfrf-sum'),
          page.inner_text('#ccfrf-panel .ccfrf-sum'))
    count_txt = page.inner_text('#ccfrf-panel .ccfrf-count')
    check('panel shows the match count', str(kept) in count_txt, count_txt)
    if shot:
        page.locator('#ccfrf-panel').scroll_into_view_if_needed()
        page.screenshot(path=shot, full_page=False)
        print('  screenshot -> %s' % shot)
    ctx.close()

    print('\n== a small bucket renders exactly its own entries ==')
    ctx, page, logs = open_site(['ssa'])
    hook = [l for l in logs if 'conference-years kept' in l]
    m = re.search(r'(\d+)/(\d+) conference-years kept', hook[0] if hook else '')
    kept_ssa = int(m.group(1)) if m else -1
    r = rows(page)
    check('sub-Saharan bucket is small and fully rendered on one page (%d)' % kept_ssa,
          0 < kept_ssa <= 10 and len(r) == kept_ssa, '%d kept, %d rendered' % (kept_ssa, len(r)))
    check('those rows are African venues',
          all(re.search(r'South Africa|Rwanda|Kenya|Nigeria|Ghana|Cape Town|Kigali|Stellenbosch',
                        x[1], re.I) for x in r), str([x[1][:60] for x in r]))
    ctx.close()

    print('\n== live site, Greater China + Southeast Asia ==')
    ctx, page, logs = open_site(['gc', 'sea'])
    r = rows(page)
    bad = [x for x in r if not re.search(
        r'China|Hong Kong|Macau|Macao|Taiwan|Taipei|Singapore|Malaysia|Indonesia|Thailand|'
        r'Vietnam|Philippines|Cambodia|Kuala Lumpur|Bangkok|Hanoi|Bali|Jakarta', x[1], re.I)]
    check('every visible row is Greater China or SE Asia', not bad, str(bad[:4]))
    check('rows render', len(r) > 0, '%d rows' % len(r))
    ctx.close()

    browser.close()

print('\n' + ('ALL CHECKS PASSED' if not fails else '%d CHECK(S) FAILED: %s' % (len(fails), fails)))
sys.exit(1 if fails else 0)
