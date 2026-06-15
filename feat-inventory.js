/* feat-inventory.js — INVENTORY screen for Hero Legends Thai
 * Loads AFTER game.html + game-core.js. Touches ONLY the inventory screen.
 * - Injects <section class="screen" id="inventory"> into #stage
 * - Adds a 📦 .sbtn to the hub .side stack -> go('inventory')
 * - Defines window.renderInventory() (the shell's rerender map already calls this)
 * Tabs: เศษฮีโร่ (shards) · วัสดุ (mats) · อุปกรณ์ (equip)
 * Uses window.GAME for all state/persistence/toasts. Idempotent.
 */
(function () {
  'use strict';
  if (!window.GAME) { return; } // game-core not ready; nothing to enhance

  var G = window.GAME;

  // ---------- one-time CSS (prefixed: inv-) ----------
  if (!document.getElementById('inv-style')) {
    var st = document.createElement('style');
    st.id = 'inv-style';
    st.textContent = [
      '#inventory .inv-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}',
      '.inv-cell{position:relative;border-radius:13px;padding:13px 8px 11px;text-align:center;cursor:pointer;',
      '  background:var(--panel2);border:1px solid var(--line);transition:transform .12s,box-shadow .12s}',
      '.inv-cell:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(139,92,246,.30)}',
      '.inv-cell .inv-ic{font-size:30px;line-height:1}',
      '.inv-cell .inv-art{width:46px;height:46px;margin:0 auto;border-radius:11px;object-fit:cover;object-position:top center;',
      '  border:2px solid var(--line);display:block}',
      '.inv-cell.Legendary{border-color:var(--leg);box-shadow:0 0 12px rgba(245,158,11,.28)}',
      '.inv-cell.Mythic{border-color:var(--myth);box-shadow:0 0 12px rgba(168,85,247,.32)}',
      '.inv-cell.Epic{border-color:var(--epic)}',
      '.inv-cell .inv-nm{font-size:11px;font-weight:700;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.inv-cell .inv-sub{font-size:9px;color:var(--muted);margin-top:1px}',
      '.inv-cell .inv-qty{position:absolute;top:5px;right:6px;min-width:20px;padding:1px 6px;border-radius:9px;',
      '  font-size:11px;font-weight:800;color:#3a2600;background:linear-gradient(135deg,var(--gold),#d99a2b)}',
      '.inv-cell .inv-ele{position:absolute;top:6px;left:6px;width:13px;height:13px;border-radius:50%;border:1px solid #fff6}',
      '.inv-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;',
      '  padding:42px 14px;color:var(--muted);text-align:center}',
      '.inv-empty .inv-eic{font-size:40px;opacity:.55}',
      '.inv-empty .inv-et{font-size:13px;font-weight:700;color:var(--ink)}',
      '.inv-empty .inv-es{font-size:11px}',
      '.inv-sum{font-size:11px;color:var(--muted);margin:0 0 10px;font-weight:600}',
      '.inv-sum b{color:var(--gold)}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ---------- ensure inventory shape exists on state ----------
  var inv = G.state.inventory || (G.state.inventory = {});
  if (!inv.shard || typeof inv.shard !== 'object') inv.shard = {};
  if (!Array.isArray(inv.equip)) inv.equip = [];
  if (!inv.mats || typeof inv.mats !== 'object') inv.mats = {};

  // Seed a little demo content ONCE so the screen isn't blank on first open.
  if (!inv.__seeded) {
    if (Object.keys(inv.shard).length === 0) {
      inv.shard = { hero_nang_laweng: 28, hero_phisuea_samut: 60, hero_usaren: 45, hero_suwanmali: 12 };
    }
    if (Object.keys(inv.mats).length === 0) {
      inv.mats = { stone: 20, dust: 50 };
    }
    // top up some thematic mats without clobbering existing
    var seedMats = { essence: 8, scale: 14, pearl: 6, ember: 22, moonlight: 4 };
    for (var mk in seedMats) if (inv.mats[mk] == null) inv.mats[mk] = seedMats[mk];
    if (inv.equip.length === 0) {
      inv.equip = [
        { slot: 'weapon', name: 'กระบี่คลื่นสมุทร', r: 'Legendary', stat: '+ATK 12%', set: 'ผู้พิทักษ์สมุทร', qty: 1 },
        { slot: 'armor', name: 'เกราะเกล็ดนิล', r: 'Mythic', stat: '+DEF 15%', set: 'มังกรนิล', qty: 1 },
        { slot: 'boots', name: 'รองเท้าวายุ', r: 'Epic', stat: '+SPD 10%', set: 'สายลม', qty: 2 },
        { slot: 'ring', name: 'แหวนสุริยา', r: 'Epic', stat: '+CRIT 8%', set: 'อรุณ', qty: 1 },
        { slot: 'amulet', name: 'สร้อยจันทรา', r: 'Legendary', stat: '+HP 14%', set: 'จันทรา', qty: 1 }
      ];
    }
    inv.__seeded = true;
    G.save();
  }

  // metadata for materials (icon + thai label + sub)
  var MAT_META = {
    stone:     ['🪨', 'หินเสริมพลัง', 'อัปเกรดอุปกรณ์'],
    dust:      ['✨', 'ผงดารา', 'รีโรลค่าสเตตัส'],
    essence:   ['🔮', 'แก่นวิญญาณ', 'ตื่นรู้ฮีโร่'],
    scale:     ['🐲', 'เกล็ดมังกร', 'ติดดาว Guardian'],
    pearl:     ['🦪', 'ไข่มุกสมุทร', 'อัปเกรดสกิล'],
    ember:     ['🔥', 'ถ่านเพลิงลังกา', 'หลอมอาวุธไฟ'],
    moonlight: ['🌙', 'น้ำค้างจันทรา', 'ตื่นรู้ Light']
  };
  var EQ_ICON = { weapon: '⚔️', armor: '🥋', helm: '⛑️', boots: '👢', glove: '🧤', amulet: '📿', ring: '💍', set: '🔯' };
  var EQ_LABEL = { weapon: 'อาวุธ', armor: 'เกราะ', helm: 'หมวก', boots: 'รองเท้า', glove: 'ถุงมือ', amulet: 'สร้อย', ring: 'แหวน', set: 'เซ็ต' };

  // remember active tab across re-renders
  if (!window.__invTab) window.__invTab = 'shard';

  window.invTab = function (el, tab) {
    window.__invTab = tab;
    var screen = document.getElementById('inventory');
    if (screen) {
      screen.querySelectorAll('.coltab .tb').forEach(function (x) { x.classList.remove('on'); });
      if (el) el.classList.add('on');
    }
    renderInvBody();
  };

  function ELE(e) {
    var m = { Water: 'var(--water)', Fire: 'var(--fire)', Nature: 'var(--nature)', Light: 'var(--light)', Dark: 'var(--dark)' };
    return m[e] || 'var(--muted)';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }

  function emptyBlock(icon, title, sub) {
    return '<div class="inv-empty"><div class="inv-eic">' + icon + '</div>' +
      '<div class="inv-et">' + esc(title) + '</div><div class="inv-es">' + esc(sub) + '</div></div>';
  }

  // ---------- tab body renderers ----------
  function renderShards() {
    var shard = G.state.inventory.shard || {};
    var ids = Object.keys(shard).filter(function (id) { return shard[id] > 0; });
    var heroes = (G.heroes && G.heroes()) || [];
    var byId = {};
    heroes.forEach(function (h) { byId[h.id] = h; });
    var total = ids.reduce(function (s, id) { return s + (shard[id] || 0); }, 0);

    if (!ids.length) {
      return emptyBlock('🧩', 'ยังไม่มีเศษฮีโร่', 'ฟาร์มด่าน Elite หรือแลกจากร้านสังเวียนเพื่อสะสมเศษฮีโร่');
    }
    var cells = ids.map(function (id) {
      var h = byId[id] || { th: id, r: '', e: '', star: 3 };
      var need = (h.star && h.star >= 6) ? 100 : 60;
      var ready = (shard[id] || 0) >= need;
      var portrait = 'portraits/' + id + '.jpg';
      return '<div class="inv-cell ' + esc(h.r) + '" title="' + esc(h.th) + '" ' +
        'onclick="invShardClick(\'' + esc(id) + '\')">' +
        '<span class="inv-qty">' + (shard[id] || 0) + '</span>' +
        (h.e ? '<span class="inv-ele" style="background:' + ELE(h.e) + '"></span>' : '') +
        '<img class="inv-art" src="' + portrait + '" alt="" onerror="this.style.display=\'none\'">' +
        '<div class="inv-nm">' + esc(h.th) + '</div>' +
        '<div class="inv-sub">' + (ready ? '<span style="color:var(--gold)">พร้อมปลดล็อก</span>' : (shard[id] + '/' + need)) + '</div>' +
        '</div>';
    }).join('');
    return '<div class="inv-sum">รวม <b>' + ids.length + '</b> ชนิด · <b>' + total + '</b> เศษ — แตะเพื่อดูเงื่อนไขปลดล็อก/ติดดาว</div>' +
      '<div class="inv-grid">' + cells + '</div>';
  }

  function renderMats() {
    var mats = G.state.inventory.mats || {};
    var keys = Object.keys(mats).filter(function (k) { return mats[k] > 0; });
    if (!keys.length) {
      return emptyBlock('🧪', 'ยังไม่มีวัสดุ', 'รับวัสดุจากดันเจียนรายวันและด่านผจญภัยเพื่อใช้อัปเกรด');
    }
    var totalKinds = keys.length;
    var cells = keys.map(function (k) {
      var meta = MAT_META[k] || ['📦', k, ''];
      return '<div class="inv-cell" title="' + esc(meta[1]) + '" ' +
        'onclick="invMatClick(\'' + esc(k) + '\')">' +
        '<span class="inv-qty">' + (mats[k] || 0) + '</span>' +
        '<div class="inv-ic">' + meta[0] + '</div>' +
        '<div class="inv-nm">' + esc(meta[1]) + '</div>' +
        '<div class="inv-sub">' + esc(meta[2]) + '</div>' +
        '</div>';
    }).join('');
    return '<div class="inv-sum">วัสดุ <b>' + totalKinds + '</b> ชนิด — ใช้สำหรับเลเวลอัป ติดดาว และตื่นรู้</div>' +
      '<div class="inv-grid">' + cells + '</div>';
  }

  function renderEquip() {
    var equip = G.state.inventory.equip || [];
    if (!equip.length) {
      return emptyBlock('🛡️', 'คลังอุปกรณ์ว่างเปล่า', 'พิชิตด่านบอสและกิลด์เพื่อรับอุปกรณ์และเซ็ตโบนัส');
    }
    var cells = equip.map(function (it, i) {
      var ic = EQ_ICON[it.slot] || '🎽';
      var lbl = EQ_LABEL[it.slot] || (it.slot || '');
      var r = it.r || '';
      return '<div class="inv-cell ' + esc(r) + '" title="' + esc(it.name || lbl) + '" ' +
        'onclick="invEquipClick(' + i + ')">' +
        (it.qty && it.qty > 1 ? '<span class="inv-qty">×' + it.qty + '</span>' : '') +
        '<div class="inv-ic">' + ic + '</div>' +
        '<div class="inv-nm">' + esc(it.name || lbl) + '</div>' +
        '<div class="inv-sub">' + esc(lbl) + (it.stat ? ' · ' + esc(it.stat) : '') + '</div>' +
        '</div>';
    }).join('');
    return '<div class="inv-sum">อุปกรณ์ในคลัง <b>' + equip.length + '</b> ชิ้น — แตะเพื่อสวมหรืออัปเกรด</div>' +
      '<div class="inv-grid">' + cells + '</div>';
  }

  function renderInvBody() {
    var body = document.getElementById('inv-body');
    if (!body) return;
    var tab = window.__invTab;
    if (tab === 'mats') body.innerHTML = renderMats();
    else if (tab === 'equip') body.innerHTML = renderEquip();
    else body.innerHTML = renderShards();
  }

  // ---------- click handlers (demo, on-theme toasts) ----------
  window.invShardClick = function (id) {
    var shard = G.state.inventory.shard || {};
    var h = ((G.heroes && G.heroes()) || []).find(function (x) { return x.id === id; }) || { th: id, star: 3 };
    var need = (h.star && h.star >= 6) ? 100 : 60;
    var have = shard[id] || 0;
    if (have >= need) {
      if (G.isOwned && G.isOwned(id)) G.toast('⭐ ' + h.th + ' — เศษพอสำหรับติดดาว (ไปหน้าอัปเกรด)');
      else G.toast('🔓 ปลดล็อก ' + h.th + ' ได้! ใช้ ' + need + ' เศษ');
    } else {
      G.toast('🧩 ' + h.th + ' — เศษ ' + have + '/' + need + ' (ขาดอีก ' + (need - have) + ')');
    }
  };
  window.invMatClick = function (k) {
    var meta = MAT_META[k] || ['📦', k, ''];
    var qty = (G.state.inventory.mats || {})[k] || 0;
    G.toast(meta[0] + ' ' + meta[1] + ' ×' + qty + ' — ' + (meta[2] || 'วัสดุอัปเกรด'));
  };
  window.invEquipClick = function (i) {
    var it = (G.state.inventory.equip || [])[i];
    if (!it) return;
    var lbl = EQ_LABEL[it.slot] || it.slot || 'อุปกรณ์';
    G.toast('🛡️ ' + (it.name || lbl) + ' · ' + (it.stat || '') + (it.set ? ' · เซ็ต ' + it.set : '') + ' — แตะที่ฮีโร่เพื่อสวม');
  };

  // ---------- main render fn (named so shell's rerender map finds it) ----------
  window.renderInventory = function () {
    ensureScreen();
    // sync active tab pill state
    var screen = document.getElementById('inventory');
    if (screen) {
      screen.querySelectorAll('.coltab .tb').forEach(function (x) {
        x.classList.toggle('on', x.getAttribute('data-tab') === window.__invTab);
      });
    }
    renderInvBody();
  };

  // ---------- inject the screen section + hub side button ----------
  function ensureScreen() {
    var stage = document.getElementById('stage');
    if (!stage) return;
    if (!document.getElementById('inventory')) {
      var sec = document.createElement('section');
      sec.className = 'screen';
      sec.id = 'inventory';
      sec.innerHTML =
        '<div class="topbar">' +
        '  <div class="back glass" onclick="go(\'hub\')">‹ กลับ</div>' +
        '  <div class="h2" style="margin:0 0 0 10px">คลังของ <span class="sub">Inventory · เศษ · วัสดุ · อุปกรณ์</span></div>' +
        '  <div class="curr"><div class="pill glass" title="ทอง"><span class="ic">🪙</span><span data-cur="gold"></span></div>' +
        '    <div class="pill glass" title="เพชร"><span class="ic">💎</span><span data-cur="ruby"></span></div></div>' +
        '</div>' +
        '<div class="body">' +
        '  <div class="coltab">' +
        '    <div class="tb on" data-tab="shard" onclick="invTab(this,\'shard\')">🧩 เศษฮีโร่</div>' +
        '    <div class="tb" data-tab="mats" onclick="invTab(this,\'mats\')">🧪 วัสดุ</div>' +
        '    <div class="tb" data-tab="equip" onclick="invTab(this,\'equip\')">🛡️ อุปกรณ์</div>' +
        '  </div>' +
        '  <div id="inv-body"></div>' +
        '</div>';
      // insert before the toast (keeps toast last in #stage like other screens)
      var toastEl = document.getElementById('toast');
      if (toastEl && toastEl.parentNode === stage) stage.insertBefore(sec, toastEl);
      else stage.appendChild(sec);
      if (G.refresh) G.refresh();
    }
    ensureHubButton();
  }

  function ensureHubButton() {
    var hub = document.getElementById('hub');
    if (!hub) return;
    var side = hub.querySelector('.side');
    if (!side) return;
    if (side.querySelector('[data-inv-btn]')) return; // idempotent
    var btn = document.createElement('div');
    btn.className = 'sbtn glass';
    btn.setAttribute('data-inv-btn', '1');
    btn.setAttribute('title', 'คลังของ');
    btn.textContent = '📦';
    btn.onclick = function () { go('inventory'); };
    side.appendChild(btn);
  }

  // ---------- wire into shell: wrap go() so go('inventory') re-renders ----------
  if (!window.__invGoWrapped && typeof window.go === 'function') {
    var origGo = window.go;
    window.go = function (id) {
      var r = origGo.apply(this, arguments);
      if (id === 'inventory') { try { window.renderInventory(); } catch (e) {} }
      return r;
    };
    window.__invGoWrapped = true;
  }

  // ---------- initial mount ----------
  ensureScreen();
  // if inventory happens to be the visible screen already, render it now
  var cur = document.getElementById('inventory');
  if (cur && cur.classList.contains('on')) {
    try { window.renderInventory(); } catch (e) {}
  }
})();
