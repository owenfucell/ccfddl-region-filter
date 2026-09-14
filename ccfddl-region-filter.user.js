// ==UserScript==
// @name         CCF Deadlines 地区筛选 / Region Filter
// @name:en      CCF Deadlines Region Filter
// @namespace    https://github.com/owenfucell/ccfddl-region-filter
// @version      1.3.0
// @description  给 ccfddl.com 加上按地区筛选：单独的「美国」开关，加上按大洲及细分区域（大中华、东南亚、南亚、中东北非…）筛选会议。
// @description:en Filter ccf-deadlines by where the conference is held: a dedicated US toggle plus continents and finer buckets (Greater China, SE Asia, South Asia, MENA, ...).
// @author       owenfucell
// @license      MIT
// @homepageURL  https://github.com/owenfucell/ccfddl-region-filter
// @supportURL   https://github.com/owenfucell/ccfddl-region-filter/issues
// @downloadURL  https://raw.githubusercontent.com/owenfucell/ccfddl-region-filter/main/ccfddl-region-filter.user.js
// @updateURL    https://raw.githubusercontent.com/owenfucell/ccfddl-region-filter/main/ccfddl-region-filter.user.js
// @match        https://ccfddl.com/*
// @match        https://ccfddl.cn/*
// @match        https://ccfddl.github.io/*
// @icon         https://ccfddl.com/favicon-3d96098597f8625c.ico
// @run-at       document-start
// @grant        none
// ==/UserScript==

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
    var DATA = 
  {
    "tree": [
      { "key": "na", "zh": "北美", "en": "North America", "children": [
        { "key": "us", "zh": "美国", "en": "United States" },
        { "key": "cana", "zh": "加拿大", "en": "Canada" }
      ]},
      { "key": "latam", "zh": "拉丁美洲", "en": "Latin America", "children": [
        { "key": "mxca", "zh": "墨西哥与中美洲", "en": "Mexico & Central America" },
        { "key": "carib", "zh": "加勒比", "en": "Caribbean" },
        { "key": "sam", "zh": "南美洲", "en": "South America" }
      ]},
      { "key": "eu", "zh": "欧洲", "en": "Europe", "children": [
        { "key": "uki", "zh": "英国与爱尔兰", "en": "UK & Ireland" },
        { "key": "weu", "zh": "西欧", "en": "Western Europe" },
        { "key": "nordic", "zh": "北欧", "en": "Nordics" },
        { "key": "seu", "zh": "南欧", "en": "Southern Europe" },
        { "key": "ceu", "zh": "中东欧", "en": "Central & Eastern Europe" }
      ]},
      { "key": "asia", "zh": "亚洲", "en": "Asia", "children": [
        { "key": "gc", "zh": "大中华", "en": "Greater China" },
        { "key": "ea", "zh": "东亚其他", "en": "East Asia (other)" },
        { "key": "sea", "zh": "东南亚", "en": "Southeast Asia" },
        { "key": "sas", "zh": "南亚", "en": "South Asia" },
        { "key": "cas", "zh": "中亚", "en": "Central Asia" }
      ]},
      { "key": "mena", "zh": "中东与北非", "en": "Middle East & North Africa", "children": [] },
      { "key": "ssa", "zh": "撒哈拉以南非洲", "en": "Sub-Saharan Africa", "children": [] },
      { "key": "oce", "zh": "大洋洲", "en": "Oceania", "children": [] },
      { "key": "other", "zh": "线上 / 待定 / 未识别", "en": "Virtual / TBD / Unknown", "children": [] }
    ],

    "countries": {
      "usa": "us", "united states": "us", "united states of america": "us", "united state": "us", "us": "us", "u s a": "us",
      "canada": "cana",

      "mexico": "mxca", "guatemala": "mxca", "belize": "mxca", "honduras": "mxca", "el salvador": "mxca",
      "nicaragua": "mxca", "costa rica": "mxca", "panama": "mxca",
      "barbados": "carib", "curacao": "carib", "st kitts": "carib", "saint kitts": "carib", "nevis": "carib",
      "grenada": "carib", "jamaica": "carib", "bahamas": "carib", "trinidad": "carib", "tobago": "carib",
      "puerto rico": "carib", "cuba": "carib", "dominican republic": "carib", "aruba": "carib",
      "martinique": "carib", "guadeloupe": "carib", "cayman islands": "carib", "bermuda": "carib",
      "st lucia": "carib", "saint lucia": "carib", "antigua": "carib", "haiti": "carib",
      "brazil": "sam", "brasil": "sam", "argentina": "sam", "chile": "sam", "colombia": "sam", "peru": "sam",
      "uruguay": "sam", "ecuador": "sam", "bolivia": "sam", "paraguay": "sam", "venezuela": "sam",
      "guyana": "sam", "suriname": "sam",

      "uk": "uki", "u k": "uki", "united kingdom": "uki", "united kindom": "uki", "great britain": "uki",
      "britain": "uki", "england": "uki", "scotland": "uki", "wales": "uki", "northern ireland": "uki",
      "ireland": "uki", "republic of ireland": "uki",
      "france": "weu", "germany": "weu", "deutschland": "weu", "netherlands": "weu", "netherland": "weu",
      "the netherlands": "weu", "holland": "weu", "belgium": "weu", "switzerland": "weu", "austria": "weu",
      "luxembourg": "weu", "monaco": "weu", "liechtenstein": "weu",
      "denmark": "nordic", "sweden": "nordic", "norway": "nordic", "finland": "nordic", "iceland": "nordic",
      "greenland": "nordic", "faroe islands": "nordic",
      "italy": "seu", "italia": "seu", "spain": "seu", "espana": "seu", "portugal": "seu", "greece": "seu",
      "greec": "seu", "hellas": "seu", "cyprus": "seu", "malta": "seu", "san marino": "seu",
      "vatican": "seu", "andorra": "seu", "gibraltar": "seu",
      "poland": "ceu", "polska": "ceu", "czech republic": "ceu", "czechia": "ceu", "slovakia": "ceu",
      "hungary": "ceu", "slovenia": "ceu", "croatia": "ceu", "serbia": "ceu", "bosnia": "ceu",
      "herzegovina": "ceu", "montenegro": "ceu", "north macedonia": "ceu", "macedonia": "ceu",
      "albania": "ceu", "romania": "ceu", "bulgaria": "ceu", "estonia": "ceu", "latvia": "ceu",
      "lithuania": "ceu", "ukraine": "ceu", "belarus": "ceu", "moldova": "ceu", "kosovo": "ceu",
      "russia": "ceu", "russian federation": "ceu",

      "china": "gc", "prc": "gc", "p r china": "gc", "peoples republic of china": "gc",
      "hong kong": "gc", "hongkong": "gc", "macau": "gc", "macao": "gc", "taiwan": "gc",
      "japan": "ea", "nippon": "ea", "korea": "ea", "south korea": "ea", "republic of korea": "ea",
      "s korea": "ea", "north korea": "ea", "mongolia": "ea",
      "singapore": "sea", "malaysia": "sea", "indonesia": "sea", "thailand": "sea", "vietnam": "sea",
      "viet nam": "sea", "philippines": "sea", "cambodia": "sea", "laos": "sea", "myanmar": "sea",
      "burma": "sea", "brunei": "sea", "timor leste": "sea",
      "india": "sas", "bharat": "sas", "pakistan": "sas", "bangladesh": "sas", "sri lanka": "sas",
      "nepal": "sas", "bhutan": "sas", "maldives": "sas", "afghanistan": "sas",
      "kazakhstan": "cas", "uzbekistan": "cas", "kyrgyzstan": "cas", "tajikistan": "cas", "turkmenistan": "cas",

      "israel": "mena", "turkey": "mena", "turkiye": "mena", "uae": "mena", "u a e": "mena",
      "united arab emirates": "mena", "abu dhabi": "mena", "dubai": "mena", "sharjah": "mena",
      "qatar": "mena", "saudi arabia": "mena", "kuwait": "mena", "bahrain": "mena", "oman": "mena",
      "jordan": "mena", "lebanon": "mena", "iran": "mena", "iraq": "mena", "syria": "mena",
      "yemen": "mena", "palestine": "mena", "egypt": "mena", "morocco": "mena", "maroc": "mena",
      "tunisia": "mena", "algeria": "mena", "libya": "mena",

      "south africa": "ssa", "rwanda": "ssa", "kenya": "ssa", "nigeria": "ssa", "ghana": "ssa",
      "ethiopia": "ssa", "tanzania": "ssa", "uganda": "ssa", "senegal": "ssa", "cameroon": "ssa",
      "zimbabwe": "ssa", "zambia": "ssa", "botswana": "ssa", "namibia": "ssa", "mauritius": "ssa",
      "mozambique": "ssa", "ivory coast": "ssa", "cote divoire": "ssa", "angola": "ssa",
      "seychelles": "ssa", "madagascar": "ssa", "benin": "ssa", "mali": "ssa",

      "australia": "oce", "new zealand": "oce", "fiji": "oce", "papua new guinea": "oce",
      "samoa": "oce", "tonga": "oce", "new caledonia": "oce", "vanuatu": "oce"
    },

    "segments": {
      "al": "us", "ak": "us", "az": "us", "ar": "us", "ca": "us", "co": "us", "ct": "us", "dc": "us",
      "de": "us", "fl": "us", "ga": "us", "hi": "us", "ia": "us", "id": "us", "il": "us", "in": "us",
      "ks": "us", "ky": "us", "la": "us", "ma": "us", "md": "us", "me": "us", "mi": "us", "mn": "us",
      "mo": "us", "ms": "us", "mt": "us", "nc": "us", "nd": "us", "ne": "us", "nh": "us", "nj": "us",
      "nm": "us", "nv": "us", "ny": "us", "oh": "us", "ok": "us", "or": "us", "pa": "us", "ri": "us",
      "sc": "us", "sd": "us", "tn": "us", "tx": "us", "ut": "us", "va": "us", "vt": "us", "wa": "us",
      "wi": "us", "wv": "us", "wy": "us",
      "ab": "cana", "bc": "cana", "mb": "cana", "nb": "cana", "ns": "cana", "on": "cana", "pe": "cana",
      "qc": "cana", "sk": "cana",
      "be": "weu", "fr": "weu", "nl": "weu", "at": "weu", "ch": "weu", "lu": "weu",
      "uk": "uki", "gb": "uki", "ie": "uki",
      "it": "seu", "es": "seu", "pt": "seu", "gr": "seu",
      "se": "nordic", "dk": "nordic", "fi": "nordic",
      "cn": "gc", "hk": "gc", "tw": "gc",
      "jp": "ea", "kr": "ea",
      "sg": "sea", "my": "sea", "th": "sea", "vn": "sea", "ph": "sea",
      "au": "oce", "nz": "oce"
    },

    "places": {
      "alabama": "us", "alaska": "us", "arizona": "us", "arkansas": "us", "california": "us",
      "colorado": "us", "connecticut": "us", "delaware": "us", "florida": "us", "georgia": "us",
      "hawaii": "us", "hawai": "us", "idaho": "us", "illinois": "us", "indiana": "us", "iowa": "us",
      "kansas": "us", "kentucky": "us", "louisiana": "us", "maine": "us", "maryland": "us",
      "massachusetts": "us", "michigan": "us", "minnesota": "us", "mississippi": "us", "missouri": "us",
      "montana": "us", "nebraska": "us", "nevada": "us", "new hampshire": "us", "new jersey": "us",
      "new mexico": "us", "new york": "us", "north carolina": "us", "north dakota": "us", "ohio": "us",
      "oklahoma": "us", "oregon": "us", "pennsylvania": "us", "rhode island": "us", "south carolina": "us",
      "south dakota": "us", "tennessee": "us", "texas": "us", "utah": "us", "vermont": "us",
      "virginia": "us", "washington": "us", "west virginia": "us", "wisconsin": "us", "wyoming": "us",
      "district of columbia": "us", "silicon valley": "us",
      "atlanta": "us", "austin": "us", "baltimore": "us", "boston": "us", "chicago": "us",
      "cleveland": "us", "dallas": "us", "denver": "us", "detroit": "us", "honolulu": "us",
      "houston": "us", "las vegas": "us", "los angeles": "us", "menlo park": "us", "miami": "us",
      "minneapolis": "us", "nashville": "us", "new orleans": "us", "orlando": "us", "palo alto": "us",
      "philadelphia": "us", "phoenix": "us", "pittsburgh": "us", "princeton": "us", "raleigh": "us",
      "redmond": "us", "renton": "us", "san diego": "us", "san francisco": "us", "san jose": "us",
      "santa barbara": "us", "santa clara": "us", "santa cruz": "us", "seattle": "us", "stanford": "us",
      "st louis": "us", "salt lake city": "us", "long beach": "us", "waikiki": "us", "big island": "us",
      "berkeley": "us", "pasadena": "us", "cambridge ma": "us", "ann arbor": "us", "boulder": "us",

      "montreal": "cana", "vancouver": "cana", "toronto": "cana", "ottawa": "cana", "calgary": "cana",
      "edmonton": "cana", "halifax": "cana", "winnipeg": "cana", "quebec": "cana", "ontario": "cana",
      "alberta": "cana", "british columbia": "cana", "saskatchewan": "cana", "manitoba": "cana",
      "nova scotia": "cana", "newfoundland": "cana", "niagra falls": "cana", "niagara falls": "cana",

      "london": "uki", "birmingham": "uki", "manchester": "uki", "glasgow": "uki", "edinburgh": "uki",
      "cambridge uk": "uki", "oxford": "uki", "bristol": "uki", "cardiff": "uki", "belfast": "uki",
      "dublin": "uki", "egham": "uki", "canterbury": "uki",

      "paris": "weu", "lyon": "weu", "marseille": "weu", "toulouse": "weu", "grenoble": "weu",
      "nantes": "weu", "bordeaux": "weu", "berlin": "weu", "munich": "weu", "munchen": "weu",
      "hamburg": "weu", "frankfurt": "weu", "cologne": "weu", "stuttgart": "weu", "dresden": "weu",
      "amsterdam": "weu", "rotterdam": "weu", "the hague": "weu", "utrecht": "weu", "eindhoven": "weu",
      "delft": "weu", "leiden": "weu", "brussels": "weu", "leuven": "weu", "ghent": "weu",
      "antwerp": "weu", "bruges": "weu", "zurich": "weu", "geneva": "weu", "lausanne": "weu",
      "basel": "weu", "bern": "weu", "lugano": "weu", "vienna": "weu", "wien": "weu",
      "salzburg": "weu", "graz": "weu", "linz": "weu",

      "copenhagen": "nordic", "aarhus": "nordic", "stockholm": "nordic", "gothenburg": "nordic",
      "malmo": "nordic", "oslo": "nordic", "bergen": "nordic", "trondheim": "nordic",
      "helsinki": "nordic", "espoo": "nordic", "tampere": "nordic", "reykjavik": "nordic",

      "rome": "seu", "roma": "seu", "milan": "seu", "milano": "seu", "turin": "seu", "torino": "seu",
      "florence": "seu", "firenze": "seu", "venice": "seu", "venezia": "seu", "naples": "seu",
      "napoli": "seu", "bologna": "seu", "pisa": "seu", "genoa": "seu", "palermo": "seu",
      "catania": "seu", "sicily": "seu", "sardinia": "seu", "madrid": "seu", "barcelona": "seu",
      "valencia": "seu", "seville": "seu", "sevilla": "seu", "bilbao": "seu", "malaga": "seu",
      "granada": "seu", "zaragoza": "seu", "santiago de compostela": "seu", "san sebastian": "seu",
      "lisbon": "seu", "lisboa": "seu", "porto": "seu", "coimbra": "seu", "madeira": "seu",
      "algarve": "seu", "athens": "seu", "thessaloniki": "seu", "crete": "seu", "rhodes": "seu",
      "chania": "seu", "corfu": "seu", "santorini": "seu", "nicosia": "seu", "limassol": "seu",
      "paphos": "seu", "valletta": "seu",

      "warsaw": "ceu", "warszawa": "ceu", "krakow": "ceu", "wroclaw": "ceu", "poznan": "ceu",
      "gdansk": "ceu", "prague": "ceu", "praha": "ceu", "brno": "ceu", "bratislava": "ceu",
      "budapest": "ceu", "ljubljana": "ceu", "maribor": "ceu", "zagreb": "ceu", "dubrovnik": "ceu",
      "split": "ceu", "belgrade": "ceu", "sarajevo": "ceu", "bucharest": "ceu", "sofia": "ceu",
      "tallinn": "ceu", "tartu": "ceu", "riga": "ceu", "vilnius": "ceu", "kaunas": "ceu",
      "kyiv": "ceu", "kiev": "ceu", "moscow": "ceu", "st petersburg russia": "ceu",

      "beijing": "gc", "shanghai": "gc", "guangzhou": "gc", "shenzhen": "gc", "hangzhou": "gc",
      "nanjing": "gc", "wuhan": "gc", "chengdu": "gc", "chongqing": "gc", "xian": "gc",
      "tianjin": "gc", "harbin": "gc", "shenyang": "gc", "qingdao": "gc", "xiamen": "gc",
      "suzhou": "gc", "hefei": "gc", "changsha": "gc", "kunming": "gc", "guiyang": "gc",
      "zhengzhou": "gc", "fuzhou": "gc", "ningbo": "gc", "zhuhai": "gc", "sanya": "gc",
      "hainan": "gc", "urumqi": "gc", "urumchi": "gc", "taipei": "gc", "hsinchu": "gc",
      "tainan": "gc", "kaohsiung": "gc",

      "tokyo": "ea", "osaka": "ea", "kyoto": "ea", "yokohama": "ea", "nagoya": "ea", "sapporo": "ea",
      "fukuoka": "ea", "kobe": "ea", "hiroshima": "ea", "nara": "ea", "okinawa": "ea",
      "tsukuba": "ea", "kanazawa": "ea", "nagasaki": "ea", "seoul": "ea", "busan": "ea",
      "daegu": "ea", "daejeon": "ea", "incheon": "ea", "gyeongju": "ea", "jeju": "ea",

      "kuala lumpur": "sea", "penang": "sea", "jakarta": "sea", "bali": "sea", "bandung": "sea",
      "bangkok": "sea", "phuket": "sea", "chiang mai": "sea", "hanoi": "sea", "danang": "sea",
      "da nang": "sea", "ho chi minh": "sea", "manila": "sea", "cebu": "sea", "siem reap": "sea",
      "phnom penh": "sea",

      "delhi": "sas", "new delhi": "sas", "mumbai": "sas", "bangalore": "sas", "bengaluru": "sas",
      "hyderabad": "sas", "chennai": "sas", "kolkata": "sas", "pune": "sas", "ahmedabad": "sas",
      "goa": "sas", "jaipur": "sas", "kanpur": "sas", "kharagpur": "sas", "guwahati": "sas",
      "colombo": "sas", "kathmandu": "sas", "dhaka": "sas", "karachi": "sas", "lahore": "sas",
      "islamabad": "sas",

      "tel aviv": "mena", "jerusalem": "mena", "haifa": "mena", "istanbul": "mena", "ankara": "mena",
      "izmir": "mena", "antalya": "mena", "doha": "mena", "riyadh": "mena", "jeddah": "mena",
      "muscat": "mena", "manama": "mena", "amman": "mena", "beirut": "mena", "cairo": "mena",
      "casablanca": "mena", "marrakech": "mena", "marrakesh": "mena", "rabat": "mena", "tunis": "mena",

      "cape town": "ssa", "johannesburg": "ssa", "pretoria": "ssa", "durban": "ssa",
      "stellenbosch": "ssa", "nairobi": "ssa", "kigali": "ssa", "lagos": "ssa", "accra": "ssa",
      "addis ababa": "ssa",

      "sydney": "oce", "melbourne": "oce", "brisbane": "oce", "perth": "oce", "adelaide": "oce",
      "canberra": "oce", "gold coast": "oce", "hobart": "oce", "darwin": "oce", "wollongong": "oce",
      "queensland": "oce", "victoria australia": "oce", "auckland": "oce", "wellington": "oce",
      "christchurch": "oce"
    },

    "virtual": ["virtual", "online", "tbd", "tba", "tbc", "remote"]
  }
  ;

    var VERSION = '1.3.0';
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
