/* Minimal DOM / browser shim so the userscript can be executed under QuickJS.
   Implements only what ccfddl-region-filter.user.js actually touches. */
(function () {
  globalThis.__logs = [];
  globalThis.console = {
    log: function () { globalThis.__logs.push(Array.prototype.slice.call(arguments).map(String).join(' ')); },
    warn: function () { globalThis.console.log.apply(null, arguments); },
    error: function () { globalThis.console.log.apply(null, arguments); }
  };

  var timers = [], nextId = 1;
  globalThis.setTimeout = function (fn, ms) { timers.push({ id: nextId, fn: fn, ms: ms || 0 }); return nextId++; };
  globalThis.clearTimeout = function (id) { timers = timers.filter(function (t) { return t.id !== id; }); };
  globalThis.setInterval = function () { return nextId++; };   // never fires in tests
  globalThis.clearInterval = function () {};
  globalThis.__runTimers = function () {
    var guard = 0;
    while (timers.length && guard++ < 50) {
      var due = timers; timers = [];
      due.sort(function (a, b) { return a.ms - b.ms; });
      due.forEach(function (t) { t.fn(); });
    }
  };

  function parseSimple(sel) {
    // supports: tag, #id, .class, [attr=val], [attr="val"] and combinations
    var out = { tag: null, id: null, classes: [], attrs: [] };
    var re = /(^[a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=("?)([^\]"]*)\5)?\]/g, m;
    while ((m = re.exec(sel))) {
      if (m[1]) out.tag = m[1].toUpperCase();
      else if (m[2]) out.id = m[2];
      else if (m[3]) out.classes.push(m[3]);
      else if (m[4]) out.attrs.push([m[4], m[6] === undefined ? null : m[6]]);
    }
    return out;
  }

  function Element(tag) {
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.id = '';
    this.textContent = '';
    this._listeners = {};
    var self = this;
    this.classList = {
      add: function (c) { if (!self._cls().includes(c)) self.className = (self.className + ' ' + c).trim(); },
      remove: function (c) { self.className = self._cls().filter(function (x) { return x !== c; }).join(' '); },
      contains: function (c) { return self._cls().includes(c); },
      toggle: function (c) { if (self.classList.contains(c)) self.classList.remove(c); else self.classList.add(c); }
    };
  }
  Element.prototype._cls = function () { return this.className ? this.className.split(/\s+/) : []; };
  Element.prototype.appendChild = function (c) { c.parentNode = this; this.childNodes.push(c); return c; };
  Element.prototype.insertBefore = function (n, ref) {
    var i = this.childNodes.indexOf(ref);
    if (i < 0) i = this.childNodes.length;
    this.childNodes.splice(i, 0, n);
    n.parentNode = this;
    return n;
  };
  Element.prototype.addEventListener = function (t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); };
  Element.prototype.dispatch = function (t) { (this._listeners[t] || []).forEach(function (f) { f({ type: t }); }); };
  Element.prototype._matches = function (p) {
    if (p.tag && this.tagName !== p.tag) return false;
    if (p.id && this.id !== p.id) return false;
    for (var i = 0; i < p.classes.length; i++) if (!this._cls().includes(p.classes[i])) return false;
    for (var j = 0; j < p.attrs.length; j++) {
      var name = p.attrs[j][0], want = p.attrs[j][1], have;
      if (name.indexOf('data-') === 0) have = this.dataset[name.slice(5).replace(/-(\w)/g, function (_, c) { return c.toUpperCase(); })];
      else have = this[name];
      if (have === undefined) return false;
      if (want !== null && String(have) !== want) return false;
    }
    return true;
  };
  Element.prototype._descend = function (out) {
    this.childNodes.forEach(function (c) { out.push(c); c._descend(out); });
    return out;
  };
  Element.prototype.querySelectorAll = function (sel) {
    var parts = sel.trim().split(/\s+(?![^\[]*\])/).map(parseSimple);
    var scope = [this];
    parts.forEach(function (p) {
      var next = [];
      scope.forEach(function (node) {
        node._descend([]).forEach(function (d) { if (d._matches(p) && next.indexOf(d) < 0) next.push(d); });
      });
      scope = next;
    });
    scope.forEach = Array.prototype.forEach;
    return scope;
  };
  Element.prototype.querySelector = function (sel) { var r = this.querySelectorAll(sel); return r.length ? r[0] : null; };
  Object.defineProperty(Element.prototype, 'isConnected', {
    get: function () { var n = this; while (n.parentNode) n = n.parentNode; return n === globalThis.document.documentElement; }
  });

  var documentElement = new Element('html');
  var head = new Element('head');
  var body = new Element('body');
  documentElement.appendChild(head);
  documentElement.appendChild(body);

  globalThis.document = {
    readyState: 'complete',
    documentElement: documentElement,
    head: head,
    body: body,
    createElement: function (t) { return new Element(t); },
    addEventListener: function () {},
    querySelector: function (s) { return documentElement.querySelector(s); },
    querySelectorAll: function (s) { return documentElement.querySelectorAll(s); },
    getElementById: function (id) { return documentElement.querySelector('#' + id); }
  };

  globalThis.MutationObserver = function (cb) { this.observe = function () {}; this.disconnect = function () {}; this.cb = cb; };

  var store = {};
  globalThis.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    _dump: function () { return store; }
  };

  globalThis.Response = function (bodyText, init) {
    init = init || {};
    this._body = bodyText == null ? '' : String(bodyText);
    this.status = init.status === undefined ? 200 : init.status;
    this.statusText = init.statusText || '';
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = init.headers || {};
    this.url = init.url || '';
    var self = this;
    this.text = function () { return Promise.resolve(self._body); };
    this.clone = function () { return new globalThis.Response(self._body, init); };
  };

  globalThis.__reloaded = 0;
  globalThis.location = { href: 'https://ccfddl.com/', reload: function () { globalThis.__reloaded++; } };
  globalThis.window = globalThis;

  // network stub: the userscript captures this as origFetch
  globalThis.__fetchLog = [];
  globalThis.fetch = function (url) {
    globalThis.__fetchLog.push(String(url));
    return Promise.resolve(new globalThis.Response(globalThis.__YAML, { status: 200, statusText: 'OK' }));
  };
})();
