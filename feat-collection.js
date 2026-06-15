/* feat-collection.js — Hero Collection screen upgrade (id="heroes")
 * Overrides window.renderHeroes. Adds a filter/sort bar (.coltab .tb):
 *   - filter by Element (Water/Fire/Nature/Light/Dark)
 *   - filter by Rarity (Legendary/Mythic/Epic)
 *   - sort by Power / Rarity / Element
 * Shows OWNED (level/star from GAME.state.owned) vs NOT-OWNED (locked/greyed 🔒 "ยังไม่มี").
 * Every card still → detail(id). Reuses .grid/.hcard. All custom CSS prefixed `coll-`.
 * Loads AFTER game.html + game-core.js. Idempotent.
 */
(function () {
  'use strict';
  if (!window.GAME) return; // hard dependency on the shared runtime

  // ---- local UI state (persists for the session only; not game state) ----
  var FILTER = { ele: 'all', rarity: 'all', sort: 'power' };

  // mirror of the shell's element color map (read-only, theme tokens)
  var ELEMAP = (typeof window.ELE === 'object' && window.ELE) || {
    Water: 'var(--water)', Fire: 'var(--fire)', Nature: 'var(--nature)',
    Light: 'var(--light)', Dark: 'var(--dark)'
  };
  var RARITY_RANK = { Mythic: 3, Legendary: 2, Epic: 1 };
  var ELE_RANK = { Water: 1, Fire: 2, Nature: 3, Light: 4, Dark: 5 };
  var ELE_TH = { Water: 'น้ำ', Fire: 'ไฟ', Nature: 'ธรรมชาติ', Light: 'แสง', Dark: 'มืด' };

  function power(h) {
    return Math.round(h.hp * 0.3 + h.atk * 3 + h.def * 2 + h.spd * 4);
  }

  // ---------- inject scoped CSS (prefixed coll-) ----------
  (function injectCSS() {
    if (document.getElementById('coll-style')) return;
    var css = ''
      + '#heroes .coll-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin:2px 0 12px}'
      + '#heroes .coll-grp{display:flex;align-items:center;gap:6px;flex-wrap:wrap}'
      + '#heroes .coll-lab{font-size:10px;color:var(--muted);font-weight:700;letter-spacing:.5px}'
      + '#heroes .coll-bar .coltab{margin:0}'
      + '#heroes .coll-bar .tb{padding:5px 11px;font-size:11px;display:flex;align-items:center;gap:5px}'
      + '#heroes .coll-dot{width:9px;height:9px;border-radius:50%;display:inline-block;border:1px solid #fff4}'
      + '#heroes .coll-spacer{flex:1 1 auto;min-width:8px}'
      + '#heroes .coll-count{font-size:11px;color:var(--muted);font-weight:700;white-space:nowrap}'
      + '#heroes .coll-count b{color:var(--gold)}'
      // owned/locked card treatment (layered on .hcard, never replacing it)
      + '#heroes .hcard.coll-locked img{filter:grayscale(1) brightness(.42);opacity:.9}'
      + '#heroes .hcard.coll-locked{border-color:#2a2a3e !important;box-shadow:none !important;opacity:.96}'
      + '#heroes .hcard.coll-locked:hover{transform:translateY(-3px) scale(1.02)}'
      + '#heroes .coll-lock{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;'
        + 'align-items:center;justify-content:center;gap:3px;pointer-events:none;z-index:2}'
      + '#heroes .coll-lock .ic{font-size:24px;filter:drop-shadow(0 1px 3px #000)}'
      + '#heroes .coll-lock .tx{font-size:9px;font-weight:800;color:#cfcfe6;background:rgba(8,8,14,.66);'
        + 'padding:1px 7px;border-radius:8px;border:1px solid var(--line)}'
      // owned level pill (top-left, under element dot)
      + '#heroes .coll-lv{position:absolute;top:5px;left:24px;z-index:3;font-size:8.5px;font-weight:800;'
        + 'color:var(--ink);background:linear-gradient(135deg,var(--glow),var(--glow2));'
        + 'padding:1px 6px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.5)}'
      // owned glow accent
      + '#heroes .hcard.coll-owned::after{content:"";position:absolute;inset:0;border-radius:10px;pointer-events:none;'
        + 'box-shadow:inset 0 -22px 26px -18px var(--glow)}'
      + '#heroes .coll-empty{padding:34px 10px;text-align:center;color:var(--muted);font-size:13px}'
      + '#heroes .coll-empty .ic{font-size:30px;display:block;margin-bottom:8px;opacity:.7}'
      + '#heroes .coll-reset{cursor:pointer;color:var(--glow);font-weight:700;text-decoration:underline}';
    var s = document.createElement('style');
    s.id = 'coll-style';
    s.textContent = css;
    document.head.appendChild(s);
  })();

  // expose handlers globally (prefixed) so inline onclick can reach them
  window.collSetFilter = function (kind, val) {
    FILTER[kind] = (FILTER[kind] === val && val !== 'all' && kind !== 'sort') ? 'all' : val;
    if (kind === 'sort') FILTER.sort = val;
    renderHeroes();
  };
  window.collReset = function () {
    FILTER = { ele: 'all', rarity: 'all', sort: 'power' };
    renderHeroes();
  };

  function tb(kind, val, label, on, dotColor) {
    var cls = 'tb' + (on ? ' on' : '');
    var dot = dotColor ? '<span class="coll-dot" style="background:' + dotColor + '"></span>' : '';
    return '<div class="' + cls + '" onclick="collSetFilter(\'' + kind + '\',\'' + val + '\')">' + dot + label + '</div>';
  }

  function buildBar(total, shownOwned, shownTotal) {
    var eleOrder = ['Water', 'Fire', 'Nature', 'Light', 'Dark'];
    var eleTabs = tb('ele', 'all', 'ทั้งหมด', FILTER.ele === 'all', '');
    eleOrder.forEach(function (e) {
      eleTabs += tb('ele', e, ELE_TH[e] || e, FILTER.ele === e, ELEMAP[e]);
    });

    var rarTabs = tb('rarity', 'all', 'ทั้งหมด', FILTER.rarity === 'all', '');
    [['Mythic', 'var(--myth)'], ['Legendary', 'var(--leg)'], ['Epic', 'var(--epic)']].forEach(function (r) {
      rarTabs += tb('rarity', r[0], r[0], FILTER.rarity === r[0], r[1]);
    });

    var sortTabs = ''
      + tb('sort', 'power', '⚔️ พลัง', FILTER.sort === 'power', '')
      + tb('sort', 'rarity', '✦ ระดับ', FILTER.sort === 'rarity', '')
      + tb('sort', 'element', '◈ ธาตุ', FILTER.sort === 'element', '');

    var active = FILTER.ele !== 'all' || FILTER.rarity !== 'all' || FILTER.sort !== 'power';
    var reset = active ? ' · <span class="coll-reset" onclick="collReset()">ล้างตัวกรอง</span>' : '';

    return ''
      + '<div class="coll-bar">'
      +   '<div class="coll-grp"><span class="coll-lab">ธาตุ</span><div class="coltab">' + eleTabs + '</div></div>'
      +   '<div class="coll-grp"><span class="coll-lab">ระดับ</span><div class="coltab">' + rarTabs + '</div></div>'
      +   '<div class="coll-grp"><span class="coll-lab">เรียง</span><div class="coltab">' + sortTabs + '</div></div>'
      +   '<span class="coll-spacer"></span>'
      +   '<span class="coll-count">มี <b>' + shownOwned + '</b>/' + shownTotal + ' · รวม ' + total + reset + '</span>'
      + '</div>';
  }

  function starStr(star) {
    var n = Math.max(0, +star || 0);
    return '★'.repeat(Math.min(5, n)) + (n > 5 ? '+' : '');
  }

  function cardHTML(h) {
    var owned = GAME.isOwned(h.id);
    var ownData = (GAME.state.owned && GAME.state.owned[h.id]) || null;
    var ele = ELEMAP[h.e] || 'var(--muted)';

    if (owned) {
      var lv = (ownData && ownData.level) ? ownData.level : 1;
      var star = (ownData && ownData.star) ? ownData.star : (h.star || 3);
      return ''
        + '<div class="hcard ' + h.r + ' coll-owned" onclick="detail(\'' + h.id + '\')">'
        +   '<img src="portraits/' + h.id + '.jpg" alt="">'
        +   '<span class="ele" style="background:' + ele + '"></span>'
        +   '<span class="coll-lv">Lv.' + lv + '</span>'
        +   '<span class="stars">' + starStr(star) + '</span>'
        +   '<div class="info">' + h.th + '<div class="cls">' + h.r + ' · ' + h.c + '</div></div>'
        + '</div>';
    }

    // not owned → locked / greyed, still clickable to preview
    return ''
      + '<div class="hcard ' + h.r + ' coll-locked" onclick="detail(\'' + h.id + '\')">'
      +   '<img src="portraits/' + h.id + '.jpg" alt="">'
      +   '<span class="ele" style="background:' + ele + '"></span>'
      +   '<span class="stars">' + starStr(h.star) + '</span>'
      +   '<div class="coll-lock"><span class="ic">🔒</span><span class="tx">ยังไม่มี</span></div>'
      +   '<div class="info">' + h.th + '<div class="cls">' + h.r + ' · ' + h.c + '</div></div>'
      + '</div>';
  }

  function applyFilterSort(list) {
    var out = list.filter(function (h) {
      if (FILTER.ele !== 'all' && h.e !== FILTER.ele) return false;
      if (FILTER.rarity !== 'all' && h.r !== FILTER.rarity) return false;
      return true;
    });
    out.sort(function (a, b) {
      // owned first within every sort, so the player sees their roster up top
      var oa = GAME.isOwned(a.id) ? 0 : 1, ob = GAME.isOwned(b.id) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      if (FILTER.sort === 'power') return power(b) - power(a);
      if (FILTER.sort === 'rarity') {
        var rr = (RARITY_RANK[b.r] || 0) - (RARITY_RANK[a.r] || 0);
        if (rr) return rr;
        return power(b) - power(a);
      }
      if (FILTER.sort === 'element') {
        var er = (ELE_RANK[a.e] || 99) - (ELE_RANK[b.e] || 99);
        if (er) return er;
        return power(b) - power(a);
      }
      return 0;
    });
    return out;
  }

  // ---------- the override the shell calls ----------
  function renderHeroes() {
    var section = document.getElementById('heroes');
    if (!section) return;
    var grid = document.getElementById('heroGrid');
    if (!grid) return;

    var all = (GAME.heroes && GAME.heroes()) || window.HEROES || [];
    var totalOwned = all.filter(function (h) { return GAME.isOwned(h.id); }).length;

    // ensure the filter bar exists exactly once, right above the grid, inside .body
    var body = grid.parentNode;
    var bar = document.getElementById('coll-bar-host');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'coll-bar-host';
      body.insertBefore(bar, grid);
    }

    var shown = applyFilterSort(all);
    var shownOwned = shown.filter(function (h) { return GAME.isOwned(h.id); }).length;

    bar.innerHTML = buildBar(all.length, totalOwned, shown.length);

    if (!shown.length) {
      grid.innerHTML = ''
        + '<div class="coll-empty" style="grid-column:1/-1">'
        +   '<span class="ic">🫧</span>ไม่พบฮีโร่ตามตัวกรองนี้<br>'
        +   '<span class="coll-reset" onclick="collReset()">ล้างตัวกรอง</span>'
        + '</div>';
      return;
    }
    grid.innerHTML = shown.map(cardHTML).join('');
  }

  // expose as the global the shell + GAME.rerender('heroes') already call
  window.renderHeroes = renderHeroes;

  // hook go() so navigating to 'heroes' always re-renders (idempotent wrap)
  if (!window.__collGoHooked && typeof window.go === 'function') {
    var _go = window.go;
    window.go = function (id) {
      var r = _go.apply(this, arguments);
      if (id === 'heroes') { try { renderHeroes(); } catch (e) {} }
      return r;
    };
    window.__collGoHooked = true;
  }

  // if the heroes screen is already on screen, re-render now
  try {
    var sec = document.getElementById('heroes');
    if (sec && sec.classList.contains('on')) renderHeroes();
    else renderHeroes(); // safe to prime the grid regardless; idempotent
  } catch (e) {}
})();
