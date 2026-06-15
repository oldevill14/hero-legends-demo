/* feat-bonds.js — Hero Legends Thai · ระบบสายสัมพันธ์ (Bonds)
 * จากผังเครือญาติ canon พระอภัยมณี (docs/19): จัดทีมที่มีฮีโร่สายเดียวกัน/คู่รัก/
 * ฝาแฝด → ปลดบัฟทั้งทีม. เพิ่ม:
 *   1) หน้า #bonds (เปิดจากปุ่มข้าง hub) — โชว์บอนด์ทั้งหมด สมาชิก (มี/ยังไม่มี) + บัฟ
 *   2) แผงในหน้าจัดทีม — บอนด์ที่ "ติด" จากทีมปัจจุบัน + บัฟพลังทีม
 *   3) window.bondBonus(ids) → {hp,atk,def,spd,crit} รวม (ให้ battle/power ใช้)
 * Conflict-free: inject #bonds เอง, wrap renderTeam idempotent, CSS prefixed bnd-.
 */
(function () {
  'use strict';
  if (!window.GAME) { console.warn('[bonds] GAME missing'); return; }
  var G = window.GAME;

  // ---- bond definitions (canon family tree → synergy) ----
  // need = จำนวนสมาชิกขั้นต่ำในทีมที่ทำให้บอนด์ติด · buff = สัดส่วน (%)
  var BONDS = [
    { id: 'rattana', name: 'ครอบครัวรัตนา', icon: '👑', members: ['hero_thao_suthat', 'hero_phraaphai', 'hero_srisuwan'], need: 3, buff: { hp: .12, atk: .08 }, desc: 'สายเลือดกรุงรัตนา 3 รุ่น' },
    { id: 'brothers', name: 'สองพี่น้องรัตนา', icon: '🤝', members: ['hero_phraaphai', 'hero_srisuwan'], need: 2, buff: { atk: .08, def: .06 }, desc: 'พระอภัยมณี + ศรีสุวรรณ' },
    { id: 'sons', name: 'โอรสพระอภัย', icon: '⚔️', members: ['hero_sinsamut', 'hero_sudsakorn', 'hero_mangkala'], need: 2, buff: { atk: .10 }, desc: 'เลือดนักรบของพระอภัย' },
    { id: 'twins', name: 'ฝาแฝดสุวรรณ', icon: '👯', members: ['hero_soisuwan', 'hero_chansuda'], need: 2, buff: { spd: .10, crit: .06 }, desc: 'สร้อยสุวรรณ + จันทร์สุดา' },
    { id: 'aphai_mali', name: 'คู่บุญเมืองผลึก', icon: '💞', members: ['hero_phraaphai', 'hero_suwanmali'], need: 2, buff: { atk: .12 }, desc: 'พระอภัยมณี + สุวรรณมาลี' },
    { id: 'suds_saow', name: 'รักการะเวก', icon: '🌸', members: ['hero_sudsakorn', 'hero_saowakhon'], need: 2, buff: { hp: .10 }, desc: 'สุดสาคร + เสาวคนธ์' },
    { id: 'sin_yupa', name: 'รักแห่งสมุทร', icon: '🌊', members: ['hero_sinsamut', 'hero_yupaphaka'], need: 2, buff: { def: .12 }, desc: 'สินสมุทร + ยุพาผกา' },
    { id: 'karavek', name: 'พันธมิตรการะเวก', icon: '🕊️', members: ['hero_saowakhon', 'hero_hatchai'], need: 2, buff: { hp: .08, spd: .06 }, desc: 'สายเมืองการะเวก' },
    { id: 'grandkids', name: 'รุ่นหลานทายาท', icon: '🌟', members: ['hero_wayupat', 'hero_hatsakan'], need: 2, buff: { spd: .12 }, desc: 'วายุพัฒน์ + หัสกัน' },
    { id: 'mount', name: 'พาหนะคู่ใจ', icon: '🐲', members: ['hero_sudsakorn', 'hero_ma_nin_mangkorn'], need: 2, buff: { spd: .10, atk: .08 }, desc: 'สุดสาคร + ม้านิลมังกร' },
    { id: 'hermit', name: 'ฤๅษีนำทาง', icon: '🧙', members: ['hero_phra_ruesi', 'hero_sudsakorn'], need: 2, buff: { hp: .06, atk: .06, def: .06 }, desc: 'พระฤๅษี + ศิษย์สุดสาคร' },
    { id: 'lanka', name: 'สายเลือดลังกา', icon: '🔥', members: ['hero_nang_laweng', 'hero_usaren', 'hero_mangkala'], need: 2, buff: { atk: .10, crit: .05 }, desc: 'นางละเวง · อุศเรน · มังคลา' }
  ];
  var STAT_TH = { hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD', crit: 'คริ' };

  function heroById(id) { return (window.HEROES || []).find(function (h) { return h.id === id; }) || null; }
  function ELE(e) { return (window.ELE || {})[e] || 'var(--muted)'; }

  // active members of a bond within a team-id list
  function hits(bond, ids) { return bond.members.filter(function (m) { return ids.indexOf(m) >= 0; }).length; }
  function isActive(bond, ids) { return hits(bond, ids) >= bond.need; }

  // aggregate buff for a team (sum of active bonds) → exposed for battle/power
  window.bondBonus = function (ids) {
    var b = { hp: 0, atk: 0, def: 0, spd: 0, crit: 0 };
    if (!ids || !ids.length) return b;
    BONDS.forEach(function (bn) {
      if (isActive(bn, ids)) for (var k in bn.buff) b[k] = (b[k] || 0) + bn.buff[k];
    });
    return b;
  };
  window.bondsActive = function (ids) { return BONDS.filter(function (b) { return isActive(b, ids); }); };

  // ---------- CSS ----------
  if (!document.getElementById('bnd-style')) {
    var css = [
      '#bonds .body{padding:6px 16px 16px}',
      '.bnd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(clamp(260px,30vw,420px),1fr));gap:14px}',
      '.bnd-card{border-radius:16px;padding:14px 15px;background:var(--panel2);border:1px solid var(--line);position:relative;transition:transform .12s,box-shadow .12s}',
      '.bnd-card.on{border-color:var(--gold);box-shadow:0 0 18px rgba(245,196,81,.3)}',
      '.bnd-card:hover{transform:translateY(-3px)}',
      '.bnd-hd{display:flex;align-items:center;gap:10px;margin-bottom:4px}',
      '.bnd-ic{font-size:clamp(22px,2vw,30px)}',
      '.bnd-nm{font-weight:800;font-size:clamp(14px,1.3vw,19px)}',
      '.bnd-st{margin-left:auto;font-size:11px;font-weight:800;padding:3px 10px;border-radius:10px}',
      '.bnd-st.on{background:linear-gradient(135deg,var(--gold),#d99a2b);color:#3a2600}',
      '.bnd-st.off{background:#11111d;color:var(--muted);border:1px solid var(--line)}',
      '.bnd-desc{font-size:11.5px;color:var(--muted);margin-bottom:9px}',
      '.bnd-mem{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}',
      '.bnd-h{width:clamp(46px,5vw,64px);text-align:center}',
      '.bnd-h img{width:100%;aspect-ratio:1/1;object-fit:cover;object-position:top center;border-radius:10px;border:1.5px solid var(--line);display:block}',
      '.bnd-h.miss img{filter:grayscale(1) brightness(.45)}',
      '.bnd-h .t{font-size:9px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.bnd-buff{display:flex;gap:7px;flex-wrap:wrap}',
      '.bnd-chip{font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:10px;background:rgba(139,92,246,.16);border:1px solid var(--glow);color:#e9d5ff}',
      '.bnd-sum{font-size:12px;color:var(--muted);margin:2px 0 12px;font-weight:600}',
      '.bnd-sum b{color:var(--gold)}',
      // team-screen panel
      '#team .bnd-team{margin:6px 0 10px;padding:9px 12px;border-radius:12px;background:linear-gradient(90deg,rgba(245,196,81,.12),transparent);border:1px solid var(--line)}',
      '#team .bnd-team .h{font-size:12px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:7px}',
      '#team .bnd-team .row{display:flex;gap:7px;flex-wrap:wrap}',
      '#team .bnd-team .none{font-size:11px;color:var(--muted)}',
      '#team .bnd-team .pwadd{margin-left:auto;color:var(--gold);font-weight:800}'
    ].join('');
    var s = document.createElement('style'); s.id = 'bnd-style'; s.textContent = css; document.head.appendChild(s);
  }

  // ---------- inject #bonds screen + hub access ----------
  function ensureScreen() {
    if (!document.getElementById('bonds')) {
      var sec = document.createElement('section');
      sec.className = 'screen'; sec.id = 'bonds';
      sec.innerHTML =
        '<div class="topbar"><div class="back glass" onclick="go(\'hub\')">‹ กลับ</div>' +
        '<div class="h2" style="margin:0 0 0 10px">สายสัมพันธ์ <span class="sub">Bonds · ผังเครือญาติพระอภัยมณี</span></div></div>' +
        '<div class="body" id="bondsBody"></div>';
      var stage = document.getElementById('stage') || document.body;
      stage.appendChild(sec);
    }
    // hub side button (once)
    var side = document.querySelector('#hub .side');
    if (side && !side.querySelector('[data-bond]')) {
      var b = document.createElement('div');
      b.className = 'sbtn glass'; b.title = 'สายสัมพันธ์'; b.setAttribute('data-bond', '1');
      b.setAttribute('onclick', "go('bonds')"); b.textContent = '🔗';
      side.appendChild(b);
    }
  }

  function memberHTML(id, owned) {
    var h = heroById(id);
    return '<div class="bnd-h ' + (owned ? '' : 'miss') + '" title="' + (h ? h.th : id) + '">' +
      '<img src="portraits/' + id + '.jpg" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="t">' + (h ? h.th : id) + '</div></div>';
  }
  function buffChips(buff) {
    return Object.keys(buff).map(function (k) {
      return '<span class="bnd-chip">+' + Math.round(buff[k] * 100) + '% ' + (STAT_TH[k] || k) + '</span>';
    }).join('');
  }

  function renderBonds() {
    var body = document.getElementById('bondsBody'); if (!body) return;
    var ownedIds = (G.ownedList && G.ownedList()) || Object.keys(G.state.owned || {});
    var unlocked = BONDS.filter(function (b) {
      return b.members.filter(function (m) { return ownedIds.indexOf(m) >= 0; }).length >= b.need;
    }).length;
    var cards = BONDS.map(function (b) {
      var own = b.members.filter(function (m) { return ownedIds.indexOf(m) >= 0; }).length;
      var ready = own >= b.need;
      return '<div class="bnd-card ' + (ready ? 'on' : '') + '">' +
        '<div class="bnd-hd"><span class="bnd-ic">' + b.icon + '</span><span class="bnd-nm">' + b.name + '</span>' +
        '<span class="bnd-st ' + (ready ? 'on' : 'off') + '">' + (ready ? '✓ ปลดล็อก' : own + '/' + b.need) + '</span></div>' +
        '<div class="bnd-desc">' + b.desc + '</div>' +
        '<div class="bnd-mem">' + b.members.map(function (m) { return memberHTML(m, ownedIds.indexOf(m) >= 0); }).join('') + '</div>' +
        '<div class="bnd-buff">' + buffChips(b.buff) + '</div></div>';
    }).join('');
    body.innerHTML = '<div class="bnd-sum">ปลดล็อกแล้ว <b>' + unlocked + '</b>/' + BONDS.length +
      ' — มีสมาชิกครบในครอบครองจะปลดบัฟเมื่อจัดลงทีม</div><div class="bnd-grid">' + cards + '</div>';
  }
  window.renderBonds = renderBonds;

  // ---------- team-builder integration ----------
  function teamFromSlots() {
    var ids = [];
    document.querySelectorAll('#team .slot.filled img').forEach(function (img) {
      var m = /portraits\/([a-z_0-9]+)\.jpg/.exec(img.getAttribute('src') || '');
      if (m) ids.push(m[1]);
    });
    return ids;
  }
  function renderTeamBonds() {
    var screen = document.getElementById('team'); if (!screen) return;
    var slots = screen.querySelector('.slots'); if (!slots) return;
    var panel = document.getElementById('bndTeamPanel');
    if (!panel) {
      panel = document.createElement('div'); panel.id = 'bndTeamPanel'; panel.className = 'bnd-team';
      slots.parentNode.insertBefore(panel, slots.nextSibling);
    }
    var ids = teamFromSlots();
    var active = window.bondsActive(ids);
    var bonus = window.bondBonus(ids);
    var addPct = Math.round((bonus.atk + bonus.hp * 0.5 + bonus.def * 0.5 + bonus.spd) * 100); // rough power lift
    panel.innerHTML = '<div class="h">🔗 สายสัมพันธ์ที่ติด' +
      (addPct > 0 ? '<span class="pwadd">⚔️ +' + addPct + '% พลังโดยรวม</span>' : '') + '</div>' +
      (active.length
        ? '<div class="row">' + active.map(function (b) {
            return '<span class="bnd-chip">' + b.icon + ' ' + b.name + '</span>';
          }).join('') + '</div>'
        : '<div class="none">ยังไม่มี — จัดฮีโร่สายเดียวกัน/คู่รัก/ฝาแฝดลงทีมเพื่อปลดบัฟ</div>');
  }

  // wrap renderTeam (idempotent) → also refresh bond panel
  if (typeof window.renderTeam === 'function' && !window.renderTeam.__bndWrapped) {
    var _rt = window.renderTeam;
    window.renderTeam = function () {
      var r = _rt.apply(this, arguments);
      try { renderTeamBonds(); } catch (e) {}
      return r;
    };
    window.renderTeam.__bndWrapped = true;
  }

  // hook go() → build screen lazily + render on entry
  function boot() {
    ensureScreen();
    if (!window.__bndGoHooked && typeof window.go === 'function') {
      var _go = window.go;
      window.go = function (id) {
        var r = _go.apply(this, arguments);
        try { ensureScreen(); if (id === 'bonds') renderBonds(); if (id === 'team') renderTeamBonds(); } catch (e) {}
        return r;
      };
      window.__bndGoHooked = true;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
