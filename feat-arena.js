/* feat-arena.js — makes the ARENA screen (#arena) functional.
 * Loads AFTER game.html + game-core.js. Overrides ONLY window.renderArena and
 * its own helpers (all prefixed `arena*`). Uses window.GAME for all state,
 * currency, modals, toasts, persistence. Does NOT touch other screens.
 *
 * Behaviour:
 *  - keeps the 3 opponents
 *  - "ท้าสู้" runs a quick simulated match (team power vs opponent power + variance)
 *  - GAME.modal shows win/lose result
 *  - win: rating += ~20, GAME.grant({arenaCoin:50}) ; lose: rating -= ~12
 *  - rating/rank stored in GAME.state (arenaRating), rank header updates by tier
 *  - tickets 5/5, -1 per fight (stored in GAME.state.arenaTickets)
 */
(function () {
  if (!window.GAME) return;
  var G = window.GAME, S = G.state;

  // ---- persistent arena state (additive — never clobber existing) ----
  if (typeof S.arenaRating !== 'number') S.arenaRating = 2340; // matches mockup
  if (typeof S.arenaTickets !== 'number') S.arenaTickets = 5;
  var TICKET_MAX = 5;
  if (typeof S.arenaWins !== 'number') S.arenaWins = 47;
  if (typeof S.arenaLosses !== 'number') S.arenaLosses = 12;
  G.save();

  // ---- one-time scoped styles ----
  if (!document.getElementById('arenaFeatCss')) {
    var st = document.createElement('style');
    st.id = 'arenaFeatCss';
    st.textContent = [
      '.arena-hero{display:flex;align-items:center;gap:11px;padding:11px 14px;border-radius:14px;margin-bottom:12px;background:linear-gradient(90deg,rgba(139,92,246,.28),rgba(245,196,81,.06) 60%,transparent)}',
      '.arena-hero .ah-medal{font-size:30px;flex:none;filter:drop-shadow(0 0 8px rgba(245,196,81,.5))}',
      '.arena-hero .ah-tier{font-weight:900;font-size:17px;background:linear-gradient(180deg,#fff,var(--gold));-webkit-background-clip:text;background-clip:text;color:transparent}',
      '.arena-hero .ah-sub{font-size:11px;color:var(--muted);margin-top:1px}',
      '.arena-hero .ah-rt{text-align:right;flex:none}',
      '.arena-hero .ah-rating{font-weight:800;font-size:15px;color:var(--gold)}',
      '.arena-hero .ah-tk{font-size:11px;color:var(--muted);margin-top:2px}',
      '.arena-hero .ah-bar{margin-top:6px}',
      '.arena-vs{display:inline-block;padding:1px 7px;border-radius:8px;font-size:10px;font-weight:800;margin-left:6px}',
      '.arena-vs.up{background:rgba(52,211,153,.18);color:#34d399}',
      '.arena-vs.even{background:rgba(245,196,81,.16);color:var(--gold)}',
      '.arena-vs.down{background:rgba(239,68,68,.18);color:#f87171}',
      '.arena-res{text-align:center;min-width:300px}',
      '.arena-res .arena-ttl{font-size:24px;font-weight:900;margin:2px 0 2px}',
      '.arena-res .arena-ttl.win{background:linear-gradient(180deg,#fff,var(--gold));-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 26px rgba(245,196,81,.35)}',
      '.arena-res .arena-ttl.lose{color:#f87171}',
      '.arena-res .arena-sub{color:var(--muted);font-size:12px;margin-bottom:12px}',
      '.arena-pwline{display:flex;align-items:center;justify-content:center;gap:10px;font-size:13px;margin:4px 0 12px}',
      '.arena-pwline b{color:var(--ink)}',
      '.arena-pwline .me{color:#c4b5fd}.arena-pwline .vs{color:var(--muted);font-size:11px}.arena-pwline .foe{color:#f3a3a3}',
      '.arena-rew{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:8px 0 14px}',
      '.arena-chip{display:flex;align-items:center;gap:6px;padding:7px 13px;border-radius:12px;background:#1b1b2b;border:1px solid var(--line);font-size:12.5px;font-weight:700}',
      '.arena-chip .pos{color:#34d399}.arena-chip .neg{color:#f87171}',
      '.arena-empty{color:var(--muted);font-size:12px;text-align:center;padding:10px}'
    ].join('');
    document.head.appendChild(st);
  }

  // ---- rank tiers by rating ----
  // returns {key, th, en, color, next, floor}
  var TIERS = [
    { floor: 0,    th: 'บรอนซ์',     en: 'Bronze',   color: '#b08d57' },
    { floor: 800,  th: 'ซิลเวอร์',   en: 'Silver',   color: '#c9d1d9' },
    { floor: 1400, th: 'โกลด์',      en: 'Gold',     color: '#f5c451' },
    { floor: 2000, th: 'แพลทินัม',   en: 'Platinum', color: '#5fd3c4' },
    { floor: 2600, th: 'ไดมอนด์',    en: 'Diamond',  color: '#8b5cf6' },
    { floor: 3200, th: 'มาสเตอร์',   en: 'Master',   color: '#ec4899' }
  ];
  function arenaTier(r) {
    var t = TIERS[0], idx = 0;
    for (var i = 0; i < TIERS.length; i++) { if (r >= TIERS[i].floor) { t = TIERS[i]; idx = i; } }
    var next = TIERS[idx + 1] || null;
    // sub-division (III/II/I) within a tier band of 600 rating, except Master
    var roman = '';
    if (next) {
      var band = next.floor - t.floor;
      var into = (r - t.floor) / band;          // 0..1
      var div = into < 0.34 ? 'III' : (into < 0.67 ? 'II' : 'I');
      roman = ' ' + div;
    }
    return { th: t.th, en: t.en, color: t.color, roman: roman, next: next };
  }
  // synthetic server rank — higher rating = lower (better) number
  function arenaRankNo(r) { return Math.max(1, Math.round(9000 - r * 2.1)); }

  // ---- team power (mirrors game.html power() over owned heroes) ----
  function arenaHeroPower(h) {
    return Math.round(h.hp * 0.3 + h.atk * 3 + h.def * 2 + h.spd * 4);
  }
  function arenaTeamPower() {
    var heroes = G.heroes(), owned = G.ownedList(), total = 0, picks = [];
    owned.forEach(function (id) {
      var h = heroes.find(function (x) { return x.id === id; });
      if (h) picks.push({ id: id, p: arenaHeroPower(h) });
    });
    // best 5 = the team that fights
    picks.sort(function (a, b) { return b.p - a.p; });
    picks.slice(0, 5).forEach(function (x) { total += x.p; });
    // if player owns <5, fall back to a believable rating-scaled power
    if (picks.length < 5) total = Math.max(total, 5200 + (S.arenaRating - 1400) * 0.9);
    return Math.round(total);
  }

  // ---- the 3 opponents (kept) ----
  var ARENA_OPP = [
    { name: 'ดวงใจ',  power: 7820, tier: 'Master I',   ic: 'hero_phisuea_samut' },
    { name: 'ก้องภพ', power: 7410, tier: 'Diamond I',  ic: 'hero_nang_laweng' },
    { name: 'นภัส',   power: 7180, tier: 'Diamond II', ic: 'hero_ma_nin_mangkorn' }
  ];

  // ---- update the static topbar pill in #arena ----
  function arenaUpdateHeader() {
    var sec = document.getElementById('arena');
    if (!sec) return;
    var t = arenaTier(S.arenaRating);
    var pill = sec.querySelector('.topbar .curr .pill');
    if (pill) {
      pill.innerHTML = '<span class="ic">🏅</span> ' + t.en + t.roman +
        ' · #' + G.fmt(arenaRankNo(S.arenaRating));
    }
  }

  // ---- main render (override) ----
  window.renderArena = function () {
    var sec = document.getElementById('arena');
    if (!sec) return;
    arenaUpdateHeader();

    var list = document.getElementById('arenaList');
    var body = list ? list.parentElement : sec.querySelector('.body');
    if (!body) return;

    var t = arenaTier(S.arenaRating);
    var myPow = arenaTeamPower();
    var toMaster = TIERS[5].floor - S.arenaRating; // rating gap to Master

    var nextLine = t.en === 'Master'
      ? 'อันดับสูงสุด — รักษาบัลลังก์มาสเตอร์ไว้ให้ได้'
      : (toMaster > 0
          ? 'อีก ' + G.fmt(toMaster) + ' เรตติ้งเพื่อขึ้น Master'
          : 'พร้อมเลื่อนชั้นแล้ว!');

    // tier progress (within current band)
    var bandLo = 0, bandHi = 1;
    for (var i = 0; i < TIERS.length; i++) {
      if (S.arenaRating >= TIERS[i].floor) {
        bandLo = TIERS[i].floor;
        bandHi = (TIERS[i + 1] || { floor: TIERS[i].floor + 600 }).floor;
      }
    }
    var bandPct = Math.max(0, Math.min(100, Math.round((S.arenaRating - bandLo) / (bandHi - bandLo) * 100)));

    var headHtml =
      '<div class="arena-hero glass">' +
        '<div class="ah-medal">🏆</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="ah-tier">อันดับของคุณ: ' + t.th + t.roman +
            ' <span style="font-size:11px;color:' + t.color + ';font-weight:700">' + t.en + t.roman + '</span></div>' +
          '<div class="ah-sub">ชนะ ' + S.arenaWins + ' · แพ้ ' + S.arenaLosses +
            ' · พลังทีม ' + G.fmt(myPow) + ' — ' + nextLine + '</div>' +
          '<div class="progress ah-bar"><i style="width:' + bandPct + '%"></i></div>' +
        '</div>' +
        '<div class="ah-rt">' +
          '<div class="ah-rating">☆ ' + G.fmt(S.arenaRating) + '</div>' +
          '<div class="ah-tk">🎟️ ตั๋ว ' + S.arenaTickets + '/' + TICKET_MAX + '</div>' +
        '</div>' +
      '</div>';

    var noTk = S.arenaTickets <= 0;
    var rowsHtml = ARENA_OPP.map(function (o, idx) {
      var diff = o.power - myPow;
      var vsCls = diff > 350 ? 'down' : (diff < -350 ? 'up' : 'even');
      var vsTxt = diff > 350 ? 'แกร่งกว่า' : (diff < -350 ? 'ได้เปรียบ' : 'สูสี');
      return '<div class="glass rankrow">' +
        '<img src="portraits/' + o.ic + '.jpg" alt="">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;font-size:13px">' + o.name +
            ' <span class="badge2">' + o.tier + '</span>' +
            '<span class="arena-vs ' + vsCls + '">' + vsTxt + '</span></div>' +
          '<div class="pw">พลังทีม ' + o.power.toLocaleString() + '</div>' +
        '</div>' +
        '<button class="btn" style="padding:7px 18px;font-size:12px"' + (noTk ? ' disabled' : '') +
          ' onclick="arenaFight(' + idx + ')">ท้าสู้</button>' +
      '</div>';
    }).join('');

    var ticketNote = noTk
      ? '<div class="arena-empty">🎟️ ตั๋วหมดแล้ว — ฟื้นฟูอัตโนมัติเมื่อรีเซ็ตรายวัน</div>'
      : '';

    body.innerHTML = headHtml +
      '<div class="h2" style="font-size:13px;margin:12px 0 8px">เลือกคู่ต่อสู้ ' +
        '<span class="sub">ใช้ตั๋ว 1 ใบต่อการท้าสู้</span></div>' +
      '<div id="arenaList">' + rowsHtml + '</div>' +
      ticketNote;
  };

  // ---- run a simulated match ----
  window.arenaFight = function (idx) {
    var o = ARENA_OPP[idx];
    if (!o) return;
    if (S.arenaTickets <= 0) { G.toast('🎟️ ตั๋วไม่พอ — รอรีเซ็ตรายวัน'); return; }

    // spend a ticket
    S.arenaTickets -= 1;

    var myPow = arenaTeamPower();
    // variance ±18% on each side
    var myRoll  = myPow  * (0.82 + Math.random() * 0.36);
    var foeRoll = o.power * (0.82 + Math.random() * 0.36);
    var win = myRoll >= foeRoll;

    var delta, coins = 0;
    if (win) {
      delta = 18 + Math.floor(Math.random() * 6); // ~20
      S.arenaRating += delta;
      S.arenaWins += 1;
      coins = 50;
      G.grant({ arenaCoin: coins }); // grant() saves + refreshes
    } else {
      delta = 10 + Math.floor(Math.random() * 6); // ~12
      S.arenaRating = Math.max(0, S.arenaRating - delta);
      S.arenaLosses += 1;
    }
    G.save();

    var t = arenaTier(S.arenaRating);
    var ttlCls = win ? 'win' : 'lose';
    var ttlTxt = win ? '⚔️ ชัยชนะ!' : '💀 ปราชัย';
    var ratingLine = win
      ? '<span class="pos">+' + delta + ' เรตติ้ง</span>'
      : '<span class="neg">−' + delta + ' เรตติ้ง</span>';

    var rewardHtml = win
      ? '<div class="arena-chip"><span>🏅</span><span class="pos">+' + coins + ' เหรียญสังเวียน</span></div>' +
        '<div class="arena-chip"><span>☆</span>' + ratingLine + '</div>'
      : '<div class="arena-chip"><span>☆</span>' + ratingLine + '</div>' +
        '<div class="arena-chip"><span>🛡️</span><span>ลองจัดทีมใหม่</span></div>';

    var html =
      '<div class="arena-res">' +
        '<div class="arena-ttl ' + ttlCls + '">' + ttlTxt + '</div>' +
        '<div class="arena-sub">ท้าสู้กับ <b style="color:var(--ink)">' + o.name + '</b> · ' + o.tier + '</div>' +
        '<div class="arena-pwline">' +
          '<span class="me">ทีมคุณ <b>' + G.fmt(Math.round(myRoll)) + '</b></span>' +
          '<span class="vs">VS</span>' +
          '<span class="foe">' + o.name + ' <b>' + G.fmt(Math.round(foeRoll)) + '</b></span>' +
        '</div>' +
        '<div class="arena-rew">' + rewardHtml + '</div>' +
        '<div class="arena-sub" style="margin-bottom:14px">อันดับใหม่: <b style="color:' + t.color + '">' +
          t.th + t.roman + '</b> · เรตติ้ง <b style="color:var(--gold)">' + G.fmt(S.arenaRating) + '</b>' +
          ' · 🎟️ ' + S.arenaTickets + '/' + TICKET_MAX + '</div>' +
        '<button class="btn" onclick="GAME.closeModal();renderArena()">รับทราบ</button>' +
      '</div>';

    G.modal(html, function () { window.renderArena(); });
    G.toast(win ? '🏆 ชนะ ' + o.name + ' — +50 เหรียญสังเวียน'
                : '💢 แพ้ ' + o.name + ' — −' + delta + ' เรตติ้ง');
    window.renderArena();
  };

  // ---- init: re-render now (header pill + body), idempotent ----
  try { window.renderArena(); } catch (e) {}
})();
