/* feat-potential.js — Hero Legends Thai
 * Feature: POTENTIAL (GDD §8) — Potential Lv 1–50, +stat per level.
 * Loads AFTER game.html + game-core.js + the 11 existing feat-*.js modules.
 * Vanilla JS, no libs, no build step.
 *
 * WHAT IT DOES (additive only — never breaks upgradeplus):
 *   - Wraps window.renderUpgrade idempotently (guard window.__potHooked):
 *     calls the PREVIOUS renderUpgrade first, then injects a
 *     "✦ ศักยภาพ (Potential)" panel into #upgradeBody.
 *   - The panel's button opens GAME.modal with: current potential level
 *     (GAME.state.owned[heroId].potential || 0) / 50, the stat bonus it
 *     grants (+0.5% all stats per level, derived from the hero's BASE stats),
 *     and a "เพิ่มศักยภาพ" button that spends gold + mats to +1 level.
 *   - Persists GAME.state.owned[id].potential.
 *   - Exposes window.potentialBonus(heroId) -> {hp,atk,def,spd} (additive flats).
 *
 * Touches ONLY: window.renderUpgrade (wrapped), window.potentialBonus (new),
 * window.pot* (new namespace). Does NOT touch go/toast/detail/HEROES/upx/doLevel/doStar.
 */
(function () {
  if (!window.GAME) { console.warn('[potential] GAME not ready'); return; }
  var G = window.GAME;

  // ---- tuning ----
  var POT_MAX = 50;                 // GDD §8: Lv 1–50
  var PCT_PER_LV = 0.5;             // +0.5% of base stats per level
  var DUST = 'dust';                // ผงมนตรา (in DEFAULT inventory.mats)
  var STONE = 'stone';              // หินเสริมพลัง (in DEFAULT inventory.mats)
  var ESSENCE = 'essence';          // แก่นศักยภาพ — Potential material (seeded here)

  // ---- inventory.mats helpers (additive, never deletes existing keys) ----
  function ensureMats() {
    var inv = G.state.inventory || (G.state.inventory = {});
    var m = inv.mats || (inv.mats = {});
    if (m[ESSENCE] == null) m[ESSENCE] = 18; // seed so demo is playable
    if (m[STONE] == null) m[STONE] = 20;
    if (m[DUST] == null) m[DUST] = 50;
  }
  ensureMats();
  function mat(k) { ensureMats(); return G.state.inventory.mats[k] || 0; }
  function takeMat(k, n) { ensureMats(); G.state.inventory.mats[k] = Math.max(0, (G.state.inventory.mats[k] || 0) - n); }

  // ---- per-hero potential level (lives on GAME.state.owned[id].potential) ----
  function potOf(id) {
    var o = G.state.owned[id];
    if (!o) { G.own(id); o = G.state.owned[id]; }
    if (o.potential == null) o.potential = 0;
    return o.potential;
  }
  function setPot(id, v) {
    var o = G.state.owned[id];
    if (!o) { G.own(id); o = G.state.owned[id]; }
    o.potential = v; G.save();
  }

  // cost to go from level (lv) -> (lv+1); scales with target level
  function potCost(targetLv) {
    return {
      gold: 25000 + 9000 * targetLv,
      essence: 1 + Math.floor(targetLv / 5),   // 1..11
      stone: 2 + Math.ceil(targetLv / 4),      // grows gently
    };
  }

  // ---- PUBLIC: additive flat stat bonus from potential level ----
  // +PCT_PER_LV% of the hero's BASE stat per level, rounded.
  window.potentialBonus = function (heroId) {
    var z = { hp: 0, atk: 0, def: 0, spd: 0 };
    var h = G.heroes().find(function (x) { return x.id === heroId; });
    if (!h) return z;
    var lv = potOf(heroId);
    if (!lv) return z;
    var f = (PCT_PER_LV / 100) * lv;
    return {
      hp: Math.round((h.hp || 0) * f),
      atk: Math.round((h.atk || 0) * f),
      def: Math.round((h.def || 0) * f),
      spd: Math.round((h.spd || 0) * f),
    };
  };

  // ---- scoped CSS (prefixed pot-) ----
  if (!document.getElementById('pot-style')) {
    var st = document.createElement('style');
    st.id = 'pot-style';
    st.textContent = [
      '.pot-sec{margin-top:14px}',
      '.pot-sec>.pot-hd{font-size:13px;font-weight:800;display:flex;align-items:center;gap:8px;margin:0 0 8px}',
      '.pot-sec>.pot-hd .sub{font-size:10.5px;color:var(--muted);font-weight:500}',
      '.pot-sec>.pot-hd .pot-lvtag{margin-left:auto;font-size:10px;font-weight:800;padding:2px 10px;border-radius:9px;' +
        'background:linear-gradient(135deg,var(--glow),var(--glow2));color:#fff;box-shadow:0 0 12px rgba(139,92,246,.5)}',
      '.pot-sec>.pot-hd .pot-lvtag.max{background:linear-gradient(135deg,var(--gold),#d99a2b);color:#3a2600;box-shadow:0 0 12px rgba(245,196,81,.55)}',
      '.pot-open{width:100%;padding:11px 16px;border:none;border-radius:14px;cursor:pointer;font-family:inherit;' +
        'font-weight:800;font-size:13px;color:#fff;display:flex;align-items:center;gap:10px;text-align:left;' +
        'background:linear-gradient(135deg,#241a3e,#1a1430);border:1px solid var(--glow);box-shadow:0 4px 16px rgba(139,92,246,.28)}',
      '.pot-open:hover{box-shadow:0 6px 22px rgba(139,92,246,.42)}',
      '.pot-open .ic{font-size:22px;flex:none}',
      '.pot-open .gr{flex:1;min-width:0}',
      '.pot-open .gr .t{font-size:13px;font-weight:800}',
      '.pot-open .gr .s{font-size:10px;color:var(--muted);font-weight:500;margin-top:1px}',
      '.pot-open .go{font-size:11px;color:var(--gold);font-weight:800;flex:none}',
      '.pot-open .pot-prog{height:6px;border-radius:5px;background:#0c0c16;overflow:hidden;margin-top:6px}',
      '.pot-open .pot-prog>i{display:block;height:100%;background:linear-gradient(90deg,var(--glow),#c4b5fd)}',
      // ---- modal ----
      '.pot-m{width:420px;max-width:100%}',
      '.pot-m h3{margin:0 0 2px;font-size:18px;display:flex;align-items:center;gap:9px}',
      '.pot-m .pot-sub{color:var(--muted);font-size:11px;margin-bottom:14px}',
      '.pot-ring{display:flex;align-items:center;gap:14px;margin-bottom:14px}',
      '.pot-ring .num{flex:none;width:78px;height:78px;border-radius:50%;display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;background:radial-gradient(circle at 38% 32%,#3a2a66,#181226);' +
        'border:2px solid var(--glow);box-shadow:0 0 20px rgba(139,92,246,.45) inset,0 0 14px rgba(139,92,246,.35)}',
      '.pot-ring .num b{font-size:26px;font-weight:900;color:#fff;line-height:1}',
      '.pot-ring .num small{font-size:9.5px;color:var(--muted);margin-top:2px;font-weight:700}',
      '.pot-ring .info{flex:1;min-width:0}',
      '.pot-ring .info .big{font-size:13px;font-weight:800;color:var(--gold)}',
      '.pot-ring .info .lil{font-size:10.5px;color:var(--muted);line-height:1.5;margin-top:3px}',
      '.pot-prog2{height:8px;border-radius:6px;background:#0c0c16;overflow:hidden;margin:8px 0 14px;border:1px solid var(--line)}',
      '.pot-prog2>i{display:block;height:100%;background:linear-gradient(90deg,var(--glow),var(--gold))}',
      '.pot-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}',
      '.pot-stat{background:#11111d;border:1px solid var(--line);border-radius:11px;padding:9px 11px;display:flex;' +
        'align-items:center;justify-content:space-between;font-size:12px;font-weight:700}',
      '.pot-stat .lab{color:var(--ink)}',
      '.pot-stat .v{color:var(--gold);font-weight:800}',
      '.pot-stat .v .nx{color:var(--glow);font-size:10px;font-weight:800;margin-left:5px}',
      '.pot-cost{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:10.5px;margin:0 0 12px}',
      '.pot-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:10px;' +
        'background:#11111d;border:1px solid var(--line);font-weight:700;color:var(--muted)}',
      '.pot-chip.bad{border-color:var(--fire);color:#fca5a5}',
      '.pot-chip b{color:var(--gold)}',
      '.pot-act{display:flex;gap:9px;align-items:center}',
      '.pot-up{flex:1;padding:12px 16px;border:none;border-radius:24px;cursor:pointer;font-family:inherit;' +
        'font-weight:800;font-size:14px;color:#3a2600;background:linear-gradient(135deg,var(--gold),#d99a2b);' +
        'box-shadow:0 5px 18px rgba(245,196,81,.4)}',
      '.pot-up:disabled{opacity:.4;cursor:default;box-shadow:none;filter:grayscale(.35);color:#5a4a1a}',
      '.pot-close{padding:12px 18px;border:1px solid var(--line);border-radius:24px;cursor:pointer;font-family:inherit;' +
        'font-weight:800;font-size:13px;color:var(--ink);background:#181826}',
      '.pot-note{color:var(--muted);font-size:10px;margin-top:10px;line-height:1.5}',
    ].join('');
    document.head.appendChild(st);
  }

  // ---- render helpers ----
  function costChip(label, icon, have, need) {
    var ok = have >= need;
    return '<span class="pot-chip' + (ok ? '' : ' bad') + '">' + icon + ' ' + label +
      ' <b>' + G.fmt(need) + '</b> <span style="opacity:.65">/' + G.fmt(have) + '</span></span>';
  }

  // build the modal body HTML for a given hero
  function modalHtml(h) {
    var lv = potOf(h.id);
    var maxed = lv >= POT_MAX;
    var cur = window.potentialBonus(h.id);
    // preview of the bonus at lv+1
    var nf = maxed ? 0 : (PCT_PER_LV / 100) * (lv + 1);
    var nxt = {
      hp: maxed ? cur.hp : Math.round((h.hp || 0) * nf),
      atk: maxed ? cur.atk : Math.round((h.atk || 0) * nf),
      def: maxed ? cur.def : Math.round((h.def || 0) * nf),
      spd: maxed ? cur.spd : Math.round((h.spd || 0) * nf),
    };
    var c = maxed ? null : potCost(lv + 1);
    var can = !maxed && c && G.state.gold >= c.gold && mat(ESSENCE) >= c.essence && mat(STONE) >= c.stone;
    var pct = Math.round((lv / POT_MAX) * 100);

    function statRow(lab, icon, cv, nv) {
      var delta = (!maxed && nv > cv) ? '<span class="nx">→ +' + nv + '</span>' : '';
      return '<div class="pot-stat"><span class="lab">' + icon + ' ' + lab + '</span>' +
        '<span class="v">+' + cv + delta + '</span></div>';
    }

    var costRow = maxed
      ? '<div class="pot-note">ศักยภาพถึงขีดสุด Lv ' + POT_MAX + ' — พลังแฝงทั้งหมดถูกปลดปล่อยแล้ว</div>'
      : '<div class="pot-cost">' +
          costChip('ทอง', '🪙', G.state.gold, c.gold) +
          costChip('แก่น', '🟣', mat(ESSENCE), c.essence) +
          costChip('หิน', '🪨', mat(STONE), c.stone) +
        '</div>';

    var upBtn = maxed
      ? '<button class="pot-up" disabled>✦ ศักยภาพสูงสุดแล้ว</button>'
      : '<button class="pot-up" onclick="pot.up()"' + (can ? '' : ' disabled') + '>เพิ่มศักยภาพ → Lv ' + (lv + 1) + '</button>';

    return '<div class="pot-m">' +
      '<h3>✦ ศักยภาพ <span style="font-size:12px;color:var(--muted);font-weight:600">' + h.th + '</span></h3>' +
      '<div class="pot-sub">Potential · พลังแฝงในวิญญาณ — +' + PCT_PER_LV + '% ทุกค่าสเตตัสต่อระดับ (อิงค่าพื้นฐาน)</div>' +
      '<div class="pot-ring">' +
        '<div class="num"><b>' + lv + '</b><small>/ ' + POT_MAX + '</small></div>' +
        '<div class="info">' +
          '<div class="big">' + (maxed ? 'ปลดเต็มขั้น ✦' : 'พลังแฝง ' + (PCT_PER_LV * lv).toFixed(1) + '%') + '</div>' +
          '<div class="lil">โบนัสรวมปัจจุบัน: +' + cur.hp + ' HP · +' + cur.atk + ' ATK · +' +
            cur.def + ' DEF · +' + cur.spd + ' SPD</div>' +
        '</div>' +
      '</div>' +
      '<div class="pot-prog2"><i style="width:' + pct + '%"></i></div>' +
      '<div class="pot-grid">' +
        statRow('HP', '❤️', cur.hp, nxt.hp) +
        statRow('ATK', '⚔️', cur.atk, nxt.atk) +
        statRow('DEF', '🛡️', cur.def, nxt.def) +
        statRow('SPD', '⚡', cur.spd, nxt.spd) +
      '</div>' +
      costRow +
      '<div class="pot-act">' + upBtn +
        '<button class="pot-close" onclick="GAME.closeModal()">ปิด</button></div>' +
      (maxed ? '' : '<div class="pot-note">เลื่อนระดับศักยภาพเพื่อขยายเพดานพลังของฮีโร่ ' +
        'โบนัสนี้บวกเพิ่มจากเลเวล/ดาว/ตื่นรู้ที่มีอยู่</div>') +
    '</div>';
  }

  // open the potential modal for the current upgrade hero
  function openModal() {
    var h = window.upHero;
    if (!h) { G.toast('ไม่พบฮีโร่'); return; }
    G.modal(modalHtml(h));
  }

  // refresh modal contents in place (if open), else just re-render the panel
  function refreshModal() {
    var box = document.querySelector('#gmodal .pot-m');
    var h = window.upHero;
    if (box && h) { box.outerHTML = modalHtml(h); }
  }

  // ---- PUBLIC handlers (namespaced, collision-safe) ----
  window.pot = {
    open: openModal,
    up: function () {
      var h = window.upHero; if (!h) return;
      var lv = potOf(h.id);
      if (lv >= POT_MAX) { G.toast('ศักยภาพสูงสุดแล้ว'); return; }
      var c = potCost(lv + 1);
      // pre-check so we never partially spend
      if (G.state.gold < c.gold) { G.toast('❌ ทองไม่พอ'); return; }
      if (mat(ESSENCE) < c.essence) { G.toast('❌ แก่นศักยภาพไม่พอ'); return; }
      if (mat(STONE) < c.stone) { G.toast('❌ หินเสริมพลังไม่พอ'); return; }
      if (!G.spend('gold', c.gold)) return; // refreshes HUD + saves
      takeMat(ESSENCE, c.essence); takeMat(STONE, c.stone);
      setPot(h.id, lv + 1); G.refresh();
      G.toast('✦ ศักยภาพ → Lv ' + (lv + 1));
      refreshModal();
      // re-render the upgrade screen so the panel tag + stats reflect the change
      if (typeof window.renderUpgrade === 'function') {
        try { window.renderUpgrade(); } catch (e) {}
      }
    },
  };

  // inject the potential panel into #upgradeBody (called after the previous render)
  function injectPanel() {
    var h = window.upHero;
    var body = document.getElementById('upgradeBody');
    if (!h || !body) return;
    if (body.querySelector('.pot-sec')) return; // already injected this pass

    var lv = potOf(h.id);
    var maxed = lv >= POT_MAX;
    var cur = window.potentialBonus(h.id);
    var pct = Math.round((lv / POT_MAX) * 100);

    var sec = document.createElement('div');
    sec.className = 'pot-sec';
    sec.innerHTML =
      '<div class="pot-hd">✦ ศักยภาพ <span class="sub">Potential · Lv ' + lv + '/' + POT_MAX + '</span>' +
        '<span class="pot-lvtag' + (maxed ? ' max' : '') + '">Lv ' + lv + '</span></div>' +
      '<button class="pot-open" onclick="pot.open()">' +
        '<span class="ic">✦</span>' +
        '<span class="gr">' +
          '<span class="t">' + (maxed ? 'ศักยภาพเต็มขั้น' : 'ปลดศักยภาพแฝง') + '</span>' +
          '<span class="s">+' + cur.hp + ' HP · +' + cur.atk + ' ATK · +' + cur.def + ' DEF · +' + cur.spd + ' SPD' +
            ' &nbsp;(+' + PCT_PER_LV + '%/Lv)</span>' +
          '<span class="pot-prog"><i style="width:' + pct + '%"></i></span>' +
        '</span>' +
        '<span class="go">เปิด ›</span>' +
      '</button>';

    // place after the inner column (the flex child that holds the upgrade UI),
    // falling back to appending to the body.
    var col = body.querySelector('div[style*="flex:1"]') || body.firstElementChild || body;
    if (col === body) body.appendChild(sec);
    else col.appendChild(sec);
  }

  // =========================================================================
  // idempotent wrap of window.renderUpgrade (guard window.__potHooked)
  // call the PREVIOUS renderUpgrade first, THEN inject our panel.
  // =========================================================================
  if (!window.__potHooked) {
    window.__potHooked = true;
    var _prevRenderUpgrade = window.renderUpgrade;
    window.renderUpgrade = function () {
      var r;
      if (typeof _prevRenderUpgrade === 'function') {
        try { r = _prevRenderUpgrade.apply(this, arguments); } catch (e) { console.warn('[potential] prev renderUpgrade error', e); }
      }
      try { injectPanel(); } catch (e) { console.warn('[potential] inject error', e); }
      return r;
    };
  }

  // if the upgrade screen is already on with a hero, render now so the panel shows.
  var upScreen = document.getElementById('upgrade');
  if (upScreen && upScreen.classList.contains('on') && window.upHero) {
    try { window.renderUpgrade(); } catch (e) {}
  }
})();
