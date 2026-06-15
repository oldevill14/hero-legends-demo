/* feat-gacha.js — SUMMON / gacha screen (id="summon") made functional.
 * Loads AFTER game.html + game-core.js. Vanilla JS, no libs.
 *
 * Overrides window.renderSummon and wires the ×1 / ×10 pull buttons.
 *   ×1  = 💎300        ·  ×10 = 💎2700 (10th guaranteed Epic+)
 * Roll by rarity:  Mythic 1% · Legendary 4% · Epic 15% · (else → Epic, lowest tier)
 * PITY: GAME.state.pity counts pulls without a Mythic → guaranteed Mythic at 100.
 * Spend via GAME.spend('ruby',n); NEW heroes via GAME.own(id); dupes → shards.
 * All currency/state/persistence/UI go through window.GAME.
 */
(function () {
  if (!window.GAME) return;

  // ---------- config ----------
  var COST1 = 300, COST10 = 2700, PITY_MAX = 100;
  var RATE = { Mythic: 0.01, Legendary: 0.04, Epic: 0.15 }; // remainder → Epic (lowest existing tier)
  var GLOW = { Mythic: 'var(--myth)', Legendary: 'var(--leg)', Epic: 'var(--epic)' };
  var SHARD_BY_RARITY = { Mythic: 50, Legendary: 30, Epic: 15 }; // dupe → shards

  // ---------- one-time CSS (prefixed gac-) ----------
  if (!document.getElementById('gac-style')) {
    var st = document.createElement('style');
    st.id = 'gac-style';
    st.textContent = [
      '@keyframes gac-pop{0%{opacity:0;transform:translateY(14px) scale(.86)}60%{transform:translateY(0) scale(1.04)}100%{opacity:1;transform:none}}',
      '@keyframes gac-glow{0%,100%{filter:brightness(1)}50%{filter:brightness(1.22)}}',
      '@keyframes gac-shine{from{background-position:-180% 0}to{background-position:180% 0}}',
      '.gac-resultwrap{text-align:center;min-width:300px}',
      '.gac-title{font-size:17px;font-weight:900;margin:0 0 2px;background:linear-gradient(180deg,#fff,var(--gold));-webkit-background-clip:text;background-clip:text;color:transparent}',
      '.gac-sub{font-size:11px;color:var(--muted);margin-bottom:12px}',
      '.gac-cards{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:560px}',
      '.gac-card{position:relative;width:88px;border-radius:11px;overflow:hidden;border:2px solid var(--line);background:#11111d;opacity:0;animation:gac-pop .42s ease forwards}',
      '.gac-card.Mythic{border-color:var(--myth);box-shadow:0 0 16px rgba(168,85,247,.55);animation:gac-pop .42s ease forwards,gac-glow 1.8s ease-in-out infinite 0.5s}',
      '.gac-card.Legendary{border-color:var(--leg);box-shadow:0 0 14px rgba(245,158,11,.45)}',
      '.gac-card.Epic{border-color:var(--epic);box-shadow:0 0 10px rgba(236,72,153,.4)}',
      '.gac-card img{width:100%;height:108px;object-fit:cover;object-position:top center;display:block}',
      '.gac-card .gac-ele{position:absolute;top:4px;left:4px;width:13px;height:13px;border-radius:50%;border:1px solid #fff6}',
      '.gac-card .gac-tag{position:absolute;top:4px;right:4px;font-size:8px;font-weight:900;padding:1px 5px;border-radius:7px}',
      '.gac-tag.new{background:var(--gold);color:#3a2600}',
      '.gac-tag.dupe{background:#2a2342;color:#c4b5fd;border:1px solid var(--line)}',
      '.gac-card .gac-nm{padding:12px 4px 4px;font-size:9.5px;font-weight:800;line-height:1.15;background:linear-gradient(transparent,rgba(0,0,0,.92))}',
      '.gac-card .gac-rr{font-size:7.5px;font-weight:700;display:block;margin-top:1px}',
      '.gac-card .gac-shard{position:absolute;left:0;right:0;bottom:0;font-size:8px;font-weight:800;color:var(--gold);background:rgba(0,0,0,.55);padding:1px 0}',
      '.gac-best{margin:12px 0 2px;font-size:12px;font-weight:800;color:var(--gold)}',
      '.gac-pitybar{height:6px;border-radius:5px;background:#0c0c16;overflow:hidden;margin:14px 0 4px;max-width:520px;width:74%}',
      '.gac-pitybar>i{display:block;height:100%;background:linear-gradient(90deg,var(--myth),#c4b5fd)}',
      '.gac-pitytxt{font-size:10px;color:var(--muted)}',
      '.gac-shine{background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.18) 50%,transparent 70%);background-size:220% 100%;animation:gac-shine 1.6s linear infinite}',
      '.gac-actions{margin-top:14px;display:flex;gap:10px;justify-content:center}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ---------- helpers ----------
  function ELEC(e) { return (window.ELE && window.ELE[e]) || 'var(--muted)'; }
  function heroes() { return GAME.heroes(); }
  function byRarity(r) { return heroes().filter(function (h) { return h.r === r; }); }
  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function rarityRank(r) { return { Mythic: 3, Legendary: 2, Epic: 1 }[r] || 0; }

  // roll a single rarity from RATE; anything not Mythic/Legendary/Epic falls to lowest tier (Epic)
  function rollRarity() {
    var x = Math.random();
    if (x < RATE.Mythic) return 'Mythic';
    if (x < RATE.Mythic + RATE.Legendary) return 'Legendary';
    if (x < RATE.Mythic + RATE.Legendary + RATE.Epic) return 'Epic';
    return 'Epic'; // remainder → lowest existing rarity so a hero is always produced
  }

  // pull once; opts.floor forces a minimum rarity (Epic+), opts.forceMythic forces Mythic (pity)
  function pullOne(opts) {
    opts = opts || {};
    var rarity;
    if (opts.forceMythic) rarity = 'Mythic';
    else {
      rarity = rollRarity();
      if (opts.floor && rarityRank(rarity) < rarityRank(opts.floor)) rarity = opts.floor;
    }
    var pool = byRarity(rarity);
    if (!pool.length) { // safety: degrade to any available rarity
      pool = heroes(); rarity = pool.length ? pool[0].r : 'Epic';
    }
    var hero = rand(pool);

    // ---- pity bookkeeping ----
    var st = GAME.state;
    if (typeof st.pity !== 'number') st.pity = 0;
    if (rarity === 'Mythic') st.pity = 0; else st.pity += 1;

    // ---- new vs dupe ----
    var isNew = !GAME.isOwned(hero.id);
    var shardGain = 0;
    if (isNew) {
      GAME.own(hero.id);
    } else {
      shardGain = SHARD_BY_RARITY[rarity] || 10;
      var inv = st.inventory || (st.inventory = {});
      if (!inv.shard) inv.shard = {};
      inv.shard[hero.id] = (inv.shard[hero.id] || 0) + shardGain;
    }
    return { hero: hero, rarity: rarity, isNew: isNew, shard: shardGain };
  }

  // pity-aware multi-pull: forces a guaranteed Mythic on the pull that crosses PITY_MAX
  function pullBatch(n, guaranteeEpicOnLast) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var st = GAME.state;
      if (typeof st.pity !== 'number') st.pity = 0;
      var opts = {};
      if (st.pity >= PITY_MAX - 1) opts.forceMythic = true;       // this pull hits/exceeds pity → Mythic
      else if (guaranteeEpicOnLast && i === n - 1) {
        var best = out.reduce(function (m, r) { return Math.max(m, rarityRank(r.rarity)); }, 0);
        if (best < rarityRank('Epic')) opts.floor = 'Epic';        // 10th guaranteed Epic+
        else opts.floor = 'Epic';                                  // never below Epic anyway
      }
      out.push(pullOne(opts));
    }
    GAME.save();
    GAME.refresh();
    return out;
  }

  // ---------- result modal ----------
  function showResults(results) {
    var best = results.reduce(function (m, r) { return Math.max(m, rarityRank(r.rarity)); }, 0);
    var bestName = { 3: 'Mythic ✦', 2: 'Legendary', 1: 'Epic' }[best] || '';
    var newCount = results.filter(function (r) { return r.isNew; }).length;

    var cards = results.map(function (r, i) {
      var h = r.hero;
      var stars = '★'.repeat(Math.min(5, h.star)) + (h.star > 5 ? '+' : '');
      var tag = r.isNew
        ? '<span class="gac-tag new">NEW</span>'
        : '<span class="gac-tag dupe">DUP</span>';
      var shard = r.isNew ? '' : '<span class="gac-shard">+' + r.shard + ' เศษ</span>';
      return '<div class="gac-card ' + r.rarity + '" style="animation-delay:' + (i * 0.06) + 's">'
        + '<img src="portraits/' + h.id + '.jpg" alt="">'
        + '<span class="gac-ele" style="background:' + ELEC(h.e) + '"></span>'
        + tag
        + '<div class="gac-nm">' + h.th
        + '<span class="gac-rr" style="color:' + GLOW[r.rarity] + '">' + r.rarity + ' · ' + stars + '</span>'
        + '</div>' + shard + '</div>';
    }).join('');

    var pity = GAME.state.pity || 0;
    var pct = Math.min(100, Math.round((pity / PITY_MAX) * 100));

    var html =
      '<div class="gac-resultwrap">'
      + '<div class="gac-title gac-shine">✦ ผลการอัญเชิญ ✦</div>'
      + '<div class="gac-sub">วิญญาณวีรชนปรากฏจากเงาแห่งแสง</div>'
      + '<div class="gac-cards">' + cards + '</div>'
      + '<div class="gac-best">สุดยอด: ' + bestName + ' · ใหม่ ' + newCount + ' ตัว</div>'
      + '<div class="gac-pitybar"><i style="width:' + pct + '%"></i></div>'
      + '<div class="gac-pitytxt">Pity ' + pity + '/' + PITY_MAX + ' — อีก ' + (PITY_MAX - pity) + ' ครั้งรับประกัน Mythic</div>'
      + '<div class="gac-actions">'
      + '<button class="btn" id="gac-again">อัญเชิญอีก</button>'
      + '<button class="back glass" id="gac-close">ปิด</button>'
      + '</div>'
      + '</div>';

    var box = GAME.modal(html, function () { if (window.renderSummon) renderSummon(); });
    var closeBtn = box.querySelector('#gac-close');
    var againBtn = box.querySelector('#gac-again');
    if (closeBtn) closeBtn.onclick = function () { GAME.closeModal(); if (window.renderSummon) renderSummon(); };
    if (againBtn) againBtn.onclick = function () {
      GAME.closeModal();
      doPull(results.length >= 10 ? 10 : 1);
    };
  }

  // ---------- pull entry points ----------
  function doPull(count) {
    var cost = count >= 10 ? COST10 : COST1;
    if (!GAME.spend('ruby', cost)) return; // GAME.spend toasts + blocks if not enough
    var results = count >= 10 ? pullBatch(10, true) : pullBatch(1, false);
    showResults(results);
  }
  window.gacPull = doPull; // exposed for inline onclick fallback

  // ---------- render the SUMMON screen ----------
  window.renderSummon = function () {
    var body = document.querySelector('#summon .body');
    if (!body) return;

    // ensure the ruby pill in the topbar reads live currency
    var pill = document.querySelector('#summon .topbar .curr .pill');
    if (pill) {
      var span = pill.querySelector('[data-cur="ruby"]');
      if (!span) {
        // keep the 💎 icon, replace the trailing number text with a live data-cur node
        pill.innerHTML = '<span class="ic">💎</span><span data-cur="ruby"></span>';
      }
    }

    var st = GAME.state;
    if (typeof st.pity !== 'number') st.pity = 0;
    var pct = Math.min(100, Math.round((st.pity / PITY_MAX) * 100));
    var ruby = st.ruby || 0;
    var can1 = ruby >= COST1, can10 = ruby >= COST10;

    body.innerHTML =
      '<div class="banner"><img src="portraits/hero_nang_laweng.jpg" alt="">'
      + '<div class="cap"><b>มหาศึกนางละเวง</b><br><span>★ Limited Banner · Rate Up: นางละเวง (Mythic)</span></div></div>'
      + '<div class="pulls">'
      + '<div class="pull one glass" id="gac-one" style="' + (can1 ? '' : 'opacity:.45;cursor:default') + '">อัญเชิญ ×1<br><small style="color:var(--gold)">💎 ' + COST1 + '</small></div>'
      + '<div class="pull ten" id="gac-ten" style="' + (can10 ? '' : 'opacity:.5;cursor:default') + '">อัญเชิญ ×10<br><small>💎 ' + COST10.toLocaleString() + '</small></div>'
      + '</div>'
      + '<div class="gac-pitybar" style="margin:14px auto 4px"><i style="width:' + pct + '%"></i></div>'
      + '<div class="gac-pitytxt">Pity ' + st.pity + '/' + PITY_MAX + ' — อีก ' + (PITY_MAX - st.pity) + ' ครั้งรับประกัน Mythic</div>'
      + '<div class="rates">เรท: Mythic 1% · Legendary 4% · Epic 15% · ×10 รับประกัน Epic+ · Pity 100 ครั้ง รับประกัน Mythic</div>';

    var one = body.querySelector('#gac-one');
    var ten = body.querySelector('#gac-ten');
    if (one) one.onclick = function () { doPull(1); };
    if (ten) ten.onclick = function () { doPull(10); };

    GAME.refresh();
  };

  // ---------- wire go('summon') to re-render + initial paint (idempotent) ----------
  if (!window.__gacHooked) {
    window.__gacHooked = true;
    var origGo = window.go;
    if (typeof origGo === 'function') {
      window.go = function (id) {
        var r = origGo.apply(this, arguments);
        if (id === 'summon' && window.renderSummon) { try { renderSummon(); } catch (e) {} }
        return r;
      };
    }
  }

  // if the summon screen is currently visible, paint it now
  var scr = document.getElementById('summon');
  if (scr && scr.classList.contains('on')) window.renderSummon();
})();
