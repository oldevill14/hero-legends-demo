/* feat-economy.js — Economy / Reward + Energy layer for Hero Legends Thai
 * Loads AFTER game.html + game-core.js. Vanilla JS, no libs, no build step.
 *
 * Provides window.ECON:
 *   ECON.ENERGY_COST                 — energy cost per stage entry (~6)
 *   ECON.canEnter(stage[,opts])      — check (and by default CONSUME) energy. ret bool
 *   ECON.stageReward(stageId)        — grant gold/exp/ruby + first-clear bonus. ret summary
 *   ECON.dailyLogin()                — grant the daily login reward once/day. ret summary|null
 *   ECON.claimCheckin()              — claim the daily check-in reward. ret summary|null
 *   ECON.regenNote()                 — human-readable energy regen note (Thai)
 *   ECON.startRegen()/stopRegen()    — demo energy regen timer (1 energy / few sec)
 *
 * This module does NOT override any screen render fn. It only:
 *   - exposes window.ECON helpers (GAME-friendly: reads/writes GAME.state, uses spend/grant)
 *   - wires hub topbar .pill currency displays to data-cur attributes, then GAME.refresh()
 *   - runs a small energy regen timer for the demo
 */
(function () {
  'use strict';
  if (!window.GAME) { console.warn('[ECON] GAME runtime missing — economy disabled'); return; }
  var G = window.GAME;
  var S = G.state;

  // ---- tunables ----
  var ENERGY_COST = 6;          // energy per stage entry
  var REGEN_EVERY_MS = 6000;    // demo: 1 energy every ~6s (real game ~5–6 min)
  var REGEN_AMOUNT = 1;

  // ---- safe currency defaults (in case an older save lacks these keys) ----
  function ensureKeys() {
    if (typeof S.gold !== 'number') S.gold = 0;
    if (typeof S.ruby !== 'number') S.ruby = 0;
    if (typeof S.energy !== 'number') S.energy = 0;
    if (typeof S.energyMax !== 'number') S.energyMax = 120;
    if (typeof S.eventCoin !== 'number') S.eventCoin = 0;
    if (typeof S.exp !== 'number') S.exp = 0;        // account/hero exp pool (demo)
    if (!S.econ) S.econ = { lastLogin: null, lastCheckin: null, checkinDay: 0 };
    G.save();
  }
  ensureKeys();

  // ---------------------------------------------------------------
  //  Helpers
  // ---------------------------------------------------------------
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  // derive a stable difficulty index from a stage id like "7-7" → chapter*10+sub
  function stageWeight(stageId) {
    var m = String(stageId || '').match(/(\d+)\D+(\d+)/);
    if (!m) return 1;
    return parseInt(m[1], 10) + parseInt(m[2], 10) / 10;
  }
  function isBossStage(stageId) {
    var st = (window.STAGES || []).find(function (s) { return s[0] === stageId; });
    return !!(st && st[3]);
  }
  function clearedStars(stageId) {
    return (S.progress && S.progress.cleared && S.progress.cleared[stageId]) || 0;
  }
  function setCleared(stageId, stars) {
    if (!S.progress) S.progress = { cleared: {} };
    if (!S.progress.cleared) S.progress.cleared = {};
    var prev = S.progress.cleared[stageId] || 0;
    if (stars > prev) S.progress.cleared[stageId] = stars;
    G.save();
    return prev; // previous star count (0 == first clear)
  }

  // ---------------------------------------------------------------
  //  ENERGY
  // ---------------------------------------------------------------
  // canEnter(stage, {consume:true, cost:ENERGY_COST})
  // - stage can be a stageId string or a STAGES row; only used for the toast label.
  function canEnter(stage, opts) {
    opts = opts || {};
    var cost = (typeof opts.cost === 'number') ? opts.cost : ENERGY_COST;
    var consume = opts.consume !== false; // default: consume
    var label = (stage && stage[0]) ? stage[0] : stage;

    if ((S.energy || 0) < cost) {
      G.toast('⚡ พลังงานไม่พอ — ต้องใช้ ' + cost + ' (มี ' + S.energy + '/' + S.energyMax + ')');
      return false;
    }
    if (consume) {
      // use GAME.spend so persistence + [data-cur] refresh happen centrally
      var ok = G.spend('energy', cost);
      if (!ok) return false;
      if (label) G.toast('⚡ -' + cost + ' · เข้าด่าน ' + label);
    }
    return true;
  }

  function regenNote() {
    return 'พลังงานฟื้นอัตโนมัติ ' + REGEN_AMOUNT + ' หน่วยทุก ~' +
      Math.round(REGEN_EVERY_MS / 1000) + ' วินาที (เดโม) จนเต็ม ' + S.energyMax;
  }

  var _regenTimer = null;
  function startRegen() {
    if (_regenTimer) return;
    _regenTimer = setInterval(function () {
      if ((S.energy || 0) < S.energyMax) {
        S.energy = Math.min(S.energyMax, (S.energy || 0) + REGEN_AMOUNT);
        G.save();
        G.refresh(); // update any [data-cur="energy"] live
      }
    }, REGEN_EVERY_MS);
  }
  function stopRegen() { if (_regenTimer) { clearInterval(_regenTimer); _regenTimer = null; } }

  // ---------------------------------------------------------------
  //  STAGE REWARD
  // ---------------------------------------------------------------
  // stageReward(stageId, {stars:3}) -> {gold, exp, ruby, firstClear, stars, summary}
  function stageReward(stageId, opts) {
    opts = opts || {};
    var w = stageWeight(stageId);
    var boss = isBossStage(stageId);
    var stars = Math.max(1, Math.min(3, opts.stars || 3));

    // base scaling by chapter difficulty; bosses pay more
    var bossMul = boss ? 1.8 : 1;
    var starMul = 0.6 + 0.2 * stars; // 1★→0.8, 3★→1.2
    var gold = Math.round((900 + w * 420) * bossMul * starMul);
    var exp = Math.round((140 + w * 60) * bossMul * starMul);

    var prevStars = setCleared(stageId, stars);
    var firstClear = prevStars === 0;

    // first-clear ruby bonus (bigger on bosses)
    var ruby = firstClear ? (boss ? 60 : 20) : 0;
    // event coin trickle for boss stages (feeds the events/exchange economy)
    var eventCoin = boss ? (firstClear ? 30 : 8) : 0;

    var grantObj = { gold: gold, exp: exp };
    if (ruby) grantObj.ruby = ruby;
    if (eventCoin) grantObj.eventCoin = eventCoin;
    G.grant(grantObj); // persists + refreshes displays

    var parts = ['🪙 ' + G.fmt(gold), '✨ EXP ' + G.fmt(exp)];
    if (ruby) parts.push('💎 ' + ruby + (firstClear ? ' (เคลียร์ครั้งแรก!)' : ''));
    if (eventCoin) parts.push('🎫 ' + eventCoin);

    return {
      stageId: stageId, gold: gold, exp: exp, ruby: ruby, eventCoin: eventCoin,
      firstClear: firstClear, boss: boss, stars: stars,
      summary: 'รางวัลด่าน ' + stageId + ': ' + parts.join(' · ')
    };
  }

  // ---------------------------------------------------------------
  //  DAILY LOGIN + CHECK-IN (used by events screen "รับ" buttons)
  // ---------------------------------------------------------------
  // dailyLogin() — auto reward, once per calendar day. Returns summary or null if already claimed.
  function dailyLogin() {
    var k = todayKey();
    if (S.econ.lastLogin === k) return null; // already today
    S.econ.lastLogin = k;
    var reward = { gold: 50000, ruby: 50 };
    G.grant(reward);
    G.toast('🎁 ล็อกอินรายวัน: 🪙 ' + G.fmt(reward.gold) + ' · 💎 ' + reward.ruby);
    return { reward: reward, summary: 'ล็อกอินรายวัน รับ 🪙 ' + G.fmt(reward.gold) + ' · 💎 ' + reward.ruby };
  }

  // claimCheckin() — the monthly check-in calendar. Once/day; cycles the reward by day.
  function claimCheckin() {
    var k = todayKey();
    if (S.econ.lastCheckin === k) { G.toast('เช็คอินแล้ววันนี้ ✓'); return null; }
    S.econ.lastCheckin = k;
    S.econ.checkinDay = (S.econ.checkinDay || 0) + 1;
    var day = S.econ.checkinDay;
    // reward cycles: every 7th day is a ruby jackpot, otherwise gold + a little ruby
    var reward = (day % 7 === 0)
      ? { ruby: 300 }
      : { gold: 80000, ruby: 30 };
    G.grant(reward);
    var label = reward.ruby && !reward.gold
      ? '💎 ' + reward.ruby + ' (รางวัลใหญ่ครบ 7 วัน!)'
      : '🪙 ' + G.fmt(reward.gold) + ' · 💎 ' + reward.ruby;
    G.toast('📅 เช็คอินวันที่ ' + day + ': ' + label);
    return { day: day, reward: reward, summary: 'เช็คอินวันที่ ' + day + ' รับ ' + label };
  }

  // ---------------------------------------------------------------
  //  HUB TOPBAR CURRENCY WIRING — tag .pill elements with data-cur
  // ---------------------------------------------------------------
  // The hub topbar has 3 .pill: 🪙 gold, 💎 ruby, ⚡ energy. We detect which is which
  // by the leading .ic emoji, set data-cur on the pill, and let GAME.refresh() drive its text.
  var ICON_TO_CUR = {
    '🪙': 'gold', '💰': 'gold',
    '💎': 'ruby',
    '⚡': 'energy',
    '🎫': 'eventCoin', '🏅': 'arenaCoin', '🏰': 'guildCoin'
  };

  function wireCurrencyPills(root) {
    var scope = root || document;
    var pills = scope.querySelectorAll('.curr .pill');
    pills.forEach(function (pill) {
      if (pill.hasAttribute('data-cur')) return; // idempotent
      var ic = pill.querySelector('.ic');
      var emoji = ic ? ic.textContent.trim() : '';
      var cur = ICON_TO_CUR[emoji];
      if (!cur) return;
      // ensure there is a dedicated value node so the .ic emoji is preserved.
      // The shell renders pills as: <span class="ic">🪙</span>1,240,500
      // GAME.refresh() sets el.textContent on the [data-cur] node, so we must put
      // data-cur on a child value span, NOT on the whole pill (which holds the icon).
      var valueNode = pill.querySelector('.econ-val');
      if (!valueNode) {
        valueNode = document.createElement('span');
        valueNode.className = 'econ-val';
        // move every node after the .ic into the value span
        var moving = [];
        var seenIc = false;
        // childNodes lacks forEach in some engines — slice to a real array first
        Array.prototype.slice.call(pill.childNodes).forEach(function (n) {
          if (n === ic) { seenIc = true; return; }
          if (seenIc || !ic) moving.push(n);
        });
        if (!moving.length) {
          // no trailing text (icon-only pill) — just append empty value node
          pill.appendChild(valueNode);
        } else {
          pill.insertBefore(valueNode, moving[0]);
          moving.forEach(function (n) { valueNode.appendChild(n); });
        }
      }
      valueNode.setAttribute('data-cur', cur);
    });
  }

  // wire the hub specifically (the prompt asks to enhance the hub topbar pills),
  // and opportunistically tag any other visible .curr .pill that match by icon.
  function wireAll() {
    var hub = document.getElementById('hub');
    if (hub) wireCurrencyPills(hub);
    // other screens have their own static pills (summon/shop/modes/arena…) —
    // tagging by icon is safe + makes them live too, without touching their render fns.
    document.querySelectorAll('.screen .topbar .curr').forEach(function (curr) {
      wireCurrencyPills(curr);
    });
    G.refresh();
  }

  // ---------------------------------------------------------------
  //  Expose ECON
  // ---------------------------------------------------------------
  window.ECON = {
    ENERGY_COST: ENERGY_COST,
    REGEN_EVERY_MS: REGEN_EVERY_MS,
    canEnter: canEnter,
    stageReward: stageReward,
    dailyLogin: dailyLogin,
    claimCheckin: claimCheckin,
    regenNote: regenNote,
    startRegen: startRegen,
    stopRegen: stopRegen,
    wirePills: wireAll
  };

  // ---------------------------------------------------------------
  //  Boot
  // ---------------------------------------------------------------
  function boot() {
    wireAll();          // tag pills + refresh displays
    dailyLogin();       // grant once-per-day login reward (idempotent by date)
    startRegen();       // begin demo regen
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // Re-wire whenever the shell switches screens, so newly-shown topbars become live.
  // We wrap window.go idempotently (guarded so multiple feat modules don't double-wrap badly).
  if (window.go && !window.go.__econWrapped) {
    var _origGo = window.go;
    window.go = function (id) {
      var r = _origGo.apply(this, arguments);
      try { wireAll(); } catch (e) {}
      return r;
    };
    window.go.__econWrapped = true;
  }
})();
