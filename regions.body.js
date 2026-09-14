(function () {
  'use strict';

  // Runs in the page's own JavaScript context (see the bootstrap at the bottom).
  // `inPageContext` is false only when injection was blocked and we are running
  // inside the userscript manager's sandbox, where patching fetch cannot work.
  function main(inPageContext) {
    'use strict';

    var root = document.documentElement;
    if (root) {
      if (root.getAttribute('data-ccfrf-active') === '1') return;
      root.setAttribute('data-ccfrf-active', '1');
    }

    // ---------------------------------------------------------------------------
    // Region data (generated from regions.data.json -- do not hand-edit here)
    // ---------------------------------------------------------------------------
    var DATA = /*__REGION_DATA__*/ null /*__END_REGION_DATA__*/;

    var VERSION = /*__VERSION__*/ '0.0.0' /*__END_VERSION__*/;
    var LS_SELECTED = 'ccfrf_selected';
    var SS_RECOVERED = 'ccfrf_recovered';
    var LS_COLLAPSED = 'ccfrf_collapsed';
    var CONF_URL_RE = /\/conference\/allconf\.yml(\?|$)/;

    // Leaf keys = children when a group has them, otherwise the group itself.
    var LEAVES = [];
    DATA.tree.forEach(function (g) {
      if (g.children && g.children.length) {
        g.children.forEach(function (c) { LEAVES.push(c.key); });
      } else {
        LEAVES.push(g.key);
      }
    });
    var LEAF_SET = new Set(LEAVES);

    // ---------------------------------------------------------------------------
    // Place -> region classification
    // ---------------------------------------------------------------------------
    var CHAR_FIXES = { 'ø': 'o', 'ł': 'l', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ı': 'i' };

    function normalize(raw) {
      var s = String(raw == null ? '' : raw).toLowerCase();
      s = s.replace(/[øłæœßđðþı]/g, function (c) { return CHAR_FIXES[c]; });
      s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
      s = s.replace(/[，、；;]/g, ',');
      s = s.replace(/\./g, '');
      s = s.replace(/[^a-z0-9,]+/g, ' ');
      s = s.replace(/\s*,\s*/g, ',').replace(/,+/g, ',');
      s = s.replace(/\s+/g, ' ');
      return s.replace(/^[\s,]+|[\s,]+$/g, '');
    }

    function classify(place) {
      var norm = normalize(place);
      var segs = norm ? norm.split(',').filter(Boolean) : [];
      var hay = ' ' + segs.join(' ') + ' ';
      var found = new Set();
      var alias;

      for (alias in DATA.countries) {
        if (hay.indexOf(' ' + alias + ' ') !== -1) found.add(DATA.countries[alias]);
      }
      if (!found.size) {
        segs.forEach(function (seg) {
          if (DATA.segments[seg]) found.add(DATA.segments[seg]);
        });
      }
      if (!found.size) {
        for (alias in DATA.places) {
          if (hay.indexOf(' ' + alias + ' ') !== -1) found.add(DATA.places[alias]);
        }
      }
      for (var i = 0; i < DATA.virtual.length; i++) {
        if (hay.indexOf(' ' + DATA.virtual[i] + ' ') !== -1) { found.add('other'); break; }
      }
      if (!found.size) found.add('other');
      return Array.from(found);
    }

    // ---------------------------------------------------------------------------
    // Selection state
    // ---------------------------------------------------------------------------
    function loadSelected() {
      try {
        var raw = localStorage.getItem(LS_SELECTED);
        if (!raw) return new Set();
        var arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return new Set();
        return new Set(arr.filter(function (k) { return LEAF_SET.has(k); }));
      } catch (e) { return new Set(); }
    }
    function saveSelected(set) {
      try { localStorage.setItem(LS_SELECTED, JSON.stringify(Array.from(set))); } catch (e) {}
    }

    var applied = loadSelected();   // what the current page load was filtered with
    var draft = new Set(applied);   // what the panel currently shows

    // Stats collected while filtering the YAML.
    var stats = { itemRegions: [], leafCounts: {}, total: 0, intercepted: false, unknown: [] };

    // ---------------------------------------------------------------------------
    // YAML filtering (line-based; allconf.yml is machine-generated, 2-space indent)
    // ---------------------------------------------------------------------------
    function unquote(v) {
      var s = String(v).trim();
      if (s.length >= 2 && ((s[0] === "'" && s[s.length - 1] === "'") || (s[0] === '"' && s[s.length - 1] === '"'))) {
        return s.slice(1, -1);
      }
      return s;
    }

    // Parse the whole file into conferences -> year entries, then emit only the
    // year entries whose place matches the selection (dropping conferences that
    // end up with no years at all).
    function filterYaml(text, selected) {
      var lines = text.split('\n');
      while (lines.length && lines[lines.length - 1] === '') lines.pop();

      var confs = [];
      var pre = [];
      var curConf = null, curYear = null, inConfs = false;

      function pushYear() { if (curConf && curYear) { curConf.years.push(curYear); curYear = null; } }
      function pushConf() { pushYear(); if (curConf) { confs.push(curConf); curConf = null; } inConfs = false; }

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (/^- /.test(line)) { pushConf(); curConf = { head: [line], tail: [], years: [] }; continue; }
        if (!curConf) { pre.push(line); continue; }
        if (!inConfs) {
          curConf.head.push(line);
          if (/^ {2}confs:\s*$/.test(line)) inConfs = true;
          continue;
        }
        if (/^ {2}- /.test(line)) { pushYear(); curYear = { lines: [line], place: '' }; continue; }
        if (/^ {2}[^\s-]/.test(line)) { pushYear(); curConf.tail.push(line); continue; }
        if (curYear) {
          curYear.lines.push(line);
          var m = /^ {4}place:\s*(.*)$/.exec(line);
          if (m) curYear.place = unquote(m[1]);
          continue;
        }
        curConf.head.push(line);
      }
      pushConf();

      var filtering = selected && selected.size > 0;
      var itemRegions = [], leafCounts = {}, unknown = [];
      LEAVES.forEach(function (k) { leafCounts[k] = 0; });

      var out = pre.slice();
      var total = 0, kept = 0;

      confs.forEach(function (conf) {
        var keepYears = [];
        conf.years.forEach(function (y) {
          var regions = classify(y.place);
          total++;
          itemRegions.push(regions);
          regions.forEach(function (r) { if (r in leafCounts) leafCounts[r]++; });
          if (regions.length === 1 && regions[0] === 'other' && normalize(y.place) && !isVirtualish(y.place)) {
            unknown.push(y.place);
          }
          var hit = !filtering || regions.some(function (r) { return selected.has(r); });
          if (hit) { keepYears.push(y); kept++; }
        });
        if (keepYears.length) {
          out.push.apply(out, conf.head);
          keepYears.forEach(function (y) { out.push.apply(out, y.lines); });
          out.push.apply(out, conf.tail);
        }
      });

      return {
        text: out.length ? out.join('\n') + '\n' : '[]\n',
        itemRegions: itemRegions,
        leafCounts: leafCounts,
        total: total,
        kept: kept,
        unknown: unknown
      };
    }

    function isVirtualish(place) {
      var hay = ' ' + normalize(place).split(',').join(' ') + ' ';
      return DATA.virtual.some(function (kw) { return hay.indexOf(' ' + kw + ' ') !== -1; });
    }

    // ---------------------------------------------------------------------------
    // fetch interception -- filter the YAML before the WASM app parses it
    // ---------------------------------------------------------------------------
    // A Response built with `new Response(...)` always reports an empty `.url`,
    // and reqwest (which the site's wasm bundle uses) parses that field and fails
    // with "url parse". Shadow the prototype getter with the real URL.
    function rebuildResponse(bodyText, res) {
      var out = new Response(bodyText, {
        status: res.status,
        statusText: res.statusText,
        headers: { 'Content-Type': 'text/yaml; charset=utf-8' }
      });
      try {
        Object.defineProperty(out, 'url', { value: res.url, writable: false, configurable: true });
      } catch (e) { /* non-fatal: only affects error messages in some clients */ }
      return out;
    }

    // Bound on purpose: the wasm-bindgen glue calls fetch both as `window.fetch(r)`
    // and as a bare `fetch(r)`, and a bare call inside this strict-mode wrapper
    // would forward `this === undefined` to the native fetch ("Illegal invocation").
    var nativeFetch = window.fetch.bind(window);
    var delegate = nativeFetch;   // whoever patched fetch after us, if anyone
    var depth = 0;

    function callDelegate(args) {
      // Another extension's wrapper may have captured our wrapper as its
      // "original" and call back into us. Guard the depth so the two cannot
      // bounce forever: a re-entrant call goes straight to the network.
      depth++;
      try {
        return delegate.apply(null, args);
      } finally {
        depth--;
      }
    }

    function fetchWrapper(input, init) {
      if (depth) return nativeFetch.apply(null, arguments);

      var url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
      if (!CONF_URL_RE.test(url)) return callDelegate(arguments);

      return callDelegate(arguments).then(function (res) {
        if (!res || !res.ok) return res;
        return res.text().then(function (text) {
          var result;
          try {
            result = filterYaml(text, applied);
          } catch (e) {
            console.error('[ccf-region-filter] failed to filter allconf.yml, passing through', e);
            return rebuildResponse(text, res);
          }
          stats.intercepted = true;
          stats.itemRegions = result.itemRegions;
          stats.leafCounts = result.leafCounts;
          stats.total = result.total;
          stats.unknown = result.unknown;
          console.log('[ccf-region-filter] ' + result.kept + '/' + result.total +
                      ' conference-years kept' + (applied.size ? ' for [' + Array.from(applied).join(', ') + ']' : ' (no filter)'));
          if (result.unknown.length) {
            console.log('[ccf-region-filter] unclassified places:', Array.from(new Set(result.unknown)));
          }
          refreshPanel();
          return rebuildResponse(result.text, res);
        });
      });
    }

    // Own the fetch property rather than merely assigning it. Other extensions
    // patch fetch too, and a plain assignment loses to whoever writes last --
    // which is a coin toss that changes from page load to page load. With an
    // accessor, a later `window.fetch = theirs` puts them *under* us instead of
    // replacing us, and everyone still gets to run.
    function installFetchHook() {
      var desc = Object.getOwnPropertyDescriptor(window, 'fetch');
      if (desc && desc.get === getFetch) return true;
      // Whatever currently sits on window.fetch becomes our delegate, so a hook
      // that replaced the property outright keeps working underneath us.
      try {
        var current = desc ? (desc.value || (desc.get && desc.get.call(window))) : window.fetch;
        if (typeof current === 'function' && current !== fetchWrapper) {
          delegate = typeof current.bind === 'function' ? current.bind(window) : current;
        }
      } catch (e) { /* leave the previous delegate in place */ }
      if (desc && !desc.configurable) {
        window.fetch = fetchWrapper;   // best effort
        return window.fetch === fetchWrapper;
      }
      try {
        Object.defineProperty(window, 'fetch', {
          configurable: true,
          enumerable: true,
          get: getFetch,
          set: function (v) {
            if (typeof v === 'function' && v !== fetchWrapper) {
              delegate = typeof v.bind === 'function' ? v.bind(window) : v;
            }
          }
        });
        return true;
      } catch (e) {
        window.fetch = fetchWrapper;
        return window.fetch === fetchWrapper;
      }
    }

    function getFetch() { return fetchWrapper; }

    installFetchHook();
    // Someone can still redefine the property outright; re-take it for a while,
    // which is all the time that matters -- the app asks for its data up front.
    [0, 50, 150, 400, 1000, 2500, 6000].forEach(function (ms) {
      setTimeout(installFetchHook, ms);
    });

    // ---------------------------------------------------------------------------
    // UI
    // ---------------------------------------------------------------------------
    var PANEL_ID = 'ccfrf-panel';
    var panelEl = null;

    function useEnglish() {
      try { return localStorage.getItem('use_english') === 'true'; } catch (e) { return false; }
    }
    function t(zh, en) { return useEnglish() ? en : zh; }

    function labelOf(node) { return useEnglish() ? node.en : node.zh; }

    function leafKeysOf(group) {
      return (group.children && group.children.length)
        ? group.children.map(function (c) { return c.key; })
        : [group.key];
    }

    function matchCount(sel) {
      if (!stats.itemRegions.length) return null;
      if (!sel.size) return stats.total;
      var n = 0;
      stats.itemRegions.forEach(function (regions) {
        for (var i = 0; i < regions.length; i++) if (sel.has(regions[i])) { n++; return; }
      });
      return n;
    }

    function setsEqual(a, b) {
      if (a.size !== b.size) return false;
      var eq = true;
      a.forEach(function (v) { if (!b.has(v)) eq = false; });
      return eq;
    }

    var CSS = [
      '#ccfrf-panel{margin-top:14px;border:1px solid var(--ccfrf-border,#e4e7ed);border-radius:8px;',
      'padding:10px 12px;font-size:var(--font-size-sm,14px);color:#4a4a4a;background:rgba(127,127,127,.04)}',
      '#ccfrf-panel .ccfrf-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;cursor:pointer;user-select:none}',
      '#ccfrf-panel .ccfrf-title{font-weight:600}',
      '#ccfrf-panel .ccfrf-ver{color:#c0c4cc;font-size:12px;font-weight:400}',
      '#ccfrf-panel .ccfrf-sum{color:#909399;font-weight:400;flex:1 1 auto;min-width:120px}',
      '#ccfrf-panel .ccfrf-caret{color:#909399;transition:transform .15s ease}',
      '#ccfrf-panel.ccfrf-collapsed .ccfrf-body{display:none}',
      '#ccfrf-panel.ccfrf-collapsed .ccfrf-caret{transform:rotate(-90deg)}',
      '#ccfrf-panel .ccfrf-body{margin-top:10px}',
      '#ccfrf-panel .ccfrf-group{display:flex;align-items:flex-start;flex-wrap:wrap;gap:6px 14px;',
      'padding:5px 0;border-top:1px dashed rgba(127,127,127,.25)}',
      '#ccfrf-panel .ccfrf-group:first-child{border-top:none}',
      '#ccfrf-panel .ccfrf-parent{min-width:9.5em;font-weight:600}',
      '#ccfrf-panel .ccfrf-kids{display:flex;flex-wrap:wrap;gap:6px 14px;flex:1 1 auto}',
      '#ccfrf-panel label{display:inline-flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap}',
      '#ccfrf-panel label.ccfrf-us{color:#1d4ed8}',
      '#ccfrf-panel input[type=checkbox]{cursor:pointer;margin:0;width:14px;height:14px;accent-color:#409eff}',
      '#ccfrf-panel .ccfrf-n{color:#a8abb2;font-size:12px}',
      '#ccfrf-panel .ccfrf-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;',
      'padding-top:8px;border-top:1px solid rgba(127,127,127,.25)}',
      '#ccfrf-panel button{font:inherit;font-size:13px;padding:3px 12px;border-radius:5px;cursor:pointer;',
      'border:1px solid #dcdfe6;background:transparent;color:inherit}',
      '#ccfrf-panel button:hover{border-color:#409eff;color:#409eff}',
      '#ccfrf-panel button.ccfrf-apply{background:#409eff;border-color:#409eff;color:#fff}',
      '#ccfrf-panel button.ccfrf-apply:hover{background:#66b1ff;color:#fff}',
      '#ccfrf-panel button:disabled{opacity:.45;cursor:default;border-color:#dcdfe6;color:inherit;background:transparent}',
      '#ccfrf-panel .ccfrf-count{color:#909399;flex:1 1 auto;min-width:120px}',
      '#ccfrf-panel .ccfrf-warn{color:#e6a23c;white-space:normal;line-height:1.45;flex:1 1 100%}',
      '@media (max-width:600px){#ccfrf-panel .ccfrf-parent{min-width:100%}}'
    ].join('');

    function injectCss() {
      if (document.getElementById('ccfrf-css')) return;
      var st = document.createElement('style');
      st.id = 'ccfrf-css';
      st.textContent = CSS;
      (document.head || document.documentElement).appendChild(st);
    }

    function buildPanel() {
      var wrap = document.createElement('div');
      wrap.id = PANEL_ID;
      var collapsed = false;
      try { collapsed = localStorage.getItem(LS_COLLAPSED) === '1'; } catch (e) {}
      if (collapsed) wrap.className = 'ccfrf-collapsed';

      var head = document.createElement('div');
      head.className = 'ccfrf-head';
      ['ccfrf-caret', 'ccfrf-title', 'ccfrf-ver', 'ccfrf-sum'].forEach(function (cls) {
        var sp = document.createElement('span');
        sp.className = cls;
        if (cls === 'ccfrf-caret') sp.textContent = '▾';
        head.appendChild(sp);
      });
      head.addEventListener('click', function () {
        wrap.classList.toggle('ccfrf-collapsed');
        try { localStorage.setItem(LS_COLLAPSED, wrap.classList.contains('ccfrf-collapsed') ? '1' : '0'); } catch (e) {}
      });
      wrap.appendChild(head);

      var body = document.createElement('div');
      body.className = 'ccfrf-body';
      wrap.appendChild(body);

      DATA.tree.forEach(function (group) {
        var row = document.createElement('div');
        row.className = 'ccfrf-group';

        var kids = leafKeysOf(group);
        var isLeafGroup = !(group.children && group.children.length);

        var pLabel = document.createElement('label');
        pLabel.className = 'ccfrf-parent';
        var pBox = document.createElement('input');
        pBox.type = 'checkbox';
        pBox.dataset.parent = group.key;
        pBox.addEventListener('change', function () {
          kids.forEach(function (k) { if (pBox.checked) draft.add(k); else draft.delete(k); });
          refreshPanel();
        });
        pLabel.appendChild(pBox);
        var pText = document.createElement('span');
        pText.dataset.role = 'text';
        pLabel.appendChild(pText);
        if (isLeafGroup) {
          var pN = document.createElement('span');
          pN.className = 'ccfrf-n';
          pN.dataset.count = group.key;
          pLabel.appendChild(pN);
        }
        row.appendChild(pLabel);

        if (!isLeafGroup) {
          var kidWrap = document.createElement('div');
          kidWrap.className = 'ccfrf-kids';
          group.children.forEach(function (child) {
            var l = document.createElement('label');
            if (child.key === 'us') l.className = 'ccfrf-us';
            var b = document.createElement('input');
            b.type = 'checkbox';
            b.dataset.leaf = child.key;
            b.addEventListener('change', function () {
              if (b.checked) draft.add(child.key); else draft.delete(child.key);
              refreshPanel();
            });
            l.appendChild(b);
            var s = document.createElement('span');
            s.dataset.role = 'text';
            l.appendChild(s);
            var n = document.createElement('span');
            n.className = 'ccfrf-n';
            n.dataset.count = child.key;
            l.appendChild(n);
            kidWrap.appendChild(l);
          });
          row.appendChild(kidWrap);
        } else {
          pBox.dataset.leaf = group.key;
          pBox.addEventListener('change', function () {
            if (pBox.checked) draft.add(group.key); else draft.delete(group.key);
          });
        }
        body.appendChild(row);
      });

      var foot = document.createElement('div');
      foot.className = 'ccfrf-foot';

      function mkBtn(cls, onClick) {
        var b = document.createElement('button');
        b.type = 'button';
        if (cls) b.className = cls;
        b.addEventListener('click', onClick);
        foot.appendChild(b);
        return b;
      }
      var btnUS = mkBtn('', function () { draft = new Set(['us']); refreshPanel(); });
      btnUS.dataset.role = 'us';
      var btnAll = mkBtn('', function () { draft = new Set(); refreshPanel(); });
      btnAll.dataset.role = 'clear';
      var btnInvert = mkBtn('', function () {
        var next = new Set();
        LEAVES.forEach(function (k) { if (!draft.has(k)) next.add(k); });
        if (next.size === LEAVES.length) next = new Set();
        draft = next;
        refreshPanel();
      });
      btnInvert.dataset.role = 'invert';

      var count = document.createElement('span');
      count.className = 'ccfrf-count';
      foot.appendChild(count);

      var apply = mkBtn('ccfrf-apply', function () {
        saveSelected(draft);
        location.reload();
      });
      apply.dataset.role = 'apply';

      wrap.appendChild(foot);
      panelEl = wrap;
      return wrap;
    }

    function refreshPanel() {
      if (!panelEl || !panelEl.isConnected) return;
      var en = useEnglish();

      panelEl.querySelector('.ccfrf-title').textContent = '🌍 ' + t('地区筛选', 'Region filter');
      panelEl.querySelector('.ccfrf-ver').textContent = 'v' + VERSION;

      // checkbox states
      DATA.tree.forEach(function (group) {
        var kids = leafKeysOf(group);
        var pBox = panelEl.querySelector('input[data-parent="' + group.key + '"]');
        var on = kids.filter(function (k) { return draft.has(k); }).length;
        pBox.checked = on === kids.length && on > 0;
        pBox.indeterminate = on > 0 && on < kids.length;
        var pLabel = pBox.parentNode;
        pLabel.querySelector('[data-role=text]').textContent = labelOf(group);
        (group.children || []).forEach(function (child) {
          var b = panelEl.querySelector('input[data-leaf="' + child.key + '"]');
          if (!b) return;
          b.checked = draft.has(child.key);
          b.parentNode.querySelector('[data-role=text]').textContent = labelOf(child);
        });
      });

      // counts
      panelEl.querySelectorAll('.ccfrf-n').forEach(function (el) {
        var k = el.dataset.count;
        el.textContent = stats.total ? '(' + (stats.leafCounts[k] || 0) + ')' : '';
      });

      // summary line
      panelEl.querySelector('.ccfrf-sum').textContent = applied.size
        ? t('已筛选：', 'active: ') + summaryOf(applied)
        : t('（未筛选，显示全部）', '(no filter, showing all)');

      // footer
      var foot = panelEl.querySelector('.ccfrf-foot');
      foot.querySelector('[data-role=us]').textContent = t('只看美国', 'US only');
      foot.querySelector('[data-role=clear]').textContent = t('清空', 'Clear');
      foot.querySelector('[data-role=invert]').textContent = t('反选', 'Invert');

      var applyBtn = foot.querySelector('[data-role=apply]');
      var dirty = !setsEqual(draft, applied);
      applyBtn.disabled = !dirty;
      applyBtn.textContent = dirty ? t('应用（刷新）', 'Apply (reload)') : t('已应用', 'Applied');

      var countEl = foot.querySelector('.ccfrf-count');
      if (!inPageContext) {
        // The one failure we can name precisely: the script never reached the
        // page, so the page's own window.fetch was never replaced.
        countEl.className = 'ccfrf-count ccfrf-warn';
        countEl.textContent = t(
          '⚠ 脚本被限制在扩展沙箱里，筛选无法生效。请到 chrome://extensions 打开油猴的'
          + '「允许用户脚本 / Allow user scripts」（或开启开发者模式），然后刷新本页。',
          '⚠ The script is confined to the extension sandbox, so filtering cannot work. '
          + 'Enable "Allow user scripts" (or developer mode) for your userscript manager '
          + 'in chrome://extensions, then reload this page.');
      } else if (!stats.intercepted) {
        countEl.className = 'ccfrf-count ccfrf-warn';
        countEl.textContent = t(
          '⚠ 没拦到会议数据请求，本次筛选未生效。可能是页面被浏览器预加载，或有别的扩展抢先接管了'
          + ' fetch —— 手动刷新一次通常就好。',
          '⚠ The conference data request was not intercepted, so nothing was filtered. The page '
          + 'may have been preloaded, or another extension may have taken over fetch -- a manual '
          + 'refresh usually fixes it.');
      } else {
        var n = matchCount(draft);
        countEl.className = 'ccfrf-count';
        countEl.textContent = n === null ? '' :
          (en ? (dirty ? 'will show ' : 'showing ') + n + ' / ' + stats.total + ' entries'
              : (dirty ? '将显示 ' : '当前显示 ') + n + ' / ' + stats.total + ' 条');
      }
    }

    function summaryOf(sel) {
      var names = [];
      DATA.tree.forEach(function (group) {
        var kids = leafKeysOf(group);
        var on = kids.filter(function (k) { return sel.has(k); });
        if (!on.length) return;
        if (on.length === kids.length) names.push(labelOf(group));
        else on.forEach(function (k) {
          var node = (group.children || []).filter(function (c) { return c.key === k; })[0];
          names.push(node ? labelOf(node) : k);
        });
      });
      return names.join(' / ');
    }

    function anchorAndInject() {
      if (document.getElementById(PANEL_ID)) return;
      var tz = document.querySelector('section .timezone') || document.querySelector('.timezone');
      if (!tz || !tz.parentNode) return;
      injectCss();
      var panel = buildPanel();
      tz.parentNode.insertBefore(panel, tz);
      refreshPanel();
    }

    var pending = null;
    function schedule() {
      if (pending) return;
      pending = setTimeout(function () { pending = null; anchorAndInject(); }, 60);
    }

    // If the app already had its data before we could replace fetch -- the page
    // was prerendered by the omnibox, or the manager injected us late -- then no
    // amount of waiting helps, because the request is long gone. One reload does
    // fix it: on a normal load the patch is in place before anything is asked
    // for. Bounded to a single reload per tab, and only when a filter is
    // actually selected, so it can never loop.
    function recoverIfDataArrivedFirst() {
      if (!inPageContext || !applied.size) return;
      var waited = 0;
      var timer = setInterval(function () {
        if (stats.intercepted) {
          clearInterval(timer);
          try { sessionStorage.removeItem(SS_RECOVERED); } catch (e) {}
          return;
        }
        // a rendered row means the app has its data and we missed the request
        var rendered = document.querySelector('.conf-title');
        if (!rendered && (waited += 500) < 20000) return;
        clearInterval(timer);
        if (!rendered) return;
        try {
          if (sessionStorage.getItem(SS_RECOVERED) === '1') return;
          sessionStorage.setItem(SS_RECOVERED, '1');
        } catch (e) { return; }
        var nav = (performance.getEntriesByType('navigation') || [])[0];
        console.warn('[ccf-region-filter] the conference list loaded before the filter could ' +
                     'attach' + (nav && nav.activationStart ? ' (page was prerendered)' : '') +
                     '; reloading once to apply it');
        location.reload();
      }, 500);
    }

    function start() {
      // may not have existed when main() began, on very early injection
      if (document.documentElement) {
        document.documentElement.setAttribute('data-ccfrf-active', '1');
      }
      schedule();
      new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
      // keep labels in sync with the site's 中文/English switch
      var lastLang = useEnglish();
      setInterval(function () {
        var cur = useEnglish();
        if (cur !== lastLang) { lastLang = cur; refreshPanel(); }
      }, 400);
      // if nothing was intercepted, say so instead of pretending the filter works
      setTimeout(function () { if (!stats.intercepted) refreshPanel(); }, 8000);
      recoverIfDataArrivedFirst();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  //
  // Filtering works by replacing window.fetch, which only affects the page if we
  // are running in the page's own JavaScript context. A userscript manager does
  // not guarantee that: Tampermonkey on Chrome MV3 falls back to an isolated
  // content-script world when it cannot register a main-world script (e.g. when
  // "Allow User Scripts" / developer mode is off), and Firefox content scripts
  // are isolated by default. In an isolated world the DOM is shared -- so the
  // panel would still appear -- but `window.fetch` is a different object and
  // patching it does nothing, which is exactly the "not intercepted" warning.
  //
  // So inject the whole thing into the page as a <script> element, which always
  // executes in the page context, and fall back to running in place if a page's
  // CSP blocks that.
  // ---------------------------------------------------------------------------
  var root = document.documentElement;
  if (!root) {
    // Nothing has been parsed yet. A content script never runs this early -- it
    // is scheduled after <html> exists -- so the only way to be here is a
    // main-world evaluation, which means we already have the page's fetch.
    main(true);
    return;
  }
  if (root.getAttribute('data-ccfrf-active') === '1') return;

  var injected = false;
  try {
    var tag = document.createElement('script');
    tag.setAttribute('data-ccfrf', 'bootstrap');
    tag.textContent = '(' + main.toString() + ')(true);';
    (document.head || root).appendChild(tag);
    if (tag.parentNode) tag.parentNode.removeChild(tag);
    injected = root.getAttribute('data-ccfrf-active') === '1';
  } catch (e) {
    injected = false;
  }

  if (injected) {
    console.log('[ccf-region-filter] running in the page context');
  } else {
    // CSP blocked the injection (or we cannot create elements yet). The panel
    // still works from here; fetch interception may not, and the panel says so.
    console.warn('[ccf-region-filter] could not reach the page context, so the page\'s ' +
                 'window.fetch cannot be replaced and filtering will not take effect. ' +
                 'In Chrome, enable "Allow user scripts" (or developer mode) for your ' +
                 'userscript manager at chrome://extensions, then reload.');
    main(false);
  }
})();
