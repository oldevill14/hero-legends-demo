/* feat-upgradeplus.js — Hero Legends Thai
 * Feature: UPGRADE+ — enhances the HERO UPGRADE screen (id="upgrade") beyond level/star.
 * Loads AFTER game.html + game-core.js. Vanilla JS, no libs, no build step.
 *
 * PRESERVES the original level-up / star-up behaviour (same stat deltas, same caps),
 * but routes all gold through GAME.state.gold + GAME.spend so the HUD stays in sync.
 *
 * ADDS:
 *   (1) Awakening tiers A1–A5 — costs mats (GAME.state.inventory.mats) + gold,
 *       unlocks +stat / aura, stored in GAME.state.owned[id].awaken (0..5).
 *   (2) Skill level-up (sk Lv 1–15) per skill — costs gold + mats,
 *       stored in GAME.state.owned[id].skillLv = [lv0, lv1, ...].
 *
 * Only overrides: openUpgrade, renderUpgrade, doLevel, doStar (kept compatible),
 * plus new globals prefixed upx* / window.upx. Does NOT touch go/toast/detail/HEROES.
 */
(function () {
  if (!window.GAME) { console.warn('[upgradeplus] GAME not ready'); return; }
  var G = window.GAME;

  // ---- tuning ----
  var AWAKEN_MAX = 5;
  var SKILL_MAX = 15;
  // mat key used for awakening / skill mats (lives in GAME.state.inventory.mats)
  var SOUL = 'soul';   // วิญญาณตื่นรู้ — awakening material
  var STONE = 'stone'; // หินเสริมพลัง — already in DEFAULT inventory
  var DUST = 'dust';   // ผงมนตรา — already in DEFAULT inventory

  // Awakening tier definitions: cost + bonus per tier (A1..A5)
  // bonus is a flat stat package; aura is a short Thai label shown in UI.
  var AWAKEN_TIERS = [
    { gold: 80000,  soul: 2,  dust: 20,  hp: 120, atk: 30, def: 18, spd: 4,  aura: 'รัศมีจาง' },
    { gold: 160000, soul: 4,  dust: 40,  hp: 220, atk: 55, def: 32, spd: 6,  aura: 'รัศมีนวล' },
    { gold: 320000, soul: 8,  dust: 70,  hp: 360, atk: 90, def: 50, spd: 9,  aura: 'รัศมีทอง' },
    { gold: 600000, soul: 14, dust: 110, hp: 540, atk: 135, def: 74, spd: 12, aura: 'รัศมีวิญญาณ' },
    { gold: 1000000, soul: 22, dust: 160, hp: 800, atk: 200, def: 105, spd: 16, aura: 'รัศมีนิรันดร์' },
  ];

  // ---- ensure inventory.mats has the keys we read (additive, never deletes) ----
  function ensureMats() {
    var inv = G.state.inventory || (G.state.inventory = {});
    var m = inv.mats || (inv.mats = {});
    if (m[SOUL] == null) m[SOUL] = 12;   // seed a few awakening souls so demo is playable
    if (m[STONE] == null) m[STONE] = 20;
    if (m[DUST] == null) m[DUST] = 50;
  }
  ensureMats();
  function mat(k) { ensureMats(); return G.state.inventory.mats[k] || 0; }
  function takeMat(k, n) { ensureMats(); G.state.inventory.mats[k] = Math.max(0, (G.state.inventory.mats[k] || 0) - n); }

  // ---- per-hero persistent state helpers (live on GAME.state.owned[id]) ----
  function rec(id) {
    var o = G.state.owned[id];
    if (!o) { G.own(id); o = G.state.owned[id]; } // auto-own if upgrading an un-owned hero (demo)
    if (o.awaken == null) o.awaken = 0;
    if (!Array.isArray(o.skillLv)) o.skillLv = [];
    return o;
  }
  function skLv(o, i) { return o.skillLv[i] || 1; }

  // aggregate awakening bonus for current tier
  function awakenBonus(tier) {
    var b = { hp: 0, atk: 0, def: 0, spd: 0 };
    for (var i = 0; i < tier; i++) {
      b.hp += AWAKEN_TIERS[i].hp; b.atk += AWAKEN_TIERS[i].atk;
      b.def += AWAKEN_TIERS[i].def; b.spd += AWAKEN_TIERS[i].spd;
    }
    return b;
  }
  function awakenAura(tier) { return tier > 0 ? AWAKEN_TIERS[tier - 1].aura : null; }

  // skill level-up cost (scales with target level)
  function skillCost(targetLv) {
    return { gold: 12000 * targetLv, dust: 3 + targetLv, stone: Math.ceil(targetLv / 3) };
  }

  // ---- inject scoped CSS (prefixed upx-) ----
  if (!document.getElementById('upx-style')) {
    var st = document.createElement('style');
    st.id = 'upx-style';
    st.textContent = [
      '.upx-sec{margin-top:14px}',
      '.upx-sec>.upx-hd{font-size:13px;font-weight:800;display:flex;align-items:center;gap:8px;margin:0 0 8px}',
      '.upx-sec>.upx-hd .sub{font-size:10.5px;color:var(--muted);font-weight:500}',
      '.upx-aura{margin-left:auto;font-size:10px;font-weight:800;padding:2px 9px;border-radius:9px;' +
        'background:linear-gradient(135deg,var(--glow),var(--glow2));color:#fff;box-shadow:0 0 12px rgba(139,92,246,.5)}',
      // awaken pips
      '.upx-pips{display:flex;gap:7px;margin:2px 0 10px}',
      '.upx-pip{flex:1;height:9px;border-radius:5px;background:#0c0c16;border:1px solid var(--line);position:relative;overflow:hidden}',
      '.upx-pip.on{border-color:transparent;background:linear-gradient(90deg,var(--gold),#d99a2b);box-shadow:0 0 9px rgba(245,196,81,.55)}',
      '.upx-pip.next{border-color:var(--glow);box-shadow:0 0 8px rgba(139,92,246,.45)}',
      '.upx-cost{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:10.5px;color:var(--muted);margin:0 0 8px}',
      '.upx-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:10px;background:#11111d;border:1px solid var(--line);font-weight:700}',
      '.upx-chip.bad{border-color:var(--fire);color:#fca5a5}',
      '.upx-chip b{color:var(--gold)}',
      // skill rows
      '.upx-sk{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:12px;margin-bottom:8px}',
      '.upx-sk .si{width:36px;height:36px;border-radius:10px;background:#2a2342;display:flex;align-items:center;' +
        'justify-content:center;font-size:17px;flex:none;border:1px solid var(--line)}',
      '.upx-sk .mid{flex:1;min-width:0}',
      '.upx-sk .nm{font-size:12.5px;font-weight:800;display:flex;align-items:center;gap:7px}',
      '.upx-sk .lvtag{font-size:9.5px;font-weight:800;color:#3a2600;background:linear-gradient(135deg,var(--gold),#d99a2b);' +
        'padding:1px 7px;border-radius:8px}',
      '.upx-sk .lvtag.max{background:linear-gradient(135deg,var(--myth),var(--glow2));color:#fff}',
      '.upx-sk .sd{font-size:10px;color:var(--muted);margin-top:2px;line-height:1.4}',
      '.upx-sk .skbar{height:5px;border-radius:4px;background:#0c0c16;overflow:hidden;margin-top:5px}',
      '.upx-sk .skbar>i{display:block;height:100%;background:linear-gradient(90deg,var(--glow),#c4b5fd)}',
      '.upx-sk button{flex:none}',
      '.upx-mini{padding:7px 14px;border:none;border-radius:20px;cursor:pointer;font-weight:800;font-size:11.5px;' +
        'font-family:inherit;background:linear-gradient(135deg,var(--glow),var(--glow2));color:#fff;' +
        'box-shadow:0 4px 14px rgba(139,92,246,.4)}',
      '.upx-mini.gold{background:linear-gradient(135deg,var(--gold),#d99a2b);color:#3a2600;box-shadow:0 4px 14px rgba(245,196,81,.4)}',
      '.upx-mini:disabled{opacity:.38;cursor:default;box-shadow:none;filter:grayscale(.3)}',
      '.upx-note{color:var(--muted);font-size:10px;margin-top:6px;line-height:1.5}',
      '.upx-bankbar{display:flex;gap:7px;flex-wrap:wrap;margin:2px 0 4px}',
    ].join('');
    document.head.appendChild(st);
  }

  // ---- small render helpers ----
  function costChip(label, icon, have, need) {
    var ok = have >= need;
    return '<span class="upx-chip' + (ok ? '' : ' bad') + '">' + icon + ' ' + label +
      ' <b>' + G.fmt(need) + '</b> <span style="opacity:.7">/' + G.fmt(have) + '</span></span>';
  }
  function bankBar() {
    return '<div class="upx-bankbar">' +
      '<span class="upx-chip">🪙 ทอง <b>' + G.fmt(G.state.gold) + '</b></span>' +
      '<span class="upx-chip">🔮 วิญญาณ <b>' + mat(SOUL) + '</b></span>' +
      '<span class="upx-chip">🪨 หิน <b>' + mat(STONE) + '</b></span>' +
      '<span class="upx-chip">✨ ผง <b>' + mat(DUST) + '</b></span>' +
      '</div>';
  }

  // =========================================================================
  // OVERRIDES — keep original level/star data shape (upHero/upState) intact
  // =========================================================================
  // module-mirrored handle so our handlers share the same hero context the
  // original code used; we re-derive from window.upHero each render.
  window.openUpgrade = function (id) {
    var h = G.heroes().find(function (x) { return x.id === id; });
    if (!h) { G.toast('ไม่พบฮีโร่'); return; }
    var o = rec(id);
    window.upHero = h;
    // preserve original upState fields (lv/star/extra) — start lv at saved level if any
    var startLv = (o.level && o.level > 1) ? Math.min(60, o.level) : 24;
    var startStar = o.star || h.star;
    window.upState = { lv: startLv, star: startStar, extra: { hp: 0, atk: 0, def: 0, spd: 0 } };
    window.go('upgrade');
    var back = document.getElementById('upBack');
    if (back) back.onclick = function () { window.detail(id); };
    window.renderUpgrade();
  };

  window.renderUpgrade = function () {
    var h = window.upHero, s = window.upState;
    if (!h || !s) return;
    var o = rec(h.id);
    var aw = o.awaken || 0;
    var ab = awakenBonus(aw);
    var aura = awakenAura(aw);

    // base + level/star extras (original) + awakening bonus
    var cur = {
      hp: h.hp + s.extra.hp + ab.hp,
      atk: h.atk + s.extra.atk + ab.atk,
      def: h.def + s.extra.def + ab.def,
      spd: h.spd + s.extra.spd + ab.spd,
    };
    var extraHp = s.extra.hp + ab.hp, extraAtk = s.extra.atk + ab.atk,
      extraDef = s.extra.def + ab.def, extraSpd = s.extra.spd + ab.spd;

    var lvCost = Math.round(s.lv * 1500);
    var starCost = s.star * 40; // shards (original used inventory shards conceptually)

    var goldEl = document.getElementById('upGold');
    if (goldEl) goldEl.textContent = G.fmt(G.state.gold);

    var d = function (n) { return n ? ' <span class="up-delta">+' + n + '</span>' : ''; };

    // ----- Awakening section -----
    var next = AWAKEN_TIERS[aw]; // tier to buy next (undefined if maxed)
    var pips = '';
    for (var i = 0; i < AWAKEN_MAX; i++) {
      var cls = i < aw ? 'on' : (i === aw ? 'next' : '');
      pips += '<div class="upx-pip ' + cls + '"></div>';
    }
    var awakenHtml;
    if (next) {
      var canAwaken = G.state.gold >= next.gold && mat(SOUL) >= next.soul && mat(DUST) >= next.dust;
      awakenHtml =
        '<div class="upx-pips">' + pips + '</div>' +
        '<div class="upx-cost">' +
          costChip('ทอง', '🪙', G.state.gold, next.gold) +
          costChip('วิญญาณ', '🔮', mat(SOUL), next.soul) +
          costChip('ผง', '✨', mat(DUST), next.dust) +
        '</div>' +
        '<button class="upx-mini gold" onclick="upx.awaken()"' + (canAwaken ? '' : ' disabled') + '>' +
          '✦ ตื่นรู้ A' + (aw + 1) + ' → ' + next.aura + '</button>' +
        '<div class="upx-note">A' + (aw + 1) + ' มอบ +' + next.hp + ' HP · +' + next.atk +
          ' ATK · +' + next.def + ' DEF · +' + next.spd + ' SPD และปลดออร่า “' + next.aura + '”</div>';
    } else {
      awakenHtml =
        '<div class="upx-pips">' + pips + '</div>' +
        '<button class="upx-mini" disabled>✦ ตื่นรู้สูงสุด A' + AWAKEN_MAX + ' แล้ว</button>' +
        '<div class="upx-note">ฮีโร่ตื่นรู้เต็มขั้น — ออร่า “' + (aura || '') + '” เปล่งประกายนิรันดร์</div>';
    }

    // ----- Skill level section -----
    var skillsHtml = (h.skills || []).map(function (sk, i) {
      var lv = skLv(o, i);
      var maxed = lv >= SKILL_MAX;
      var c = skillCost(lv + 1);
      var can = !maxed && G.state.gold >= c.gold && mat(DUST) >= c.dust && mat(STONE) >= c.stone;
      var pct = Math.round((lv / SKILL_MAX) * 100);
      return '' +
        '<div class="upx-sk glass">' +
          '<div class="si">' + (sk[0] || '✦') + '</div>' +
          '<div class="mid">' +
            '<div class="nm">' + (sk[1] || 'สกิล') +
              '<span class="lvtag' + (maxed ? ' max' : '') + '">Lv ' + lv + '/' + SKILL_MAX + '</span></div>' +
            '<div class="sd">' + (sk[2] || '') + '</div>' +
            '<div class="skbar"><i style="width:' + pct + '%"></i></div>' +
          '</div>' +
          (maxed
            ? '<button class="upx-mini" disabled>สูงสุด</button>'
            : '<button class="upx-mini" onclick="upx.skill(' + i + ')"' + (can ? '' : ' disabled') + '>' +
                '↑ Lv' + (lv + 1) + '<br><small style="opacity:.85;font-size:9px">🪙' + G.fmt(c.gold) +
                ' ✨' + c.dust + ' 🪨' + c.stone + '</small></button>') +
        '</div>';
    }).join('');

    document.getElementById('upgradeBody').innerHTML =
      '<div style="display:flex;gap:16px">' +
        '<div class="dt-art" style="width:200px"><img src="portraits/' + h.id + '.jpg"></div>' +
        '<div style="flex:1;min-width:0">' +
          '<h2 style="margin:0 0 2px;font-size:20px">' + h.th +
            (aura ? ' <span style="font-size:12px;color:var(--gold)">✦</span>' : '') + '</h2>' +
          '<div class="meta" style="color:var(--gold);margin-bottom:8px">เลเวล ' + s.lv + '/60 · ' +
            '★'.repeat(Math.min(6, s.star)) + (s.star > 6 ? '+' : '') +
            (aw ? ' · <span style="color:var(--glow)">ตื่นรู้ A' + aw + '</span>' : '') + '</div>' +

          '<div class="upgrade-stat"><span>❤️ HP</span><b>' + cur.hp + d(extraHp) + '</b></div>' +
          '<div class="upgrade-stat"><span>⚔️ ATK</span><b>' + cur.atk + d(extraAtk) + '</b></div>' +
          '<div class="upgrade-stat"><span>🛡️ DEF</span><b>' + cur.def + d(extraDef) + '</b></div>' +
          '<div class="upgrade-stat"><span>⚡ SPD</span><b>' + cur.spd + d(extraSpd) + '</b></div>' +

          // ---- original level / star buttons (preserved, now via GAME gold) ----
          '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">' +
            '<button class="btn" onclick="doLevel()" ' +
              (G.state.gold < lvCost || s.lv >= 60 ? 'disabled' : '') + '>⬆ เลเวลอัป ' +
              '<small style="opacity:.8">🪙' + G.fmt(lvCost) + '</small></button>' +
            '<button class="back glass" onclick="doStar()">⭐ ติดดาว ' +
              '<small style="color:var(--gold)">shard ' + starCost + '</small></button>' +
          '</div>' +

          '<div class="upx-sec">' +
            '<div class="upx-hd">✦ ตื่นรู้ <span class="sub">Awakening · A' + aw + '/' + AWAKEN_MAX + '</span>' +
              (aura ? '<span class="upx-aura">' + aura + '</span>' : '') + '</div>' +
            awakenHtml +
          '</div>' +

          '<div class="upx-sec">' +
            '<div class="upx-hd">⚡ พัฒนาสกิล <span class="sub">Skill Level · สูงสุด Lv ' + SKILL_MAX + '</span></div>' +
            bankBar() +
            skillsHtml +
          '</div>' +

        '</div>' +
      '</div>';
  };

  // ---- original level/star handlers, re-routed through GAME currency ----
  window.doLevel = function () {
    var s = window.upState; if (!s) return;
    var c = Math.round(s.lv * 1500);
    if (s.lv >= 60) { G.toast('เลเวลสูงสุดแล้ว (60)'); return; }
    if (!G.spend('gold', c)) return; // toasts on insufficient
    s.lv += 1;
    s.extra.hp += 22; s.extra.atk += 6; s.extra.def += 4;
    // persist level onto owned record (additive, history-friendly)
    var o = rec(window.upHero.id); o.level = s.lv; G.save();
    G.toast('เลเวลอัป → ' + s.lv);
    window.renderUpgrade();
  };

  window.doStar = function () {
    var s = window.upState; if (!s) return;
    if (s.star >= 10) { G.toast('ดาวสูงสุดแล้ว'); return; }
    s.star += 1;
    s.extra.hp += 60; s.extra.atk += 14; s.extra.def += 8;
    var o = rec(window.upHero.id); o.star = s.star; G.save();
    G.toast('ติดดาว → ' + s.star + '★ (ปลด stat node)');
    window.renderUpgrade();
  };

  // =========================================================================
  // NEW handlers — exposed under window.upx (prefixed, collision-safe)
  // =========================================================================
  window.upx = {
    awaken: function () {
      var h = window.upHero; if (!h) return;
      var o = rec(h.id);
      var aw = o.awaken || 0;
      if (aw >= AWAKEN_MAX) { G.toast('ตื่นรู้สูงสุดแล้ว'); return; }
      var t = AWAKEN_TIERS[aw];
      // pre-check mats so we never partially spend
      if (mat(SOUL) < t.soul) { G.toast('❌ วิญญาณตื่นรู้ไม่พอ'); return; }
      if (mat(DUST) < t.dust) { G.toast('❌ ผงมนตราไม่พอ'); return; }
      if (G.state.gold < t.gold) { G.toast('❌ ทองไม่พอ'); return; }
      // spend gold via GAME (refreshes HUD + saves); then consume mats
      if (!G.spend('gold', t.gold)) return;
      takeMat(SOUL, t.soul); takeMat(DUST, t.dust);
      o.awaken = aw + 1; G.save(); G.refresh();
      G.toast('✦ ตื่นรู้สำเร็จ → A' + o.awaken + ' · ออร่า ' + t.aura);
      window.renderUpgrade();
    },
    skill: function (i) {
      var h = window.upHero; if (!h) return;
      var o = rec(h.id);
      var lv = skLv(o, i);
      if (lv >= SKILL_MAX) { G.toast('สกิลถึง Lv สูงสุดแล้ว'); return; }
      var c = skillCost(lv + 1);
      if (G.state.gold < c.gold) { G.toast('❌ ทองไม่พอ'); return; }
      if (mat(DUST) < c.dust) { G.toast('❌ ผงมนตราไม่พอ'); return; }
      if (mat(STONE) < c.stone) { G.toast('❌ หินเสริมพลังไม่พอ'); return; }
      if (!G.spend('gold', c.gold)) return;
      takeMat(DUST, c.dust); takeMat(STONE, c.stone);
      o.skillLv[i] = lv + 1; G.save(); G.refresh();
      var sk = (h.skills || [])[i] || [];
      G.toast('⚡ ' + (sk[1] || 'สกิล') + ' → Lv ' + o.skillLv[i]);
      window.renderUpgrade();
    },
  };

  // =========================================================================
  // idempotent re-render hook: if upgrade screen is visible now, re-render;
  // and ensure go('upgrade') re-renders via the shell's existing path.
  // =========================================================================
  var upScreen = document.getElementById('upgrade');
  if (upScreen && upScreen.classList.contains('on') && window.upHero && window.upState) {
    try { window.renderUpgrade(); } catch (e) {}
  }
  // wrap go() once so switching TO upgrade re-renders if context exists.
  if (!window.__upxGoWrapped && typeof window.go === 'function') {
    window.__upxGoWrapped = true;
    var _go = window.go;
    window.go = function (id) {
      var r = _go.apply(this, arguments);
      if (id === 'upgrade' && window.upHero && window.upState) {
        try { window.renderUpgrade(); } catch (e) {}
      }
      return r;
    };
  }
})();
