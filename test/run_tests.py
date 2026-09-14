#!/usr/bin/env python3
"""Execute the real userscript under QuickJS with a small DOM shim.

Checks that the script parses, patches fetch, filters allconf.yml exactly as the
reference implementation in validate.py does, and builds a working panel.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
os.chdir(ROOT)

import quickjs
import validate as V

DATA_PATH = sys.argv[1] if len(sys.argv) > 1 else V.default_data_path()
print('data: %s\n' % os.path.relpath(DATA_PATH, ROOT))
RAW = open(DATA_PATH, encoding='utf-8').read()
BASE = V.filter_yaml(RAW, set())
SCRIPT = open('ccfddl-region-filter.user.js', encoding='utf-8').read()
SHIM = open(os.path.join(HERE, 'dom-shim.js'), encoding='utf-8').read()

fails = []


def check(name, cond, extra=''):
    print(('  PASS  ' if cond else '  FAIL  ') + name + (('  -- ' + extra) if extra and not cond else ''))
    if not cond:
        fails.append(name)


def new_ctx(selected=None):
    ctx = quickjs.Context()
    ctx.eval('globalThis.__YAML = ' + json.dumps(RAW) + ';')
    ctx.eval(SHIM)
    if selected is not None:
        ctx.eval('localStorage.setItem("ccfrf_selected", %s);' % json.dumps(json.dumps(selected)))
    # a minimal page: section > div.timezone, the anchor the panel is inserted before
    ctx.eval('''
      var sec = document.createElement('section');
      var tz = document.createElement('div'); tz.className = 'timezone';
      sec.appendChild(tz); document.body.appendChild(sec);
    ''')
    ctx.eval(SCRIPT)
    return ctx


def pump(ctx):
    for _ in range(2000):
        if not ctx.execute_pending_job():
            break


def fetch_filtered(ctx):
    ctx.eval('''
      globalThis.__OUT = null; globalThis.__ERR = null;
      window.fetch('https://ccfddl.com/conference/allconf.yml')
        .then(function (r) { return r.text(); })
        .then(function (t) { globalThis.__OUT = t; })
        .catch(function (e) { globalThis.__ERR = String(e); });
    ''')
    pump(ctx)
    err = ctx.eval('globalThis.__ERR')
    if err:
        raise RuntimeError('userscript threw during fetch: %s' % err)
    return ctx.eval('globalThis.__OUT')


print('== 1. script loads and patches fetch ==')
ctx = new_ctx()
check('userscript evaluates without throwing', True)
check('window.fetch was replaced', ctx.eval('window.fetch !== undefined && window.fetch.toString().indexOf("CONF_URL_RE") !== -1'))
check('String.prototype.normalize available in engine', ctx.eval('"\\u00e9".normalize("NFD").length === 2'))

print('\n== 2. unrelated requests pass through untouched ==')
ctx.eval('''
  globalThis.__OTHER = null;
  window.fetch('https://raw.githubusercontent.com/ccfddl/ccfddl.github.io/page/conference/types.yml')
    .then(function (r) { return r.text(); }).then(function (t) { globalThis.__OTHER = t.length; });
''')
pump(ctx)
check('non-allconf URL still resolves', ctx.eval('globalThis.__OTHER') == len(RAW))

print('\n== 3. no selection -> data passes through byte-identical ==')
out = fetch_filtered(new_ctx())
check('output identical to source YAML', out == RAW, 'len %d vs %d' % (len(out), len(RAW)))

print('\n== 4. filtered output matches the reference implementation ==')
for sel in [['us'], ['gc'], ['sea', 'sas'], ['mena'], ['other'], ['oce', 'ssa'],
            ['us', 'cana'], ['uki', 'weu', 'nordic', 'seu', 'ceu'], V.LEAVES]:
    js_out = fetch_filtered(new_ctx(sel))
    py = V.filter_yaml(RAW, set(sel))
    label = '+'.join(sel) if len(sel) < 6 else 'all %d leaves' % len(sel)
    check('selection [%s] -> identical to reference (%d years)' % (label, py['kept']),
          js_out == py['text'], 'js %d bytes, py %d bytes' % (len(js_out), len(py['text'])))

print('\n== 5. a selection matching nothing yields a valid empty document ==')
ctxn = new_ctx(['__nope__'])          # unknown keys are dropped -> behaves as "no filter"
check('unknown keys are ignored, not crashing', fetch_filtered(ctxn) == RAW)

print('\n== 6. panel is built and wired ==')
ctx = new_ctx(['us'])
ctx.eval('__runTimers();')
check('panel injected into the page', ctx.eval('!!document.getElementById("ccfrf-panel")'))
check('panel sits directly before .timezone',
      ctx.eval('''(function(){var sec=document.querySelector("section");
                   var i=sec.childNodes.map(function(n){return n.id||n.className;});
                   return i.indexOf("ccfrf-panel")>=0 && i.indexOf("ccfrf-panel") < i.indexOf("timezone");})()'''))
n_leaf = ctx.eval('document.querySelectorAll("input[data-leaf]").length')
check('one checkbox per leaf region (%d)' % len(V.LEAVES), n_leaf == len(V.LEAVES),
      'found %d, expected %d' % (n_leaf, len(V.LEAVES)))
check('US checkbox reflects the saved selection',
      ctx.eval('document.querySelector(\'input[data-leaf="us"]\').checked === true'))
check('an unselected region is unchecked',
      ctx.eval('document.querySelector(\'input[data-leaf="gc"]\').checked === false'))
check('parent of a partially-selected group is indeterminate',
      ctx.eval('document.querySelector(\'input[data-parent="na"]\').indeterminate === true'))
check('apply button starts disabled (draft == applied)',
      ctx.eval('document.querySelector("[data-role=apply]").disabled === true'))

print('\n== 7. counts appear after the data is intercepted ==')
fetch_filtered(ctx)
ctx.eval('__runTimers();')
us_count = ctx.eval('document.querySelector(\'[data-count="us"]\').textContent')
check('US bucket count shown as (%d)' % BASE['leaf_counts']['us'],
      us_count == '(%d)' % BASE['leaf_counts']['us'], 'got %r' % us_count)
countline = ctx.eval('document.querySelector(".ccfrf-count").textContent')
check('match line reports applied selection (%d / %d)' % (BASE['leaf_counts']['us'], BASE['total']),
      str(BASE['leaf_counts']['us']) in countline and str(BASE['total']) in countline, repr(countline))

print('\n== 8. toggling a box updates the draft, not the page ==')
ctx.eval('document.querySelector(\'input[data-leaf="gc"]\').checked = true;'
         'document.querySelector(\'input[data-leaf="gc"]\').dispatch("change");')
check('apply button becomes enabled', ctx.eval('document.querySelector("[data-role=apply]").disabled === false'))
check('nothing reloaded yet', ctx.eval('globalThis.__reloaded') == 0)
line2 = ctx.eval('document.querySelector(".ccfrf-count").textContent')
expected = V.filter_yaml(RAW, {'us', 'gc'})['kept']
check('preview count updates to %d' % expected, str(expected) in line2, repr(line2))

print('\n== 9. group checkbox selects all of its children ==')
ctx.eval('document.querySelector(\'input[data-parent="eu"]\').checked = true;'
         'document.querySelector(\'input[data-parent="eu"]\').dispatch("change");')
eu_all = ctx.eval('["uki","weu","nordic","seu","ceu"].every(function(k){'
                  'return document.querySelector(\'input[data-leaf="\'+k+\'"]\').checked;})')
check('all five European sub-regions checked', eu_all)

print('\n== 10. Apply persists the selection and reloads ==')
ctx.eval('document.querySelector("[data-role=apply]").dispatch("click");')
saved = json.loads(ctx.eval('localStorage.getItem("ccfrf_selected")'))
check('selection written to localStorage', set(saved) == {'us', 'gc', 'uki', 'weu', 'nordic', 'seu', 'ceu'}, repr(saved))
check('page reload requested', ctx.eval('globalThis.__reloaded') == 1)

print('\n== 11. "US only" and "Clear" shortcuts ==')
ctx.eval('document.querySelector("[data-role=us]").dispatch("click");')
check('US only leaves exactly one box checked',
      ctx.eval('document.querySelectorAll("input[data-leaf]").filter(function(b){return b.checked;}).length') == 1)
ctx.eval('document.querySelector("[data-role=clear]").dispatch("click");')
check('Clear unchecks everything',
      ctx.eval('document.querySelectorAll("input[data-leaf]").filter(function(b){return b.checked;}).length') == 0)

print('\n== 12. broken payload degrades gracefully ==')
ctx = quickjs.Context()
ctx.eval('globalThis.__YAML = "this: is not\\n  the expected\\nshape";')
ctx.eval(SHIM)
ctx.eval('var sec=document.createElement("section");var tz=document.createElement("div");'
         'tz.className="timezone";sec.appendChild(tz);document.body.appendChild(sec);')
ctx.eval(SCRIPT)
ctx.eval('''globalThis.__OUT=null;
  window.fetch('https://ccfddl.com/conference/allconf.yml').then(function(r){return r.text();})
   .then(function(t){globalThis.__OUT=t;});''')
pump(ctx)
check('unrecognised YAML is passed through, not swallowed',
      ctx.eval('globalThis.__OUT') == 'this: is not\n  the expected\nshape\n')

print('\n== 13. bootstrap reaches the page context ==')
ctx = new_ctx()
check('script injected itself into the page and ran there', ctx.eval('globalThis.__evalCount') == 1)
check('document marked active', ctx.eval('document.documentElement.getAttribute("data-ccfrf-active") === "1"'))
check('reports the page context in the console',
      any('running in the page context' in l for l in json.loads(ctx.eval('JSON.stringify(globalThis.__logs)'))))
check('fetch is patched after injection',
      ctx.eval('window.fetch.toString().indexOf("CONF_URL_RE") !== -1'))

print('\n== 14. re-running the userscript does not double up ==')
ctx.eval(SCRIPT)
ctx.eval('__runTimers();')
check('still exactly one injection', ctx.eval('globalThis.__evalCount') == 1)
check('still exactly one panel', ctx.eval('document.querySelectorAll("#ccfrf-panel").length') == 1)

print('\n== 15. a page CSP that blocks injection falls back in place ==')
ctx = quickjs.Context()
ctx.eval('globalThis.__YAML = ' + json.dumps(RAW) + ';')
ctx.eval(SHIM)
ctx.eval('globalThis.__cspBlock = true;')
ctx.eval('var sec=document.createElement("section");var tz=document.createElement("div");'
         'tz.className="timezone";sec.appendChild(tz);document.body.appendChild(sec);')
ctx.eval('localStorage.setItem("ccfrf_selected", %s);' % json.dumps(json.dumps(['us'])))
ctx.eval(SCRIPT)
ctx.eval('__runTimers();')
check('injection did not execute', ctx.eval('globalThis.__evalCount') == 0)
check('warns that the page context was not reached',
      any('could not reach the page context' in l
          for l in json.loads(ctx.eval('JSON.stringify(globalThis.__logs)'))))
check('panel is still built', ctx.eval('!!document.getElementById("ccfrf-panel")'))
check('panel tells the user how to fix it',
      'Allow user scripts' in ctx.eval('document.querySelector(".ccfrf-count").textContent'),
      ctx.eval('document.querySelector(".ccfrf-count").textContent')[:80])
# In a browser the sandbox is a separate world, so this only proves the fallback
# code path runs; the extension test is what proves the real-world behaviour.
check('fallback path still executes the filter without error',
      fetch_filtered(ctx) == V.filter_yaml(RAW, {'us'})['text'])

print('\n== 16. recovering when the data arrived before the filter attached ==')

def missed_data_ctx(selected, already_recovered=False):
    """A page that already rendered its list without us ever seeing the fetch."""
    c = quickjs.Context()
    c.eval('globalThis.__YAML = ' + json.dumps(RAW) + ';')
    c.eval(SHIM)
    c.eval('localStorage.setItem("ccfrf_selected", %s);' % json.dumps(json.dumps(selected)))
    if already_recovered:
        c.eval('sessionStorage.setItem("ccfrf_recovered", "1");')
    c.eval("""
      var sec=document.createElement('section');
      var tz=document.createElement('div'); tz.className='timezone'; sec.appendChild(tz);
      var row=document.createElement('div'); row.className='conf-title'; sec.appendChild(row);
      document.body.appendChild(sec);
    """)
    c.eval(SCRIPT)
    c.eval('__runTimers();')
    return c

c = missed_data_ctx(['us'])
c.eval('__tickIntervals(3);')
check('reloads once to pick the data up', c.eval('globalThis.__reloaded') == 1)
check('marks the tab so it can never loop',
      c.eval('sessionStorage.getItem("ccfrf_recovered") === "1"'))
c.eval('__tickIntervals(10);')
check('no further reloads from the same page', c.eval('globalThis.__reloaded') == 1)

c = missed_data_ctx(['us'], already_recovered=True)
c.eval('__tickIntervals(10);')
check('a tab that already recovered does not reload again', c.eval('globalThis.__reloaded') == 0)

c = missed_data_ctx([])
c.eval('__tickIntervals(10);')
check('no reload when no region is selected', c.eval('globalThis.__reloaded') == 0)

c = missed_data_ctx(['us'])
fetch_filtered(c)
c.eval('__tickIntervals(10);')
check('no reload once the data was intercepted normally', c.eval('globalThis.__reloaded') == 0)
check('recovery marker cleared after a good load',
      c.eval('sessionStorage.getItem("ccfrf_recovered") === null'))

print('\n' + ('ALL CHECKS PASSED' if not fails else '%d CHECK(S) FAILED: %s' % (len(fails), fails)))
sys.exit(1 if fails else 0)
