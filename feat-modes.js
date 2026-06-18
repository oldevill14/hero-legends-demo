/* feat-modes.js — GAME MODES (screen id="modes") for Hero Legends Thai.
 * Loads AFTER game.html + game-core.js. Overrides ONLY window.renderModes.
 *
 * Each tile launches something real (all via window.GAME helpers):
 *   🗼 หอคอย (Tower)        — floor-climb; sets localStorage 'hlt_pending_stage' like a stage
 *                             and runs the existing team -> battle flow via window.launch().
 *   🗝️ ดันเจียนรายวัน      — GAME.modal: pick an element to farm -> spends energy -> grants
 *                             element-themed mats + gold into GAME.state.inventory.mats.
 *   🐲 บอสโลก (World Boss)  — GAME.modal with a SHARED boss HP bar (GAME.state.worldBossHp).
 *                             "โจมตี" deals damage based on owned roster power + grants loot;
 *                             defeating it resets the boss to a tougher tier (Nothing is Deleted:
 *                             keeps a kill counter).
 *   🚢 เดินเรือสำรวจ        — dispatch a team for a timer; demo = instant small reward on return.
 *                             Tracks dispatch slots in GAME.state.expedition.
 *   ♾️ ทะเลไร้ขอบ           — Endless Sea: launches the team -> battle flow (special stage).
 *   🏅 ด่านชนชั้นยอด        — Elite Campaign: launches the team -> battle flow (special stage).
 *
 * Conflict-safe: redefines ONLY window.renderModes, adds window.MODES_* helpers under a
 * namespace, wraps go() additively (chains the previous go), injects a <style> with the
 * 'mds-' prefix. Does not touch go/toast/detail/HEROES or other screens' render fns.
 */
(function () {
  'use strict';
  if (!window.GAME) { console.warn('[feat-modes] GAME not ready'); return; }
  var G = window.GAME;

  // ---- inject scoped styles (mds- prefix) ----
  if (!document.getElementById('mds-style')) {
    var st = document.createElement('style');
    st.id = 'mds-style';
    st.textContent = [
      '.mds-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}',
      '.mds-tile{position:relative;border-radius:16px;padding:16px 12px 14px;text-align:left;cursor:pointer;',
      '  overflow:hidden;transition:transform .12s,box-shadow .12s;min-height:104px;display:flex;flex-direction:column;gap:3px}',
      '.mds-tile:hover{transform:translateY(-3px);box-shadow:0 8px 26px rgba(139,92,246,.32)}',
      '.mds-tile .mds-ic{font-size:30px;line-height:1;width:52px;height:52px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:12px}',
      '.mds-tile .mds-ic img{width:100%;height:100%;object-fit:cover;display:block}',
      '.mds-tile .mds-t{font-weight:800;font-size:14px;margin-top:5px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}',
      '.mds-tile .mds-s{font-size:10.5px;color:var(--muted);line-height:1.5}',
      '.mds-tile .mds-rt{margin-top:auto;font-size:10px;color:var(--gold);font-weight:700;padding-top:6px}',
      '.mds-tile.mds-feature{background:linear-gradient(135deg,rgba(168,85,247,.28),rgba(139,92,246,.10))}',
      '.mds-tag{font-size:8.5px;font-weight:800;padding:1px 7px;border-radius:8px}',
      '.mds-tag.hot{background:var(--fire);color:#fff}',
      '.mds-tag.new{background:var(--epic);color:#fff}',
      '.mds-tag.rdy{background:var(--nature);color:#06210f}',
      '.mds-tag.cool{background:var(--panel2);color:var(--muted);border:1px solid var(--line)}',
      // modal internals
      '.mds-mh{font-size:18px;font-weight:900;display:flex;align-items:center;gap:9px;margin:0 0 4px}',
      '.mds-msub{font-size:11.5px;color:var(--muted);margin-bottom:14px;line-height:1.5}',
      '.mds-ele-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;min-width:380px}',
      '.mds-ele{border:2px solid var(--line);border-radius:13px;padding:11px 6px;text-align:center;cursor:pointer;',
      '  background:#13131f;transition:transform .1s,border-color .12s}',
      '.mds-ele:hover{transform:translateY(-2px)}',
      '.mds-ele .mds-edot{width:24px;height:24px;border-radius:50%;margin:0 auto 6px;border:1px solid #fff4}',
      '.mds-ele .mds-en{font-size:11px;font-weight:800}',
      '.mds-ele .mds-em{font-size:9px;color:var(--gold);margin-top:2px}',
      // world boss
      '.mds-boss-art{font-size:54px;text-align:center;margin:2px 0 6px;filter:drop-shadow(0 0 18px rgba(168,85,247,.6))}',
      '.mds-hpwrap{min-width:420px}',
      '.mds-hpbar{height:18px;border-radius:10px;background:#0c0c16;overflow:hidden;border:1px solid var(--line);position:relative}',
      '.mds-hpbar>i{display:block;height:100%;background:linear-gradient(90deg,#ef4444,#f59e0b);transition:width .45s ease}',
      '.mds-hptxt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
      '  font-size:10.5px;font-weight:800;color:#fff;text-shadow:0 1px 3px #000}',
      '.mds-bossmeta{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin:7px 1px 0}',
      '.mds-bossmeta b{color:var(--gold)}',
      '.mds-hitlog{font-size:11px;color:#c4b5fd;text-align:center;margin:10px 0 4px;min-height:16px;font-weight:700}',
      '.mds-actions{display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap}',
      // expedition
      '.mds-exp-list{min-width:380px;display:flex;flex-direction:column;gap:8px;margin-bottom:6px}',
      '.mds-exp-row{display:flex;align-items:center;gap:11px;padding:10px 13px;border-radius:12px;',
      '  border:1px solid var(--line);background:var(--panel)}',
      '.mds-exp-row .mds-ei{font-size:22px;flex:none;width:30px;text-align:center}',
      '.mds-exp-row .mds-eg{flex:1;min-width:0}',
      '.mds-exp-row .mds-egt{font-weight:700;font-size:12.5px}',
      '.mds-exp-row .mds-egs{font-size:10px;color:var(--muted)}',
      '.mds-tbtn{padding:8px 16px;border-radius:20px;cursor:pointer;font-weight:800;font-size:12px;border:none;font-family:inherit}',
      '.mds-tbtn.go{background:linear-gradient(135deg,var(--glow),var(--glow2));color:#fff;box-shadow:0 4px 16px rgba(139,92,246,.4)}',
      '.mds-tbtn.gold{background:linear-gradient(135deg,var(--gold),#d99a2b);color:#3a2600}',
      '.mds-tbtn:disabled{opacity:.4;cursor:default;box-shadow:none}',
      '.mds-close{padding:8px 16px;border-radius:20px;cursor:pointer;font-weight:700;font-size:12px;',
      '  background:var(--panel2);border:1px solid var(--line);color:var(--ink);font-family:inherit}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ---- element palette (mirror of game.html ELE, but self-contained) ----
  var ELE = { Water: 'var(--water)', Fire: 'var(--fire)', Nature: 'var(--nature)', Light: 'var(--light)', Dark: 'var(--dark)' };
  var ELE_TH = { Water: 'ธาตุน้ำ', Fire: 'ธาตุไฟ', Nature: 'ธาตุไม้', Light: 'ธาตุแสง', Dark: 'ธาตุมืด' };
  // each element farms a thematic material (keys match feat-inventory's mats) + gold
  var ELE_MAT = {
    Water: { key: 'pearl', th: 'ไข่มุกสมุทร' },
    Fire: { key: 'ember', th: 'ถ่านเพลิง' },
    Nature: { key: 'essence', th: 'แก่นพฤกษา' },
    Light: { key: 'moonlight', th: 'แสงจันทรา' },
    Dark: { key: 'scale', th: 'เกล็ดนิล' }
  };

  // ---- helpers ----
  function ensureMats() {
    var inv = G.state.inventory || (G.state.inventory = {});
    if (!inv.mats || typeof inv.mats !== 'object') inv.mats = {};
    return inv.mats;
  }
  function addMat(key, n) {
    var mats = ensureMats();
    mats[key] = (mats[key] | 0) + n;
    G.save();
  }
  function rosterPower() {
    // sum of a light power score over owned heroes (drives world-boss hit + expedition reward)
    var heroes = G.heroes();
    var owned = G.ownedList ? G.ownedList() : Object.keys(G.state.owned || {});
    var sum = 0;
    owned.forEach(function (id) {
      var h = heroes.find(function (x) { return x.id === id; });
      if (!h) return;
      var st = (G.state.owned && G.state.owned[id]) || {};
      var lvBonus = 1 + ((st.level | 0) * 0.012);
      sum += Math.round((h.hp * 0.3 + h.atk * 3 + h.def * 2 + h.spd * 4) * lvBonus);
    });
    return sum || 5000; // floor so the game still works on a fresh save
  }
  function launchStage(id, label) {
    // keep the existing flow: remember pending stage then go team->battle via launch()
    try { localStorage.setItem('hlt_pending_stage', id); } catch (e) {}
    G.toast('🗺️ ' + label + ' — จัดทีมแล้วลุย!');
    if (typeof window.launch === 'function') { window.launch(id); }
    else { G.go('team'); }
  }

  // ============================================================
  //  🗼 TOWER — floor climb
  // ============================================================
  function ensureTower() {
    if (!G.state.tower || typeof G.state.tower !== 'object') {
      G.state.tower = { floor: 86 }; // matches the hub copy "ชั้น 86"
      G.save();
    }
    return G.state.tower;
  }
  window.MODES_tower = function () {
    var t = ensureTower();
    var floor = t.floor | 0;
    var stageId = 'tower-' + floor;
    // launch like a stage; on a returning win the climb advances
    launchStage(stageId, 'หอคอยสวรรค์ ชั้น ' + floor);
  };

  // ============================================================
  //  🗝️ DAILY DUNGEON — pick element -> farm mats
  // ============================================================
  var DD_COST = 6; // energy per run
  window.MODES_daily = function () {
    var eles = Object.keys(ELE);
    var grid = eles.map(function (e) {
      var m = ELE_MAT[e];
      return '<div class="mds-ele" onclick="window.MODES_dailyFarm(\'' + e + '\')">' +
        '<div class="mds-edot" style="background:' + ELE[e] + '"></div>' +
        '<div class="mds-en">' + ELE_TH[e] + '</div>' +
        '<div class="mds-em">' + m.th + '</div>' +
        '</div>';
    }).join('');
    G.modal(
      '<div class="mds-mh">🗝️ ดันเจียนรายวัน</div>' +
      '<div class="mds-msub">เลือกธาตุที่ต้องการฟาร์ม — ได้วัสดุตามธาตุ + ทอง (ใช้ ⚡' + DD_COST + ' ต่อรอบ)' +
      '<br>พลังงาน: <b style="color:var(--gold)" data-cur="energy">' + G.state.energy + '/' + G.state.energyMax + '</b></div>' +
      '<div class="mds-ele-grid">' + grid + '</div>' +
      '<div class="mds-actions"><button class="mds-close" onclick="GAME.closeModal()">ปิด</button></div>'
    );
    G.refresh();
  };
  window.MODES_dailyFarm = function (ele) {
    if ((G.state.energy | 0) < DD_COST) { G.toast('⚡ พลังงานไม่พอ (ต้องการ ' + DD_COST + ')'); return; }
    if (!G.spend('energy', DD_COST)) return;
    var m = ELE_MAT[ele];
    var matAmt = 3 + Math.floor(Math.random() * 4); // 3-6
    var goldAmt = 6000 + Math.floor(Math.random() * 6000);
    addMat(m.key, matAmt);
    G.grant({ gold: goldAmt });
    G.toast('🎁 ฟาร์ม' + ELE_TH[ele] + ': ' + m.th + ' ×' + matAmt + ' · 🪙 ' + G.fmt(goldAmt));
    // keep the modal open and refresh the energy display so the player can run again
    if (window.MODES_inventoryRerender) window.MODES_inventoryRerender();
    G.refresh();
    // if energy ran out, gently note it
    if ((G.state.energy | 0) < DD_COST) {
      var sub = document.querySelector('#gmodal .mds-msub');
      if (sub) sub.innerHTML += '<br><span style="color:var(--fire)">พลังงานหมดแล้ว — รอฟื้นฟูหรือซื้อเพิ่ม</span>';
    }
  };
  // best-effort hook so the inventory screen (if open) reflects new mats
  window.MODES_inventoryRerender = function () {
    try { if (typeof window.renderInventory === 'function') window.renderInventory(); } catch (e) {}
  };

  // ============================================================
  //  🐲 WORLD BOSS — shared HP bar (state.worldBossHp)
  // ============================================================
  var BOSS_TIERS = [
    { name: 'อสูรทะเลโบราณ', emoji: '🐙', max: 3200000 },
    { name: 'มังกรเจ็ดเศียร', emoji: '🐲', max: 5400000 },
    { name: 'เงาราชันสมุทร', emoji: '👁️', max: 8800000 }
  ];
  function ensureBoss() {
    var s = G.state;
    if (typeof s.worldBossHp !== 'number' || s.worldBossTier == null) {
      s.worldBossTier = 0;
      s.worldBossHp = BOSS_TIERS[0].max;
      s.worldBossKills = s.worldBossKills | 0;
      G.save();
    }
    if (s.worldBossTier >= BOSS_TIERS.length) s.worldBossTier = BOSS_TIERS.length - 1;
    return BOSS_TIERS[s.worldBossTier];
  }
  function bossPct() {
    var b = ensureBoss();
    return Math.max(0, Math.min(100, Math.round(100 * G.state.worldBossHp / b.max)));
  }
  window.MODES_worldBoss = function () {
    var b = ensureBoss();
    G.modal(
      '<div class="mds-mh">🐲 บอสโลก <span class="mds-tag hot">เหลือ 12ชม.</span></div>' +
      '<div class="mds-msub">ผู้เล่นทั้งเซิร์ฟช่วยกันถล่มบอส — สะสมดาเมจเพื่อรับรางวัล (ฟรี ไม่เสียพลังงาน)</div>' +
      '<div class="mds-hpwrap">' +
      '  <div class="mds-boss-art" id="mdsBossArt">' + b.emoji + '</div>' +
      '  <div style="text-align:center;font-weight:900;font-size:15px;margin-bottom:8px" id="mdsBossName">' + b.name + ' · เทียร์ ' + (G.state.worldBossTier + 1) + '</div>' +
      '  <div class="mds-hpbar"><i id="mdsBossFill" style="width:' + bossPct() + '%"></i>' +
      '    <div class="mds-hptxt" id="mdsBossHpTxt">' + G.fmt(G.state.worldBossHp) + ' / ' + G.fmt(b.max) + '</div></div>' +
      '  <div class="mds-bossmeta"><span>พลังทีมของคุณ: <b id="mdsBossPow">' + G.fmt(rosterPower()) + '</b></span>' +
      '    <span>ปราบไปแล้ว: <b id="mdsBossKills">' + (G.state.worldBossKills | 0) + '</b> ตัว</span></div>' +
      '  <div class="mds-hitlog" id="mdsBossLog">กด "โจมตี" เพื่อปล่อยพลังทีม</div>' +
      '  <div class="mds-actions">' +
      '    <button class="mds-tbtn go" onclick="window.MODES_bossHit()">⚔️ โจมตี</button>' +
      '    <button class="mds-close" onclick="GAME.closeModal()">ปิด</button>' +
      '  </div>' +
      '</div>'
    );
  };
  window.MODES_bossHit = function () {
    var b = ensureBoss();
    // damage = roster power * crit roll (×1 .. ×2.6), with a little variance
    var roll = 1 + Math.random() * 1.6;
    var crit = Math.random() < 0.22;
    var dmg = Math.round(rosterPower() * roll * (crit ? 1.8 : 1));
    G.state.worldBossHp = Math.max(0, G.state.worldBossHp - dmg);

    // per-hit loot scales with damage dealt
    var gold = Math.round(dmg * 0.04);
    var ruby = 2 + Math.floor(Math.random() * 4);
    G.grant({ gold: gold, ruby: ruby });

    var log = document.getElementById('mdsBossLog');
    if (log) log.innerHTML = (crit ? '💥 คริติคอล! ' : '⚔️ ') + 'สร้างดาเมจ <b style="color:var(--gold)">' + G.fmt(dmg) +
      '</b> · รับ 🪙' + G.fmt(gold) + ' 💎' + ruby;

    if (G.state.worldBossHp <= 0) {
      // defeated! grant a big chest, bump kill count, escalate tier (Nothing is Deleted: counter grows)
      G.state.worldBossKills = (G.state.worldBossKills | 0) + 1;
      var chestGold = 80000 + 40000 * (G.state.worldBossTier | 0);
      var chestRuby = 200 + 80 * (G.state.worldBossTier | 0);
      G.grant({ gold: chestGold, ruby: chestRuby });
      addMat('pearl', 10); addMat('moonlight', 6);
      G.state.worldBossTier = Math.min(BOSS_TIERS.length - 1, (G.state.worldBossTier | 0) + 1);
      var nb = BOSS_TIERS[G.state.worldBossTier];
      G.state.worldBossHp = nb.max;
      G.save();
      G.toast('🏆 ปราบ ' + b.name + ' สำเร็จ! รับ 🪙' + G.fmt(chestGold) + ' 💎' + chestRuby + ' + วัสดุหายาก');
      // re-render the modal contents to show the next-tier boss
      window.MODES_worldBoss();
      var nlog = document.getElementById('mdsBossLog');
      if (nlog) nlog.innerHTML = '🐉 บอสตัวใหม่ปรากฏ! <b style="color:var(--gold)">' + nb.name + '</b> เทียร์ ' + (G.state.worldBossTier + 1);
      return;
    }
    G.save();
    // update the bar in place
    var b2 = ensureBoss();
    var fill = document.getElementById('mdsBossFill');
    var txt = document.getElementById('mdsBossHpTxt');
    if (fill) fill.style.width = bossPct() + '%';
    if (txt) txt.textContent = G.fmt(G.state.worldBossHp) + ' / ' + G.fmt(b2.max);
    G.refresh();
  };

  // ============================================================
  //  🚢 EXPEDITION — dispatch teams for a (demo: instant) reward
  // ============================================================
  var EXP_ROUTES = [
    { id: 'reef', emoji: '🪸', th: 'แนวปะการังเพลิง', mat: 'ember', sub: 'ทอง + ถ่านเพลิง' },
    { id: 'deep', emoji: '🌊', th: 'ร่องลึกสมุทร', mat: 'pearl', sub: 'ทอง + ไข่มุกสมุทร' },
    { id: 'isle', emoji: '🏝️', th: 'เกาะลึกลับ', mat: 'essence', sub: 'ทอง + แก่นพฤกษา' },
    { id: 'moon', emoji: '🌙', th: 'อ่าวแสงจันทร์', mat: 'moonlight', sub: 'ทอง + แสงจันทรา' },
    { id: 'wreck', emoji: '⚓', th: 'ซากเรือโบราณ', mat: 'scale', sub: 'ทอง + เกล็ดนิล + เพชร' }
  ];
  function ensureExp() {
    if (!G.state.expedition || typeof G.state.expedition !== 'object') {
      G.state.expedition = { runs: 0 };
      G.save();
    }
    return G.state.expedition;
  }
  window.MODES_expedition = function () {
    var rows = EXP_ROUTES.map(function (r) {
      return '<div class="mds-exp-row">' +
        '<div class="mds-ei">' + r.emoji + '</div>' +
        '<div class="mds-eg"><div class="mds-egt">' + r.th + '</div><div class="mds-egs">รางวัล: ' + r.sub + '</div></div>' +
        '<button class="mds-tbtn go" onclick="window.MODES_expDispatch(\'' + r.id + '\')">ส่งทีม ▶</button>' +
        '</div>';
    }).join('');
    var ex = ensureExp();
    G.modal(
      '<div class="mds-mh">🚢 เดินเรือสำรวจ</div>' +
      '<div class="mds-msub">ส่งทีมออกสำรวจเส้นทาง — กลับมาพร้อมของรางวัล (เดโม: รับทันที)' +
      '<br>ออกสำรวจสำเร็จแล้ว: <b style="color:var(--gold)">' + (ex.runs | 0) + '</b> ครั้ง</div>' +
      '<div class="mds-exp-list">' + rows + '</div>' +
      '<div class="mds-actions"><button class="mds-close" onclick="GAME.closeModal()">ปิด</button></div>'
    );
  };
  window.MODES_expDispatch = function (routeId) {
    var r = EXP_ROUTES.find(function (x) { return x.id === routeId; });
    if (!r) return;
    var ex = ensureExp();
    ex.runs = (ex.runs | 0) + 1;
    // small reward scaled lightly by roster power
    var gold = 8000 + Math.round(rosterPower() * 0.5) + Math.floor(Math.random() * 4000);
    var matAmt = 2 + Math.floor(Math.random() * 3);
    addMat(r.mat, matAmt);
    var grant = { gold: gold };
    if (routeId === 'wreck') grant.ruby = 30 + Math.floor(Math.random() * 30);
    G.grant(grant);
    G.save();
    var extra = grant.ruby ? ' 💎' + grant.ruby : '';
    G.toast('⛵ กลับจาก' + r.th + ': 🪙' + G.fmt(gold) + extra + ' + วัสดุ ×' + matAmt);
    window.MODES_inventoryRerender();
    // refresh the run counter in the open modal
    var sub = document.querySelector('#gmodal .mds-msub b');
    if (sub) sub.textContent = (ex.runs | 0);
  };

  // ============================================================
  //  ♾️ ENDLESS SEA  &  🏅 ELITE CAMPAIGN — launch battle flow
  // ============================================================
  window.MODES_endless = function () { launchStage('endless-wave', 'ทะเลไร้ขอบ — เอาตัวรอดให้นานที่สุด'); };
  window.MODES_elite = function () { launchStage('elite-1', 'ด่านชนชั้นยอด — ล่าเศษฮีโร่ Legendary'); };

  // ============================================================
  //  RENDER
  // ============================================================
  function renderModes() {
    var host = document.getElementById('modeTiles');
    if (!host) return;
    ensureBoss(); ensureTower(); ensureExp();

    var tiles = [
      {
        ic: '🗼', img: 'mode_tower', t: 'หอคอยสวรรค์', tag: '<span class="mds-tag rdy">พร้อม</span>',
        s: 'Tower · ปีนต่อทีละชั้น', rt: 'ชั้นปัจจุบัน ' + (G.state.tower.floor | 0),
        fn: 'window.MODES_tower()', feature: true
      },
      {
        ic: '🐲', img: 'mode_worldboss', t: 'บอสโลก', tag: '<span class="mds-tag hot">เหลือ 12ชม.</span>',
        s: 'World Boss · ถล่มร่วมทั้งเซิร์ฟ', rt: 'HP ' + bossPct() + '% · ปราบ ' + (G.state.worldBossKills | 0),
        fn: 'window.MODES_worldBoss()', feature: true
      },
      {
        ic: '🗝️', img: 'mode_dungeon', t: 'ดันเจียนรายวัน', tag: '',
        s: 'ฟาร์มวัสดุตามธาตุ + ทอง', rt: '⚡' + DD_COST + ' ต่อรอบ',
        fn: 'window.MODES_daily()'
      },
      {
        ic: '🚢', img: 'mode_expedition', t: 'เดินเรือสำรวจ', tag: '',
        s: 'Expedition · ส่งทีมหาของรางวัล', rt: 'สำรวจแล้ว ' + (G.state.expedition.runs | 0) + ' ครั้ง',
        fn: 'window.MODES_expedition()'
      },
      {
        ic: '♾️', img: 'mode_endless', t: 'ทะเลไร้ขอบ', tag: '<span class="mds-tag cool">Endless</span>',
        s: 'Endless Sea · เอาตัวรอดยาวที่สุด', rt: 'เริ่มรบ ▶',
        fn: 'window.MODES_endless()'
      },
      {
        ic: '🏅', img: 'mode_elite', t: 'ด่านชนชั้นยอด', tag: '<span class="mds-tag new">Elite</span>',
        s: 'Elite · ปลดล็อกเศษฮีโร่ Legendary', rt: 'เริ่มรบ ▶',
        fn: 'window.MODES_elite()'
      }
    ];

    host.className = 'mds-tiles';
    host.innerHTML = tiles.map(function (m) {
      return '<div class="mds-tile glass' + (m.feature ? ' mds-feature' : '') + '" onclick=\'' + m.fn + '\'>' +
        '<div class="mds-ic"><img src="icons/cat/' + m.img + '.png" alt="" ' +
          'onerror="this.outerHTML=\'' + m.ic + '\'"></div>' +
        '<div class="mds-t">' + m.t + ' ' + (m.tag || '') + '</div>' +
        '<div class="mds-s">' + m.s + '</div>' +
        '<div class="mds-rt">' + m.rt + '</div>' +
        '</div>';
    }).join('');
    G.refresh();
  }

  // expose as the global the shell calls
  window.renderModes = renderModes;

  // ---- hook go('modes') so it re-renders idempotently (chain previous go) ----
  if (!window.__mdsWrapped) {
    window.__mdsWrapped = true;
    var prevGo = window.go;
    if (typeof prevGo === 'function') {
      window.go = function (id) {
        var r = prevGo.apply(this, arguments);
        if (id === 'modes') { try { renderModes(); } catch (e) {} }
        return r;
      };
    }
  }

  // initial render; if modes screen is currently visible, refresh it now
  try { renderModes(); } catch (e) {}
})();
