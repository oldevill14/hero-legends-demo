/* feat-shop.js — makes the SHOP screen (#shop) functional.
 * Loads AFTER game.html + game-core.js. Overrides window.renderShop + window.shopTab.
 * Uses window.GAME for ALL state / currency / persistence / modal / toast.
 *
 * Tabs:
 *   deals    — free daily gift (once/day, tracks GAME.state.lastClaim) + buy items with ruby/gold
 *   packs    — value packs purchased with ruby (one-time packs flagged owned in GAME.state.shopBought)
 *   exchange — convert arenaCoin / guildCoin / eventCoin into shards & items
 * Every purchase confirms via GAME.modal, spends via GAME.spend, grants via GAME.grant,
 * blocks when currency is insufficient, and reflects balances with data-cur.
 */
(function () {
  if (!window.GAME) return;
  var G = window.GAME, S = G.state;

  // --- persistent shop sub-state (additive, never deletes existing keys) ---
  if (typeof S.lastClaim === 'undefined') S.lastClaim = 0;     // epoch day of last free claim
  if (!S.shopBought) S.shopBought = {};                        // one-time pack ids -> true
  G.save();

  function today() { return Math.floor(Date.now() / 86400000); } // UTC day index
  function claimedToday() { return S.lastClaim === today(); }

  // currency icons + short labels (Thai)
  var CUR = {
    gold: ['🪙', 'ทอง'], ruby: ['💎', 'เพชร'], energy: ['⚡', 'พลังงาน'],
    arenaCoin: ['🏅', 'เหรียญสังเวียน'], guildCoin: ['🏰', 'เหรียญกิลด์'], eventCoin: ['🎫', 'เหรียญอีเวนต์']
  };
  function bal(cur) { return cur === 'energy' ? (S.energy + '/' + S.energyMax) : G.fmt(S[cur]); }
  function ic(cur) { return (CUR[cur] || ['•'])[0]; }
  function costStr(cur, n) { return ic(cur) + ' ' + G.fmt(n); }
  function rewardStr(obj) {
    return Object.keys(obj).map(function (k) { return ic(k) + ' ×' + G.fmt(obj[k]); }).join(' · ');
  }

  // inventory helpers (shards live in GAME.state.inventory.shard:{key:n})
  function addShard(key, n) {
    var inv = S.inventory || (S.inventory = { shard: {}, equip: [], mats: {} });
    if (!inv.shard) inv.shard = {};
    inv.shard[key] = (inv.shard[key] || 0) + n; G.save();
  }
  function totalShards() {
    var sh = (S.inventory && S.inventory.shard) || {}, t = 0;
    for (var k in sh) t += sh[k] || 0; return t;
  }

  // inject scoped styles (all classes prefixed shop-)
  if (!document.getElementById('shop-style')) {
    var st = document.createElement('style'); st.id = 'shop-style';
    st.textContent = [
      '.shop-bal{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}',
      '.shop-tag{font-size:9px;font-weight:800;padding:2px 7px;border-radius:8px;margin-left:6px}',
      '.shop-tag.free{background:var(--nature);color:#06210f}',
      '.shop-tag.hot{background:var(--epic);color:#fff}',
      '.shop-tag.own{background:var(--line);color:var(--muted)}',
      '.shop-rate{font-size:10px;color:var(--muted);margin:4px 0 10px;display:flex;gap:6px;align-items:center}',
      '.shop-mrow{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px}',
      '.shop-mrow b{color:var(--gold)}',
      '.shop-mbtns{display:flex;gap:8px;margin-top:16px;justify-content:flex-end}',
      '.shop-amt{display:flex;gap:6px;justify-content:center;margin:10px 0 4px}',
      '.shop-amt .a{padding:5px 13px;border-radius:14px;font-size:12px;font-weight:800;cursor:pointer;background:var(--panel2);border:1px solid var(--line)}',
      '.shop-amt .a.on{background:linear-gradient(135deg,var(--glow),var(--glow2));border-color:transparent}',
      '.shop-card .rt{min-width:96px;text-align:right}'
    ].join('');
    document.head.appendChild(st);
  }

  // ensure the topbar currency pills reflect live balances via data-cur
  function wireTopbar() {
    var shop = document.getElementById('shop'); if (!shop) return;
    var curr = shop.querySelector('.topbar .curr');
    if (curr && !curr.classList.contains('shop-bal')) {
      curr.classList.add('shop-bal');
      curr.innerHTML =
        '<div class="pill glass"><span class="ic">🪙</span><span data-cur="gold"></span></div>' +
        '<div class="pill glass"><span class="ic">💎</span><span data-cur="ruby"></span></div>';
    }
  }

  // ---------------------------------------------------------------- modal
  // generic confirm: title, body html, cost {cur,n} or null (free), onConfirm()
  function confirmBuy(opts) {
    var afford = !opts.cost || (S[opts.cost.cur] || 0) >= opts.cost.n;
    var box = G.modal(
      '<div style="font-weight:900;font-size:16px;margin-bottom:8px">' + opts.title + '</div>' +
      '<div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:6px">' + (opts.body || '') + '</div>' +
      (opts.cost
        ? '<div class="shop-mrow"><span>ราคา</span><b>' + costStr(opts.cost.cur, opts.cost.n) + '</b></div>' +
          '<div class="shop-mrow"><span>คงเหลือ ' + (CUR[opts.cost.cur] || ['', ''])[1] + '</span><b ' +
          (afford ? '' : 'style="color:var(--fire)"') + '>' + bal(opts.cost.cur) + '</b></div>'
        : '') +
      (afford ? '' : '<div style="color:var(--fire);font-size:11px;margin-top:8px">⚠️ ' +
        (CUR[opts.cost.cur] || ['', 'สกุลเงิน'])[1] + 'ไม่พอ</div>') +
      '<div class="shop-mbtns">' +
        '<button class="back glass" id="shop-no">ยกเลิก</button>' +
        '<button class="btn" id="shop-yes" ' + (afford ? '' : 'disabled') + '>' +
          (opts.cost ? 'ยืนยันซื้อ' : 'รับเลย') + '</button>' +
      '</div>'
    );
    box.querySelector('#shop-no').onclick = function () { G.closeModal(); };
    var yes = box.querySelector('#shop-yes');
    if (yes && afford) yes.onclick = function () {
      if (opts.cost && !G.spend(opts.cost.cur, opts.cost.n)) { G.closeModal(); return; }
      try { opts.onConfirm(); } catch (e) {}
      G.closeModal();
      G.toast('✅ ' + opts.success);
      window.renderShop(window.__shopTab || 'deals'); // refresh card states
    };
  }

  // ---------------------------------------------------------------- DEALS
  // [icon, title, desc, cost(null=free) , reward, dealId]
  var DEALS = [
    { ic: '🎁', t: 'กล่องของขวัญรายวัน', d: 'แสงแห่งวิญญาณมอบให้ทุกวัน — ฟรี', cost: null,
      reward: { gold: 50000, ruby: 60 }, free: true },
    { ic: '💎', t: 'เพชร ×980 + โบนัส ×98', d: 'ดีลพิเศษ — แลกด้วยทอง', cost: { cur: 'gold', n: 600000 },
      reward: { ruby: 1078 } },
    { ic: '🪙', t: 'ทอง ×500,000', d: 'เติมคลังทองด่วน', cost: { cur: 'ruby', n: 480 },
      reward: { gold: 500000 } },
    { ic: '⚡', t: 'พลังงาน ×60', d: 'เติมพลังออกผจญภัยต่อ', cost: { cur: 'ruby', n: 100 },
      reward: { energy: 60 } },
    { ic: '🌟', t: 'เศษวิญญาณ ×20', d: 'ใช้ติดดาวฮีโร่ (★)', cost: { cur: 'ruby', n: 240 },
      reward: { __shard: 20 } }
  ];

  // ---------------------------------------------------------------- PACKS
  // value packs, mostly ruby-priced, some one-time
  var PACKS = [
    { id: 'starter', ic: '🌟', t: 'Starter Pack', d: 'เพชร ×1,000 + ทอง ×300,000 · ครั้งเดียว',
      cost: { cur: 'ruby', n: 0 }, reward: { ruby: 1000, gold: 300000 }, once: true, note: 'แพ็กต้อนรับ ฟรี!' },
    { id: 'monthly', ic: '📅', t: 'Monthly Pass', d: 'รับเพชรทันที ×900 + โบนัสรายวัน',
      cost: { cur: 'ruby', n: 600 }, reward: { ruby: 900, gold: 200000 } },
    { id: 'growth', ic: '📦', t: 'Growth Pack', d: 'ทอง ×800,000 + เศษวิญญาณ ×30',
      cost: { cur: 'ruby', n: 900 }, reward: { gold: 800000, __shard: 30 } },
    { id: 'shadow', ic: '🌑', t: 'แพ็กเงา · Shadow Pack', d: 'เพชร ×1,500 + พลังงาน ×120 · สุดคุ้ม',
      cost: { cur: 'ruby', n: 0 }, reward: { ruby: 1500, energy: 120 }, hot: true,
      // priced in gold for variety
      costGold: 1100000 }
  ];

  // ------------------------------------------------------------- EXCHANGE
  // convert event/arena/guild coins -> shards / items
  var EXCHANGE = [
    { ic: '🏅', t: 'เหรียญสังเวียน → เศษวิญญาณ', d: 'แลกเศษไปติดดาวฮีโร่',
      cur: 'arenaCoin', cost: 100, reward: { __shard: 10 } },
    { ic: '🏰', t: 'เหรียญกิลด์ → ทอง', d: 'แลกทองจากคลังกิลด์',
      cur: 'guildCoin', cost: 150, reward: { gold: 200000 } },
    { ic: '🎫', t: 'เหรียญอีเวนต์ → เศษนางละเวง', d: 'สะสมแลกฮีโร่ Mythic',
      cur: 'eventCoin', cost: 200, reward: { __shard: 25 } },
    { ic: '🏅', t: 'เหรียญสังเวียน → เพชร', d: 'แลกเพชรจากร้านสังเวียน',
      cur: 'arenaCoin', cost: 300, reward: { ruby: 150 } }
  ];

  // expand a reward object: translate __shard pseudo-key into a real shard grant
  function applyReward(reward) {
    var clean = {};
    for (var k in reward) {
      if (k === '__shard') { addShard('soul', reward[k]); }
      else clean[k] = reward[k];
    }
    if (Object.keys(clean).length) G.grant(clean);
  }
  function rewardLabel(reward) {
    var parts = [];
    for (var k in reward) {
      if (k === '__shard') parts.push('🌟 ×' + G.fmt(reward[k]) + ' เศษวิญญาณ');
      else parts.push(ic(k) + ' ×' + G.fmt(reward[k]));
    }
    return parts.join(' · ');
  }

  // ---------------------------------------------------------------- render
  var TABS = { deals: 'ดีลพิเศษ', packs: 'แพ็ก', exchange: 'แลกเปลี่ยน' };

  function renderDeals() {
    return DEALS.map(function (x, i) {
      var free = x.free, claimed = free && claimedToday();
      var rt, onclick, dis = '';
      if (free) {
        rt = claimed ? 'รับแล้ววันนี้' : 'รับฟรี';
        if (claimed) dis = 'disabled style="opacity:.45"';
      } else {
        rt = (x.cost.cur === 'ruby' ? 'ซื้อ' : 'แลก');
      }
      onclick = "window.__shopDeal(" + i + ")";
      var tag = free ? '<span class="shop-tag free">ฟรี</span>' : '';
      var sub = free
        ? (claimed ? 'รับแล้ว — กลับมาพรุ่งนี้' : 'รับ ' + rewardLabel(x.reward))
        : x.d + ' · รับ ' + rewardLabel(x.reward);
      var price = free ? '' : '<div class="rt" style="color:var(--gold);font-size:11px">' + costStr(x.cost.cur, x.cost.n) + '</div>';
      return '<div class="glass listcard shop-card">' +
        '<div class="ic">' + x.ic + '</div>' +
        '<div class="gr"><div class="t">' + x.t + tag + '</div><div class="s">' + sub + '</div></div>' +
        price +
        '<button class="btn" style="padding:7px 16px;font-size:12px" ' + dis +
          ' onclick="' + onclick + '">' + rt + '</button>' +
        '</div>';
    }).join('');
  }

  function renderPacks() {
    return PACKS.map(function (x, i) {
      var owned = x.once && S.shopBought[x.id];
      var tag = x.hot ? '<span class="shop-tag hot">สุดคุ้ม</span>'
        : (x.once ? '<span class="shop-tag ' + (owned ? 'own' : 'free') + '">' + (owned ? 'ซื้อแล้ว' : 'ครั้งเดียว') + '</span>' : '');
      var useGold = x.costGold && (!x.cost || x.cost.n === 0);
      var priceTxt = owned ? 'รับแล้ว'
        : useGold ? costStr('gold', x.costGold)
        : x.cost.n === 0 ? 'ฟรี' : costStr('ruby', x.cost.n);
      var dis = owned ? 'disabled style="opacity:.45"' : '';
      return '<div class="glass listcard shop-card">' +
        '<div class="ic">' + x.ic + '</div>' +
        '<div class="gr"><div class="t">' + x.t + tag + '</div><div class="s">' + x.d + ' · รับ ' + rewardLabel(x.reward) + '</div></div>' +
        '<button class="btn" style="padding:7px 14px;font-size:12px" ' + dis +
          ' onclick="window.__shopPack(' + i + ')">' + priceTxt + '</button>' +
        '</div>';
    }).join('');
  }

  function renderExchange() {
    var head = '<div class="shop-rate">💠 เหรียญที่มี: ' +
      '<b style="color:var(--gold)">🏅 ' + G.fmt(S.arenaCoin) + '</b> · ' +
      '<b style="color:var(--gold)">🏰 ' + G.fmt(S.guildCoin) + '</b> · ' +
      '<b style="color:var(--gold)">🎫 ' + G.fmt(S.eventCoin) + '</b>' +
      ' &nbsp;|&nbsp; เศษวิญญาณรวม: <b style="color:var(--gold)">🌟 ' + G.fmt(totalShards()) + '</b></div>';
    return head + EXCHANGE.map(function (x, i) {
      var afford = (S[x.cur] || 0) >= x.cost;
      return '<div class="glass listcard shop-card">' +
        '<div class="ic">' + x.ic + '</div>' +
        '<div class="gr"><div class="t">' + x.t + '</div><div class="s">' + x.d + ' · ได้ ' + rewardLabel(x.reward) + '</div></div>' +
        '<div class="rt" style="color:' + (afford ? 'var(--gold)' : 'var(--fire)') + ';font-size:11px">' + costStr(x.cur, x.cost) + '</div>' +
        '<button class="btn" style="padding:7px 16px;font-size:12px" onclick="window.__shopExch(' + i + ')">แลก</button>' +
        '</div>';
    }).join('');
  }

  // global override — note: original called renderShop(tab); keep that signature
  window.renderShop = function (tab) {
    tab = tab || window.__shopTab || 'deals';
    if (!TABS[tab]) tab = 'deals';
    window.__shopTab = tab;
    wireTopbar();
    var body = document.getElementById('shopBody'); if (!body) return;
    body.innerHTML = tab === 'deals' ? renderDeals()
      : tab === 'packs' ? renderPacks()
      : renderExchange();
    // sync active coltab pill (handles go() re-entry without a click)
    var tabs = document.querySelectorAll('#shop .coltab .tb');
    var order = ['deals', 'packs', 'exchange'];
    tabs.forEach(function (el, idx) { el.classList.toggle('on', order[idx] === tab); });
    G.refresh();
  };

  // global override — keep (el, t) signature the HTML buttons use
  window.shopTab = function (el, t) {
    document.querySelectorAll('#shop .coltab .tb').forEach(function (x) { x.classList.remove('on'); });
    if (el && el.classList) el.classList.add('on');
    window.renderShop(t);
  };

  // ---- button handlers (exposed globally so inline onclick can reach them) ----
  window.__shopDeal = function (i) {
    var x = DEALS[i]; if (!x) return;
    if (x.free) {
      if (claimedToday()) { G.toast('🎁 รับของขวัญวันนี้ไปแล้ว'); return; }
      confirmBuy({
        title: '🎁 ' + x.t,
        body: 'ของขวัญรายวันจากแสงแห่งวิญญาณ<br>รับ: <b style="color:var(--gold)">' + rewardLabel(x.reward) + '</b>',
        cost: null,
        onConfirm: function () { S.lastClaim = today(); G.save(); applyReward(x.reward); },
        success: 'รับของขวัญรายวันแล้ว!'
      });
      return;
    }
    confirmBuy({
      title: x.ic + ' ' + x.t,
      body: x.d + '<br>จะได้รับ: <b style="color:var(--gold)">' + rewardLabel(x.reward) + '</b>',
      cost: x.cost,
      onConfirm: function () { applyReward(x.reward); },
      success: 'ซื้อ ' + x.t + ' สำเร็จ'
    });
  };

  window.__shopPack = function (i) {
    var x = PACKS[i]; if (!x) return;
    if (x.once && S.shopBought[x.id]) { G.toast('📦 แพ็กนี้ซื้อได้ครั้งเดียว — รับไปแล้ว'); return; }
    var useGold = x.costGold && (!x.cost || x.cost.n === 0);
    var cost = useGold ? { cur: 'gold', n: x.costGold }
      : (x.cost.n === 0 ? null : x.cost);
    confirmBuy({
      title: x.ic + ' ' + x.t,
      body: x.d + '<br>จะได้รับ: <b style="color:var(--gold)">' + rewardLabel(x.reward) + '</b>' +
        (x.once ? '<br><span style="color:var(--muted)">* ซื้อได้ครั้งเดียวต่อบัญชี</span>' : ''),
      cost: cost,
      onConfirm: function () { if (x.once) { S.shopBought[x.id] = true; G.save(); } applyReward(x.reward); },
      success: 'รับ ' + x.t + ' แล้ว'
    });
  };

  window.__shopExch = function (i) {
    var x = EXCHANGE[i]; if (!x) return;
    confirmBuy({
      title: x.ic + ' ' + x.t,
      body: 'ใช้ <b style="color:var(--gold)">' + costStr(x.cur, x.cost) + '</b> แลกเป็น ' +
        '<b style="color:var(--gold)">' + rewardLabel(x.reward) + '</b>',
      cost: { cur: x.cur, n: x.cost },
      onConfirm: function () { applyReward(x.reward); },
      success: 'แลก ' + rewardLabel(x.reward) + ' สำเร็จ'
    });
  };

  // ---- make go('shop') re-render: wrap the shell's go() once, idempotently ----
  if (!window.__shopGoHooked) {
    window.__shopGoHooked = true;
    var _go = window.go;
    window.go = function (id) {
      var r = _go ? _go.apply(this, arguments) : undefined;
      if (id === 'shop') { try { window.renderShop(window.__shopTab || 'deals'); } catch (e) {} }
      return r;
    };
  }

  // initial paint + if currently visible, re-render now
  window.renderShop(window.__shopTab || 'deals');
  var shopEl = document.getElementById('shop');
  if (shopEl && shopEl.classList.contains('on')) window.renderShop(window.__shopTab || 'deals');
})();
