/* feat-equipment.js — EQUIPMENT screen (id="equip") for Hero Legends Thai.
 * Loads AFTER game.html + game-core.js. Overrides openEquip(id) only.
 *
 * - 7 slots: weapon/helmet/armor/gloves/boots/necklace/ring
 * - Inventory of gear lives in GAME.state.inventory.equip (auto-seeded if empty),
 *   each item: {id, slot, rarity, mainStat, value, set}
 * - Equipped gear: GAME.state.equipment[heroId][slot] = itemId
 * - window.equipBonus(heroId) -> {hp,atk,def,spd}  (other screens add these)
 * - Set-bonus summary (count by set), persisted via GAME.save.
 * Theme: Light / Shadow / Spirit — violet glow + gold. All UI text Thai.
 */
(function () {
  if (!window.GAME) return;
  var G = window.GAME;

  // ---- slot definitions (order = display order) ----
  var SLOTS = [
    { key: 'weapon',   th: 'อาวุธ',   ic: '⚔️', stat: 'atk' },
    { key: 'helmet',   th: 'หมวก',    ic: '⛑️', stat: 'hp'  },
    { key: 'armor',    th: 'เกราะ',   ic: '🥋', stat: 'def' },
    { key: 'gloves',   th: 'ถุงมือ',  ic: '🧤', stat: 'atk' },
    { key: 'boots',    th: 'รองเท้า', ic: '👢', stat: 'spd' },
    { key: 'necklace', th: 'สร้อยคอ', ic: '📿', stat: 'hp'  },
    { key: 'ring',     th: 'แหวน',    ic: '💍', stat: 'def' },
  ];
  var SLOT_BY_KEY = {};
  SLOTS.forEach(function (s) { SLOT_BY_KEY[s.key] = s; });

  var STAT_TH = { hp: '❤️ HP', atk: '⚔️ ATK', def: '🛡️ DEF', spd: '⚡ SPD' };

  // rarity → theme token + base value multiplier
  var RARITY = {
    Common:    { th: 'ธรรมดา',   col: 'var(--muted)', mul: 1,   stars: 1 },
    Rare:      { th: 'หายาก',    col: 'var(--water)', mul: 1.7, stars: 2 },
    Epic:      { th: 'เอพิก',     col: 'var(--epic)',  mul: 2.6, stars: 3 },
    Legendary: { th: 'ตำนาน',    col: 'var(--leg)',   mul: 3.8, stars: 4 },
    Mythic:    { th: 'อมตะ',      col: 'var(--myth)',  mul: 5.2, stars: 5 },
  };
  // each set: theme + the bonus tiers (2/4/6 pieces)
  var SETS = {
    sea_guardian: { th: 'ผู้พิทักษ์สมุทร', col: 'var(--water)',
      tiers: { 2: '+15% DEF', 4: 'ลดดาเมจ 10%', 6: 'สะท้อนดาเมจ 20%' } },
    moon_blessing: { th: 'พรเจ็ดดวงจันทร์', col: 'var(--light)',
      tiers: { 2: '+15% HP', 4: 'ฟื้น HP ทุกเทิร์น', 6: 'ภูมิคุ้มกันสถานะร้าย' } },
    lanka_flame: { th: 'เพลิงลังกา', col: 'var(--fire)',
      tiers: { 2: '+12% ATK', 4: 'คริติคอล +15%', 6: 'เผาไหม้เมื่อโจมตี' } },
    spirit_veil: { th: 'ม่านวิญญาณ', col: 'var(--myth)',
      tiers: { 2: '+15% SPD', 4: 'เกจอัลติเมท +10%', 6: 'เริ่มรบมีโล่' } },
  };
  var SET_KEYS = Object.keys(SETS);

  // base stat value per slot's main stat (before rarity multiplier)
  var BASE = { hp: 90, atk: 16, def: 14, spd: 7 };

  // ---------- inventory seeding ----------
  function inv() {
    if (!G.state.inventory) G.state.inventory = {};
    if (!Array.isArray(G.state.inventory.equip)) G.state.inventory.equip = [];
    return G.state.inventory.equip;
  }
  function mkItem(slotKey, rarity, set, n) {
    var slot = SLOT_BY_KEY[slotKey];
    var r = RARITY[rarity];
    var val = Math.round(BASE[slot.stat] * r.mul);
    return {
      id: 'eq_' + slotKey + '_' + rarity.toLowerCase() + '_' + n,
      slot: slotKey, rarity: rarity, set: set,
      mainStat: slot.stat, value: val,
    };
  }
  function seedIfEmpty() {
    var bag = inv();
    if (bag.length) return;
    // a small, on-theme starter set: ~2 items per slot across a couple sets
    var plan = [
      ['weapon', 'Legendary', 'lanka_flame'], ['weapon', 'Rare', 'sea_guardian'],
      ['helmet', 'Epic', 'sea_guardian'],     ['helmet', 'Rare', 'moon_blessing'],
      ['armor', 'Legendary', 'sea_guardian'], ['armor', 'Epic', 'moon_blessing'],
      ['gloves', 'Epic', 'lanka_flame'],      ['gloves', 'Rare', 'spirit_veil'],
      ['boots', 'Legendary', 'spirit_veil'],  ['boots', 'Common', 'moon_blessing'],
      ['necklace', 'Epic', 'moon_blessing'],  ['necklace', 'Rare', 'sea_guardian'],
      ['ring', 'Mythic', 'spirit_veil'],      ['ring', 'Epic', 'lanka_flame'],
    ];
    var counter = {};
    plan.forEach(function (p) {
      var k = p[0] + p[1];
      counter[k] = (counter[k] || 0) + 1;
      bag.push(mkItem(p[0], p[1], p[2], counter[k]));
    });
    G.save();
  }
  function itemById(id) {
    var bag = inv();
    for (var i = 0; i < bag.length; i++) if (bag[i].id === id) return bag[i];
    return null;
  }

  // ---------- equipment map helpers ----------
  function equipMap(heroId) {
    if (!G.state.equipment) G.state.equipment = {};
    if (!G.state.equipment[heroId]) G.state.equipment[heroId] = {};
    return G.state.equipment[heroId];
  }
  // is an item equipped by ANY hero? returns heroId or null
  function equippedBy(itemId) {
    var all = G.state.equipment || {};
    for (var hid in all) {
      var m = all[hid];
      for (var sk in m) if (m[sk] === itemId) return hid;
    }
    return null;
  }

  // ---------- public: stat bonus from equipped gear ----------
  window.equipBonus = function (heroId) {
    var out = { hp: 0, atk: 0, def: 0, spd: 0 };
    var m = (G.state.equipment || {})[heroId];
    if (!m) return out;
    for (var sk in m) {
      var it = itemById(m[sk]);
      if (it && out.hasOwnProperty(it.mainStat)) out[it.mainStat] += it.value;
    }
    return out;
  };

  // ---------- set-bonus summary for a hero ----------
  function setCounts(heroId) {
    var counts = {};
    var m = equipMap(heroId);
    for (var sk in m) {
      var it = itemById(m[sk]);
      if (it && it.set) counts[it.set] = (counts[it.set] || 0) + 1;
    }
    return counts;
  }
  // which tiers of a set are active at a given count
  function activeTiers(setKey, count) {
    var tiers = SETS[setKey].tiers, active = [];
    [2, 4, 6].forEach(function (n) { if (count >= n) active.push(n); });
    return active;
  }

  // ---------- styles (prefixed feq-) ----------
  if (!document.getElementById('feq-style')) {
    var st = document.createElement('style');
    st.id = 'feq-style';
    st.textContent = [
      '.feq-wrap{display:flex;gap:16px;align-items:flex-start}',
      '.feq-art{flex:none;width:170px;border-radius:14px;overflow:hidden;border:2px solid var(--line);align-self:flex-start;position:relative}',
      '.feq-art img{width:100%;display:block}',
      '.feq-art .feq-pw{position:absolute;left:0;right:0;bottom:0;padding:16px 8px 6px;font-size:11px;font-weight:800;text-align:center;background:linear-gradient(transparent,rgba(0,0,0,.9));color:var(--gold)}',
      '.feq-main{flex:1;min-width:0}',
      '.feq-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:12px}',
      '.feq-slot{position:relative;border-radius:11px;border:2px dashed var(--line);background:#11111d;padding:10px 6px;text-align:center;cursor:pointer;transition:transform .12s,box-shadow .12s;min-height:84px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}',
      '.feq-slot:hover{transform:translateY(-2px)}',
      '.feq-slot.feq-on{border-style:solid}',
      '.feq-slot .feq-ic{font-size:21px;line-height:1}',
      '.feq-slot .feq-sn{font-size:9px;color:var(--muted)}',
      '.feq-slot .feq-val{font-size:10px;font-weight:800;color:var(--gold)}',
      '.feq-slot .feq-rb{position:absolute;top:4px;right:5px;font-size:8px;font-weight:800;letter-spacing:.5px}',
      '.feq-statbox{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:4px 0 12px}',
      '.feq-stat{border-radius:10px;padding:8px 6px;text-align:center}',
      '.feq-stat .l{font-size:10px;color:var(--muted)}',
      '.feq-stat .v{font-size:15px;font-weight:900}',
      '.feq-stat .d{font-size:10px;font-weight:800;color:#34d399}',
      '.feq-sets{display:flex;flex-direction:column;gap:7px}',
      '.feq-setrow{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:11px}',
      '.feq-setrow .feq-dot{width:12px;height:12px;border-radius:50%;flex:none}',
      '.feq-setrow .feq-cnt{font-size:11px;font-weight:800;flex:none;width:34px;text-align:center}',
      '.feq-tierwrap{display:flex;gap:6px;flex-wrap:wrap}',
      '.feq-tier{font-size:9.5px;padding:2px 8px;border-radius:8px;border:1px solid var(--line);color:var(--muted)}',
      '.feq-tier.feq-act{color:#fff;border-color:transparent;font-weight:800}',
      // modal list
      '.feq-mtitle{font-size:15px;font-weight:900;margin:0 0 4px}',
      '.feq-msub{font-size:11px;color:var(--muted);margin:0 0 12px}',
      '.feq-list{display:flex;flex-direction:column;gap:7px;min-width:340px;max-width:440px}',
      '.feq-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:11px;background:#1b1b2b;border:1px solid var(--line);cursor:pointer;transition:transform .1s,border-color .12s}',
      '.feq-item:hover{transform:translateX(2px);border-color:var(--glow)}',
      '.feq-item.feq-cur{border-color:var(--gold)}',
      '.feq-item .feq-iic{font-size:20px;flex:none;width:26px;text-align:center}',
      '.feq-item .feq-igr{flex:1;min-width:0}',
      '.feq-item .feq-inm{font-size:12.5px;font-weight:800}',
      '.feq-item .feq-ide{font-size:10px;color:var(--muted)}',
      '.feq-item .feq-irt{font-size:12px;font-weight:900;color:var(--gold);text-align:right;flex:none}',
      '.feq-empty{padding:18px;text-align:center;color:var(--muted);font-size:12px}',
      '.feq-mbtns{display:flex;gap:8px;margin-top:14px;justify-content:flex-end}',
    ].join('\n');
    document.head.appendChild(st);
  }

  function rarityName(it) { return (RARITY[it.rarity] || {}).th || it.rarity; }
  function setName(it) { return it.set ? (SETS[it.set] || {}).th || it.set : '—'; }
  function itemTitle(it) {
    var slot = SLOT_BY_KEY[it.slot] || { th: it.slot, ic: '❔' };
    return slot.th + ' · ' + setName(it);
  }

  // ---------- render the equip screen for a hero ----------
  var curHero = null;

  function powerOf(heroId) {
    var h = G.heroes().find(function (x) { return x.id === heroId; });
    if (!h) return 0;
    var b = window.equipBonus(heroId);
    var hp = h.hp + b.hp, atk = h.atk + b.atk, def = h.def + b.def, spd = h.spd + b.spd;
    return Math.round(hp * 0.3 + atk * 3 + def * 2 + spd * 4);
  }

  function renderEquip() {
    if (!curHero) return;
    var bodyEl = document.getElementById('equipBody');
    if (!bodyEl) return;
    var h = G.heroes().find(function (x) { return x.id === curHero; });
    if (!h) return;
    var m = equipMap(curHero);
    var b = window.equipBonus(curHero);

    // slot tiles
    var tiles = SLOTS.map(function (s) {
      var itemId = m[s.key];
      var it = itemId ? itemById(itemId) : null;
      if (it) {
        var r = RARITY[it.rarity] || {};
        return '<div class="feq-slot feq-on glass" style="border-color:' + (r.col || 'var(--glow)') + '" onclick="__feqPick(\'' + s.key + '\')">' +
          '<span class="feq-rb" style="color:' + (r.col || 'var(--gold)') + '">' + ('★'.repeat(r.stars || 1)) + '</span>' +
          '<div class="feq-ic">' + s.ic + '</div>' +
          '<div class="feq-sn">' + s.th + '</div>' +
          '<div class="feq-val">+' + it.value + ' ' + (STAT_TH[it.mainStat] || it.mainStat).replace(/^[^ ]+ /, '') + '</div>' +
          '</div>';
      }
      return '<div class="feq-slot" onclick="__feqPick(\'' + s.key + '\')">' +
        '<div class="feq-ic" style="opacity:.5">' + s.ic + '</div>' +
        '<div class="feq-sn">' + s.th + '</div>' +
        '<div class="feq-val" style="color:var(--muted)">ว่าง</div>' +
        '</div>';
    }).join('');

    // effective stat box
    var stats = [
      ['hp', h.hp, b.hp], ['atk', h.atk, b.atk], ['def', h.def, b.def], ['spd', h.spd, b.spd],
    ].map(function (row) {
      var k = row[0], base = row[1], bonus = row[2];
      return '<div class="feq-stat glass">' +
        '<div class="l">' + STAT_TH[k] + '</div>' +
        '<div class="v">' + (base + bonus) + '</div>' +
        '<div class="d">' + (bonus ? '+' + bonus : '&nbsp;') + '</div>' +
        '</div>';
    }).join('');

    // set summary
    var counts = setCounts(curHero);
    var setRows = SET_KEYS.filter(function (k) { return counts[k]; })
      .sort(function (a, c) { return counts[c] - counts[a]; })
      .map(function (k) {
        var set = SETS[k], cnt = counts[k], act = activeTiers(k, cnt);
        var tierHtml = [2, 4, 6].map(function (n) {
          var on = act.indexOf(n) >= 0;
          return '<span class="feq-tier' + (on ? ' feq-act' : '') + '"' +
            (on ? ' style="background:' + set.col + '"' : '') + '>' +
            n + ': ' + set.tiers[n] + '</span>';
        }).join('');
        return '<div class="feq-setrow glass">' +
          '<span class="feq-dot" style="background:' + set.col + '"></span>' +
          '<span class="feq-cnt" style="color:' + set.col + '">' + cnt + 'ชิ้น</span>' +
          '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:800">' + set.th + '</div>' +
          '<div class="feq-tierwrap" style="margin-top:4px">' + tierHtml + '</div></div>' +
          '</div>';
      }).join('');
    if (!setRows) {
      setRows = '<div class="feq-empty glass" style="border-radius:11px">ยังไม่มีเซ็ตโบนัส — สวมอุปกรณ์เซ็ตเดียวกัน 2 ชิ้นขึ้นไป</div>';
    }

    bodyEl.innerHTML =
      '<div class="feq-wrap">' +
        '<div class="feq-art"><img src="portraits/' + h.id + '.jpg" alt="">' +
          '<div class="feq-pw">⚔️ พลัง ' + powerOf(curHero).toLocaleString() + '</div></div>' +
        '<div class="feq-main">' +
          '<div class="h2" style="font-size:15px;margin:0 0 8px">' + h.th +
            ' <span class="sub">7 ช่อง · แตะเพื่อสวม/ถอด</span></div>' +
          '<div class="feq-grid">' + tiles + '</div>' +
          '<div class="h2" style="font-size:13px;margin:4px 0 6px">สถานะรวม (ฐาน + อุปกรณ์)</div>' +
          '<div class="feq-statbox">' + stats + '</div>' +
          '<div class="h2" style="font-size:13px;margin:4px 0 6px">🔯 เซ็ตโบนัส</div>' +
          '<div class="feq-sets">' + setRows + '</div>' +
        '</div>' +
      '</div>';
  }

  // ---------- picker modal: choose gear for a slot ----------
  window.__feqPick = function (slotKey) {
    if (!curHero) return;
    var slot = SLOT_BY_KEY[slotKey];
    var m = equipMap(curHero);
    var equippedId = m[slotKey] || null;
    var bag = inv().filter(function (it) { return it.slot === slotKey; })
      .sort(function (a, c) { return c.value - a.value; });

    var rows = bag.map(function (it) {
      var who = equippedBy(it.id);
      var isCur = it.id === equippedId;
      var r = RARITY[it.rarity] || {};
      var busy = who && who !== curHero;
      var sub = (r.th || it.rarity) + ' · เซ็ต' + setName(it) +
        (busy ? ' · <span style="color:var(--fire)">สวมโดยฮีโร่อื่น</span>'
              : (isCur ? ' · <span style="color:var(--gold)">กำลังสวม</span>' : ''));
      return '<div class="feq-item' + (isCur ? ' feq-cur' : '') + '"' +
        ' style="' + (busy ? 'opacity:.55;' : '') + 'border-left:3px solid ' + (r.col || 'var(--line)') + '"' +
        ' onclick="__feqEquip(\'' + slotKey + '\',\'' + it.id + '\')">' +
        '<div class="feq-iic">' + slot.ic + '</div>' +
        '<div class="feq-igr"><div class="feq-inm">' + itemTitle(it) + '</div>' +
        '<div class="feq-ide">' + sub + '</div></div>' +
        '<div class="feq-irt">+' + it.value + '<div style="font-size:9px;color:var(--muted);font-weight:700">' +
        (STAT_TH[it.mainStat] || it.mainStat) + '</div></div>' +
        '</div>';
    }).join('');
    if (!rows) rows = '<div class="feq-empty">ไม่มีอุปกรณ์ประเภทนี้ในกระเป๋า</div>';

    var unequipBtn = equippedId
      ? '<button class="back glass" onclick="__feqUnequip(\'' + slotKey + '\')">ถอดออก</button>'
      : '';

    G.modal(
      '<div class="feq-mtitle">' + slot.ic + ' เลือก' + slot.th + '</div>' +
      '<div class="feq-msub">แตะเพื่อสวมให้ ' +
        ((G.heroes().find(function (x) { return x.id === curHero; }) || {}).th || '') + '</div>' +
      '<div class="feq-list">' + rows + '</div>' +
      '<div class="feq-mbtns">' + unequipBtn +
        '<button class="btn" style="padding:8px 22px" onclick="GAME.closeModal()">ปิด</button>' +
      '</div>'
    );
  };

  window.__feqEquip = function (slotKey, itemId) {
    if (!curHero) return;
    var it = itemById(itemId);
    if (!it) return;
    var busy = equippedBy(itemId);
    if (busy && busy !== curHero) {
      // move it: unequip from the other hero first (one physical item)
      var om = equipMap(busy);
      for (var sk in om) if (om[sk] === itemId) delete om[sk];
    }
    var m = equipMap(curHero);
    if (m[slotKey] === itemId) { // tapping the equipped one = unequip
      delete m[slotKey];
      G.toast('ถอด ' + (SLOT_BY_KEY[slotKey] || {}).th + ' แล้ว');
    } else {
      m[slotKey] = itemId;
      G.toast('✦ สวม ' + itemTitle(it) + ' (+' + it.value + ')');
    }
    G.save();
    G.closeModal();
    renderEquip();
  };

  window.__feqUnequip = function (slotKey) {
    if (!curHero) return;
    var m = equipMap(curHero);
    if (m[slotKey]) {
      delete m[slotKey];
      G.save();
      G.toast('ถอด ' + (SLOT_BY_KEY[slotKey] || {}).th + ' แล้ว');
    }
    G.closeModal();
    renderEquip();
  };

  // ---------- override openEquip(id) ----------
  window.openEquip = function (id) {
    seedIfEmpty();
    curHero = id;
    G.go('equip');
    var back = document.getElementById('eqBack');
    if (back) back.onclick = function () { if (window.detail) window.detail(id); else G.go('heroes'); };
    renderEquip();
  };

  // expose render so the shell / go() can re-trigger it; keep idempotent
  window.renderEquip = renderEquip;

  // hook go('equip') re-render without clobbering the shell switcher
  if (!window.__feqGoHooked) {
    window.__feqGoHooked = true;
    var prevGo = window.go;
    window.go = function (sid) {
      var r = prevGo ? prevGo.apply(this, arguments) : undefined;
      if (sid === 'equip' && curHero) { try { renderEquip(); } catch (e) {} }
      return r;
    };
  }

  // if the equip screen is already visible (e.g. hot reload), seed + render
  seedIfEmpty();
  var scr = document.getElementById('equip');
  if (scr && scr.classList.contains('on')) {
    if (!curHero) {
      var owned = G.ownedList();
      curHero = owned[0] || (G.heroes()[0] || {}).id || null;
    }
    if (curHero) renderEquip();
  }
})();
