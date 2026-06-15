/* feat-roster.js — Hero Legends Thai
 * SINGLE-PAGE HERO SCREEN (id="heroes") — replaces the grid collection + separate
 * detail screen with ONE landscape page:
 *   ┌─────────────────────────────────────────────┐
 *   │  TOP  = featured hero: big art + stats +     │  ← รายละเอียด + ปุ่ม "อัพ"
 *   │         skills + buttons (อัปเกรด/อุปกรณ์/ทีม) │
 *   ├─────────────────────────────────────────────┤
 *   │  BOTTOM = horizontal scroll strip of heroes  │  ← เรียงแนวนอน เลื่อน/แตะเลือก
 *   └─────────────────────────────────────────────┘
 *
 * Behaviour:
 *   - Tapping a strip card features that hero on top WITHOUT leaving the page.
 *   - window.detail(id) is re-routed here, so every "view hero" entry point
 *     (gacha result, etc.) lands on this single page featuring that hero.
 *   - "⬆ อัปเกรด" still opens the rich #upgrade screen (openUpgrade); its back
 *     button returns here (via the detail() reroute) featuring the same hero.
 *
 * Loads AFTER game.html + game-core.js, in place of feat-collection.js (which
 * stays on disk, just not included). Vanilla JS, idempotent, no build step.
 * All custom CSS prefixed `ros-`; all globals prefixed roster*.
 */
(function () {
  'use strict';
  if (!window.GAME) { console.warn('[roster] GAME not ready'); return; }
  var G = window.GAME;

  var ELEMAP = (typeof window.ELE === 'object' && window.ELE) || {
    Water: 'var(--water)', Fire: 'var(--fire)', Nature: 'var(--nature)',
    Light: 'var(--light)', Dark: 'var(--dark)'
  };
  var ELE_TH = { Water: 'น้ำ', Fire: 'ไฟ', Nature: 'ธรรมชาติ', Light: 'แสง', Dark: 'มืด' };

  // session UI state (not game state)
  var STATE = { featured: null, ele: 'all', ownedOnly: false };

  function heroes() { return (G.heroes && G.heroes()) || window.HEROES || []; }
  function power(h) { return Math.round(h.hp * 0.3 + h.atk * 3 + h.def * 2 + h.spd * 4); }
  function starStr(n) { n = Math.max(0, +n || 0); return '★'.repeat(Math.min(5, n)) + (n > 5 ? '+' : ''); }
  function findHero(id) { return heroes().find(function (x) { return x.id === id; }) || null; }
  function ownData(id) { return (G.state.owned && G.state.owned[id]) || null; }

  // ---------------------------------------------------------------- CSS
  (function injectCSS() {
    if (document.getElementById('ros-style')) return;
    var css = [
      // turn the heroes screen into a top(feat)/bottom(strip) flex column.
      // MUST scope to .on — a bare #heroes (specificity 1,0,0) would beat
      // .screen{display:none} and leave this screen always visible overlaying others.
      '#heroes.on{display:flex;flex-direction:column}',
      // top featured ≈70% · bottom strip ≈30%
      '#heroes .ros-feat{flex:7 1 0;min-height:0;overflow:auto;padding:14px 28px 12px;display:flex;align-items:center;gap:30px}',
      '#heroes .ros-feat .dt-art{flex:none;width:clamp(220px,30%,400px);align-self:center;border-radius:16px;overflow:hidden;border:2px solid var(--line);position:relative}',
      '#heroes .ros-feat .ros-lockmsg{display:inline-flex;align-items:center;font-size:11px;color:var(--muted);font-weight:600;padding:0 4px}',
      '#heroes .ros-feat .dt-art img{width:100%;display:block}',
      '#heroes .ros-feat .dt-art.locked img{filter:grayscale(1) brightness(.45)}',
      '#heroes .ros-feat .dt-art .lockbadge{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;pointer-events:none}',
      '#heroes .ros-feat .dt-art .lockbadge .ic{font-size:34px;filter:drop-shadow(0 2px 4px #000)}',
      '#heroes .ros-feat .dt-art .lockbadge .tx{font-size:11px;font-weight:800;color:#dcdcf0;background:rgba(8,8,14,.72);padding:2px 10px;border-radius:9px;border:1px solid var(--line)}',
      '#heroes .ros-feat .dt-art .ownpill{position:absolute;top:8px;left:8px;font-size:10px;font-weight:800;color:#1c1407;background:linear-gradient(135deg,var(--gold),#d99a2b);padding:2px 9px;border-radius:9px;box-shadow:0 1px 6px rgba(0,0,0,.5)}',
      '#heroes .ros-feat .dt-info{flex:1;min-width:0}',
      '#heroes .ros-feat .dt-info h2{margin:0 0 5px;font-size:clamp(24px,2.6vw,38px);display:flex;align-items:center;gap:11px;flex-wrap:wrap}',
      '#heroes .ros-feat .rbadge{font-size:10px;font-weight:800;padding:2px 9px;border-radius:9px;border:1px solid var(--line)}',
      '#heroes .ros-feat .rbadge.Mythic{color:#e9d5ff;border-color:var(--myth);background:rgba(168,85,247,.16)}',
      '#heroes .ros-feat .rbadge.Legendary{color:#fde68a;border-color:var(--leg);background:rgba(245,158,11,.14)}',
      '#heroes .ros-feat .rbadge.Epic{color:#bfdbfe;border-color:var(--epic);background:rgba(96,165,250,.14)}',
      '#heroes .ros-feat .meta{color:var(--muted);font-size:14px;margin-bottom:14px}',
      '#heroes .ros-feat .statgrid{display:grid;grid-template-columns:1fr 1fr;gap:2px 30px}',
      '#heroes .ros-feat .statrow{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);font-size:15.5px}',
      '#heroes .ros-feat .statrow b{color:var(--gold)}',
      '#heroes .ros-feat .seclab{margin:16px 0 6px;font-weight:800;font-size:15px}',
      '#heroes .ros-feat .skill{display:flex;gap:11px;padding:10px 0;border-bottom:1px solid var(--line)}',
      '#heroes .ros-feat .skill .si{width:40px;height:40px;border-radius:10px;background:#2a2342;display:flex;align-items:center;justify-content:center;font-size:19px;flex:none}',
      '#heroes .ros-feat .skill .sn{font-size:14.5px;font-weight:700}',
      '#heroes .ros-feat .skill .sd{font-size:12px;color:var(--muted)}',
      '#heroes .ros-feat .acts{margin-top:18px;display:flex;gap:10px;flex-wrap:wrap}',
      '#heroes .ros-feat .acts .btn,#heroes .ros-feat .acts .back{font-size:15px;padding:12px 26px}',
      // bottom strip
      '#heroes .ros-strip{flex:3 1 0;min-height:0;display:flex;flex-direction:column;border-top:1px solid var(--line);background:linear-gradient(0deg,rgba(8,8,16,.94),rgba(12,12,22,.74));padding:8px 16px 12px;backdrop-filter:blur(4px)}',
      '#heroes .ros-bar{flex:none;display:flex;align-items:center;gap:8px;overflow-x:auto;padding:2px 0 8px;scrollbar-width:thin}',
      '#heroes .ros-bar .rlab{font-size:10px;color:var(--muted);font-weight:800;letter-spacing:.4px;flex:none;margin-right:2px}',
      '#heroes .ros-chip{flex:none;padding:4px 11px;border-radius:11px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid var(--line);background:#11111d;color:#cfcfe6;display:flex;align-items:center;gap:5px;white-space:nowrap}',
      '#heroes .ros-chip.on{border-color:var(--glow);background:linear-gradient(135deg,rgba(139,92,246,.32),rgba(139,92,246,.12));color:#fff}',
      '#heroes .ros-chip .dot{width:9px;height:9px;border-radius:50%;border:1px solid #fff4}',
      '#heroes .ros-spacer{flex:1 1 auto;min-width:6px}',
      '#heroes .ros-count{flex:none;font-size:11px;color:var(--muted);font-weight:700;white-space:nowrap}',
      '#heroes .ros-count b{color:var(--gold)}',
      '#heroes .ros-track{flex:1 1 auto;min-height:0;display:flex;align-items:stretch;gap:10px;overflow-x:auto;padding:10px 2px 8px;scroll-behavior:smooth;scrollbar-width:thin}',
      '#heroes .ros-card{flex:0 0 auto;height:100%;aspect-ratio:3/4;min-width:96px;border-radius:13px;position:relative;overflow:hidden;cursor:pointer;border:2px solid var(--line);transition:transform .15s,box-shadow .15s,border-color .15s}',
      '#heroes .ros-card img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}',
      '#heroes .ros-card:hover{transform:translateY(-2px)}',
      '#heroes .ros-card.Legendary{border-color:var(--leg)}',
      '#heroes .ros-card.Mythic{border-color:var(--myth)}',
      '#heroes .ros-card.Epic{border-color:var(--epic)}',
      '#heroes .ros-card.active{border-color:var(--gold);box-shadow:0 0 0 2px var(--gold),0 0 16px rgba(245,196,81,.55);transform:translateY(-4px)}',
      '#heroes .ros-card .ele{position:absolute;top:6px;left:6px;width:17px;height:17px;border-radius:50%;border:1px solid #fff6}',
      '#heroes .ros-card .stars{position:absolute;top:6px;right:7px;font-size:10px;color:var(--gold);text-shadow:0 1px 2px #000}',
      '#heroes .ros-card .lv{position:absolute;top:26px;left:6px;font-size:10px;font-weight:800;color:#1c1407;background:linear-gradient(135deg,var(--gold),#d99a2b);padding:1px 6px;border-radius:7px}',
      '#heroes .ros-card .nm{position:absolute;left:0;right:0;bottom:0;padding:16px 5px 5px;font-size:12px;font-weight:700;text-align:center;color:#fff;background:linear-gradient(0deg,rgba(0,0,0,.85),transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#heroes .ros-card.locked img{filter:grayscale(1) brightness(.52)}',
      '#heroes .ros-card .lk{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:28px;pointer-events:none;filter:drop-shadow(0 1px 3px #000)}',
      '#heroes .ros-empty{flex:1;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px;padding:10px}'
    ].join('');
    var s = document.createElement('style');
    s.id = 'ros-style';
    s.textContent = css;
    document.head.appendChild(s);
  })();

  // ---------------------------------------------------------------- mount
  function mount() {
    var sec = document.getElementById('heroes');
    if (!sec) return false;
    if (document.getElementById('rosterFeatured')) return true; // already mounted
    sec.innerHTML =
      '<div class="topbar">' +
        '<div class="back glass" onclick="go(\'hub\')">‹ กลับ</div>' +
        '<div class="h2" style="margin:0 0 0 10px">ฮีโร่ <span class="sub">Hero Collection · <span id="rosCount">' + heroes().length + '</span> ตัว</span></div>' +
      '</div>' +
      '<div id="rosterFeatured" class="ros-feat"></div>' +
      '<div class="ros-strip">' +
        '<div class="ros-bar" id="rosBar"></div>' +
        '<div class="ros-track" id="rosTrack"></div>' +
      '</div>';
    return true;
  }

  // ---------------------------------------------------------------- featured (top)
  function renderFeatured(id) {
    var host = document.getElementById('rosterFeatured');
    if (!host) return;
    var h = findHero(id) || heroes()[0];
    if (!h) { host.innerHTML = '<div class="ros-empty">ยังไม่มีฮีโร่</div>'; return; }
    STATE.featured = h.id;

    var od = ownData(h.id);
    var owned = !!od;
    var lv = owned && od.level ? od.level : null;
    var star = owned && od.star ? od.star : h.star;
    var aw = owned && od.awaken ? od.awaken : 0;

    // base stats + optional potential bonus (other module exposes it)
    var pb = (typeof window.potentialBonus === 'function') ? window.potentialBonus(h.id) : null;
    function stat(base, key) {
      var add = pb && pb[key] ? Math.round(pb[key]) : 0;
      return add ? (base + add) + ' <span style="color:var(--glow);font-size:11px">+' + add + '</span>' : '' + base;
    }

    var artCls = owned ? 'dt-art' : 'dt-art locked';
    var lockBadge = owned
      ? '<span class="ownpill">Lv.' + (lv || 1) + (aw ? ' · A' + aw : '') + '</span>'
      : '<span class="lockbadge"><span class="ic">🔒</span><span class="tx">ยังไม่มี</span></span>';

    var skills = (h.skills || []).map(function (s) {
      return '<div class="skill"><div class="si">' + (s[0] || '✦') + '</div>' +
        '<div><div class="sn">' + (s[1] || 'สกิล') + '</div><div class="sd">' + (s[2] || '') + '</div></div></div>';
    }).join('');

    var acts = owned
      ? '<button class="btn" onclick="rosterUpgrade(\'' + h.id + '\')">⬆ อัปเกรด</button>' +
        '<button class="back glass" onclick="openEquip(\'' + h.id + '\')">🛡️ อุปกรณ์</button>' +
        '<button class="back glass" onclick="go(\'stages\')">นำเข้าทีม ▶</button>'
      : '<button class="btn" onclick="go(\'summon\')">✦ ไปอัญเชิญ</button>' +
        '<span class="ros-lockmsg">🔒 ยังไม่มีฮีโร่นี้ — อัญเชิญเพื่อปลดล็อก</span>';

    host.innerHTML =
      '<div class="' + artCls + '"><img src="portraits/' + h.id + '.jpg" alt="">' + lockBadge + '</div>' +
      '<div class="dt-info">' +
        '<h2>' + h.th + '<span class="rbadge ' + h.r + '">' + h.r + '</span></h2>' +
        '<div class="meta"><span style="color:' + (ELEMAP[h.e] || 'var(--muted)') + '">●</span> ' +
          (ELE_TH[h.e] || h.e) + ' · ' + h.c + ' · ' + starStr(star) +
          (lv ? ' · เลเวล ' + lv : '') + ' · ⚔️ พลัง ' + power(h).toLocaleString() + '</div>' +
        '<div class="statgrid">' +
          '<div class="statrow"><span>❤️ HP</span><b>' + stat(h.hp, 'hp') + '</b></div>' +
          '<div class="statrow"><span>⚔️ ATK</span><b>' + stat(h.atk, 'atk') + '</b></div>' +
          '<div class="statrow"><span>🛡️ DEF</span><b>' + stat(h.def, 'def') + '</b></div>' +
          '<div class="statrow"><span>⚡ SPD</span><b>' + stat(h.spd, 'spd') + '</b></div>' +
        '</div>' +
        '<div class="seclab">สกิล</div>' + skills +
        '<div class="acts">' + acts + '</div>' +
      '</div>';
  }

  // ---------------------------------------------------------------- strip (bottom)
  function filteredList() {
    var list = heroes().filter(function (h) {
      if (STATE.ele !== 'all' && h.e !== STATE.ele) return false;
      if (STATE.ownedOnly && !G.isOwned(h.id)) return false;
      return true;
    });
    // owned first, then by power
    list.sort(function (a, b) {
      var oa = G.isOwned(a.id) ? 0 : 1, ob = G.isOwned(b.id) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return power(b) - power(a);
    });
    return list;
  }

  function chip(kind, val, label, on, dotColor) {
    var dot = dotColor ? '<span class="dot" style="background:' + dotColor + '"></span>' : '';
    return '<div class="ros-chip' + (on ? ' on' : '') + '" onclick="rosterFilter(\'' + kind + '\',\'' + val + '\')">' + dot + label + '</div>';
  }

  function renderStrip() {
    var bar = document.getElementById('rosBar');
    var track = document.getElementById('rosTrack');
    if (!bar || !track) return;

    var eleOrder = ['Water', 'Fire', 'Nature', 'Light', 'Dark'];
    var chips = '<span class="rlab">ธาตุ</span>' + chip('ele', 'all', 'ทั้งหมด', STATE.ele === 'all', '');
    eleOrder.forEach(function (e) { chips += chip('ele', e, ELE_TH[e], STATE.ele === e, ELEMAP[e]); });
    chips += '<span class="ros-spacer"></span>' +
      '<div class="ros-chip' + (STATE.ownedOnly ? ' on' : '') + '" onclick="rosterFilter(\'owned\',\'toggle\')">👑 เฉพาะที่มี</div>';

    var list = filteredList();
    var totalOwned = heroes().filter(function (h) { return G.isOwned(h.id); }).length;
    chips += '<span class="ros-count">มี <b>' + totalOwned + '</b>/' + heroes().length + '</span>';
    bar.innerHTML = chips;

    if (!list.length) { track.innerHTML = '<div class="ros-empty">ไม่พบฮีโร่ตามตัวกรอง</div>'; return; }
    track.innerHTML = list.map(function (h) {
      var owned = G.isOwned(h.id);
      var od = ownData(h.id);
      var lv = owned && od && od.level ? '<span class="lv">Lv.' + od.level + '</span>' : '';
      var star = owned && od && od.star ? od.star : h.star;
      var active = (h.id === STATE.featured) ? ' active' : '';
      var lock = owned ? '' : '<span class="lk">🔒</span>';
      return '<div class="ros-card ' + h.r + (owned ? '' : ' locked') + active + '" data-id="' + h.id + '" onclick="rosterSelect(\'' + h.id + '\')">' +
        '<img src="portraits/' + h.id + '.jpg" alt="">' +
        '<span class="ele" style="background:' + (ELEMAP[h.e] || 'var(--muted)') + '"></span>' +
        '<span class="stars">' + starStr(star) + '</span>' + lv + lock +
        '<span class="nm">' + h.th + '</span>' +
      '</div>';
    }).join('');
  }

  function scrollActiveIntoView() {
    var track = document.getElementById('rosTrack');
    if (!track) return;
    var el = track.querySelector('.ros-card.active');
    if (el && el.scrollIntoView) { try { el.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) {} }
  }

  // ---------------------------------------------------------------- public API
  window.rosterSelect = function (id) {
    if (!mount()) return;
    STATE.featured = id;
    renderFeatured(id);
    // update active class cheaply without rebuilding the whole track
    var track = document.getElementById('rosTrack');
    if (track) {
      track.querySelectorAll('.ros-card').forEach(function (c) {
        c.classList.toggle('active', c.getAttribute('data-id') === id);
      });
    }
    scrollActiveIntoView();
  };

  window.rosterFilter = function (kind, val) {
    if (kind === 'owned') STATE.ownedOnly = !STATE.ownedOnly;
    else STATE.ele = (STATE.ele === val && val !== 'all') ? 'all' : val;
    // if the featured hero was filtered out of the strip, feature the first visible one
    var list = filteredList();
    if (list.length && !list.some(function (h) { return h.id === STATE.featured; })) {
      STATE.featured = list[0].id;
    }
    renderStrip();
    window.rosterSelect(STATE.featured);
  };

  // upgrade entry — opens the rich #upgrade screen; its back returns here
  window.rosterUpgrade = function (id) {
    if (typeof window.openUpgrade === 'function') window.openUpgrade(id);
    else G.toast('อัปเกรดยังไม่พร้อม');
  };

  // the override the shell + GAME.rerender('heroes') call
  function renderHeroes() {
    if (!mount()) return;
    if (!STATE.featured || !findHero(STATE.featured)) {
      // default: first owned hero, else first hero
      var firstOwned = heroes().filter(function (h) { return G.isOwned(h.id); })[0];
      STATE.featured = (firstOwned || heroes()[0] || {}).id || null;
    }
    renderStrip();
    renderFeatured(STATE.featured);
    scrollActiveIntoView();
  }
  window.renderHeroes = renderHeroes;

  // re-route every "view hero" to this single page
  window.detail = function (id) {
    if (!document.getElementById('heroes')) return;
    window.go('heroes');
    window.rosterSelect(id);
  };

  // hook go() so navigating to 'heroes' always (re)renders
  if (!window.__rosGoHooked && typeof window.go === 'function') {
    var _go = window.go;
    window.go = function (id) {
      var r = _go.apply(this, arguments);
      if (id === 'heroes') { try { renderHeroes(); } catch (e) {} }
      return r;
    };
    window.__rosGoHooked = true;
  }

  // prime now (idempotent)
  try { renderHeroes(); } catch (e) {}
})();
