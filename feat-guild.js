/* feat-guild.js — makes the GUILD screen (id="guild") functional.
 * Loads after game.html + game-core.js. Overrides window.renderGuild ONLY.
 * Uses window.GAME for ALL state/currency/persistence/modals/toasts.
 *
 * Feature surface:
 *   - บอสกิลด์ (Guild Boss): modal with a live HP bar; "โจมตี" deals random damage
 *     to GAME.state.guildBossHp and grants guildCoin based on damage dealt.
 *   - ร้านกิลด์ (Guild Shop): modal shop list; buy with GAME.spend('guildCoin',n)
 *     → grants item/shards into GAME.state.inventory.
 *   - สงครามกิลด์ / เรด (War / Raid): informative status modal.
 *   - Keeps the existing "สมาชิกเด่น" members list.
 *
 * All added CSS class names are prefixed "gld-" to avoid collisions.
 */
(function () {
  if (!window.GAME) return;

  // ---- one-time style injection (prefixed gld-) ----
  if (!document.getElementById('gld-style')) {
    var st = document.createElement('style');
    st.id = 'gld-style';
    st.textContent = [
      '.gld-modal{min-width:340px;max-width:480px}',
      '.gld-modal h3{margin:0 0 4px;font-size:18px;font-weight:900;display:flex;align-items:center;gap:8px}',
      '.gld-modal .gld-sub{color:var(--muted);font-size:11px;margin-bottom:12px}',
      '.gld-bossart{font-size:46px;line-height:1;filter:drop-shadow(0 0 12px rgba(139,92,246,.55))}',
      '.gld-bosshead{display:flex;align-items:center;gap:14px;margin-bottom:12px}',
      '.gld-hpwrap{margin:10px 0 4px}',
      '.gld-hpbar{height:16px;border-radius:9px;background:#0c0c16;border:1px solid var(--line);overflow:hidden;position:relative}',
      '.gld-hpfill{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,#ef4444,#f59e0b);transition:width .45s cubic-bezier(.2,.8,.2,1)}',
      '.gld-hptxt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;text-shadow:0 1px 2px #000}',
      '.gld-row{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted);margin:2px 0}',
      '.gld-row b{color:var(--gold)}',
      '.gld-dmg{text-align:center;font-size:13px;font-weight:800;color:#fbbf24;min-height:18px;margin:8px 0 2px;transition:opacity .2s}',
      '.gld-actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}',
      '.gld-shopitem{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:11px;margin-bottom:8px;background:var(--panel2);border:1px solid var(--line)}',
      '.gld-shopitem .gi{font-size:22px;flex:none;width:30px;text-align:center}',
      '.gld-shopitem .gg{flex:1;min-width:0}',
      '.gld-shopitem .gn{font-weight:700;font-size:12.5px}',
      '.gld-shopitem .gs{font-size:10px;color:var(--muted)}',
      '.gld-cost{font-size:11px;color:var(--gold);font-weight:800;white-space:nowrap;display:flex;align-items:center;gap:3px}',
      '.gld-coinbar{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:var(--gold);margin-bottom:10px}',
      '.gld-hit{animation:gldHit .28s ease}',
      '@keyframes gldHit{0%{transform:translateX(0)}25%{transform:translateX(-5px)}50%{transform:translateX(5px)}75%{transform:translateX(-3px)}100%{transform:translateX(0)}}',
      '.gld-warline{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);font-size:12.5px}',
      '.gld-warline:last-child{border-bottom:none}',
      '.gld-warline b{color:var(--ink)}'
    ].join('');
    document.head.appendChild(st);
  }

  var S = GAME.state;

  // ---- Guild Boss config ----
  var BOSS = { name: 'มังกรเจ็ดเศียร', emoji: '🐉', max: 5000000, reward: 12000 };
  function bossHp() {
    if (typeof S.guildBossHp !== 'number' || S.guildBossHp < 0 || S.guildBossHp > BOSS.max) {
      S.guildBossHp = BOSS.max; GAME.save();
    }
    return S.guildBossHp;
  }

  // ---- Guild Shop catalog ----
  // cost = guildCoin; reward applied to GAME.state.inventory on buy.
  var GSHOP = [
    { ic: '🗡️', name: 'ดาบทมิฬลังกา (Epic)', desc: 'อาวุธเซ็ตผู้พิทักษ์สมุทร +ATK', cost: 800,
      give: function () { S.inventory.equip.push({ slot: 'weapon', name: 'ดาบทมิฬลังกา', tier: 'Epic' }); } },
    { ic: '💠', name: 'เศษฮีโร่ ×20', desc: 'เศษอัญเชิญ Legendary', cost: 600,
      give: function () { S.inventory.shard.legend = (S.inventory.shard.legend || 0) + 20; } },
    { ic: '🪨', name: 'หินเสริมพลัง ×15', desc: 'วัสดุอัปเกรดอุปกรณ์', cost: 300,
      give: function () { S.inventory.mats.stone = (S.inventory.mats.stone || 0) + 15; } },
    { ic: '✨', name: 'ผงตื่นรู้ ×30', desc: 'วัสดุตื่นรู้ (Awaken)', cost: 450,
      give: function () { S.inventory.mats.dust = (S.inventory.mats.dust || 0) + 30; } },
    { ic: '🪙', name: 'ทอง ×300,000', desc: 'แลกเป็นทองทันที', cost: 250,
      give: function () { GAME.grant({ gold: 300000 }); } }
  ];

  // ============ BOSS MODAL ============
  function openBoss() {
    var hp = bossHp();
    var html =
      '<div class="gld-modal" id="gld-bossmodal">' +
        '<div class="gld-bosshead">' +
          '<div class="gld-bossart" id="gld-bossart">' + BOSS.emoji + '</div>' +
          '<div style="flex:1">' +
            '<h3 style="margin:0">บอสกิลด์ · ' + BOSS.name + '</h3>' +
            '<div class="gld-sub" style="margin:0">รีเซ็ตใน 6 ชม. · ดาเมจสะสมแลกรางวัล</div>' +
          '</div>' +
        '</div>' +
        '<div class="gld-hpwrap">' +
          '<div class="gld-hpbar"><i class="gld-hpfill" id="gld-hpfill"></i>' +
            '<span class="gld-hptxt" id="gld-hptxt"></span></div>' +
        '</div>' +
        '<div class="gld-row"><span>เหรียญกิลด์ที่ได้รับ</span><b id="gld-earned">0</b></div>' +
        '<div class="gld-dmg" id="gld-dmg">&nbsp;</div>' +
        '<div class="gld-actions">' +
          '<button class="btn" id="gld-attack">⚔️ โจมตี</button>' +
          '<button class="back glass" id="gld-bossclose">ปิด</button>' +
        '</div>' +
      '</div>';
    GAME.modal(html);

    var earned = 0;
    function paint() {
      var h = bossHp();
      var pct = Math.max(0, Math.min(100, (h / BOSS.max) * 100));
      var fill = document.getElementById('gld-hpfill');
      var txt = document.getElementById('gld-hptxt');
      if (fill) fill.style.width = pct.toFixed(1) + '%';
      if (txt) txt.textContent = GAME.fmt(h) + ' / ' + GAME.fmt(BOSS.max) + ' HP';
      var btn = document.getElementById('gld-attack');
      if (btn && h <= 0) { btn.disabled = true; btn.textContent = '☠️ ปราบบอสแล้ว'; }
    }
    paint();

    var atk = document.getElementById('gld-attack');
    if (atk) atk.onclick = function () {
      if (bossHp() <= 0) return;
      // random damage 80k–240k
      var dmg = Math.floor(80000 + Math.random() * 160000);
      var actual = Math.min(dmg, bossHp());
      S.guildBossHp = bossHp() - actual;
      // guildCoin proportional to damage (≈ 1 coin / 1500 dmg, min 30)
      var coin = Math.max(30, Math.round(actual / 1500));
      earned += coin;
      GAME.grant({ guildCoin: coin });
      GAME.save();

      var art = document.getElementById('gld-bossart');
      if (art) { art.classList.remove('gld-hit'); void art.offsetWidth; art.classList.add('gld-hit'); }
      var dEl = document.getElementById('gld-dmg');
      if (dEl) dEl.textContent = '💥 -' + GAME.fmt(actual) + '  (+🏰 ' + GAME.fmt(coin) + ')';
      var eEl = document.getElementById('gld-earned');
      if (eEl) eEl.textContent = GAME.fmt(earned);
      paint();

      if (bossHp() <= 0) {
        GAME.grant({ guildCoin: BOSS.reward });
        earned += BOSS.reward;
        if (eEl) eEl.textContent = GAME.fmt(earned);
        GAME.toast('☠️ ปราบ ' + BOSS.name + ' สำเร็จ! โบนัส +🏰 ' + GAME.fmt(BOSS.reward));
      } else {
        GAME.toast('💥 ดาเมจ ' + GAME.fmt(actual) + ' · +🏰 ' + GAME.fmt(coin));
      }
    };
    var cls = document.getElementById('gld-bossclose');
    if (cls) cls.onclick = function () { GAME.closeModal(); renderGuild(); };
  }

  // ============ SHOP MODAL ============
  function openShop() {
    function build() {
      return '<div class="gld-modal">' +
          '<h3>🛍️ ร้านกิลด์</h3>' +
          '<div class="gld-sub">แลกเหรียญกิลด์เป็นไอเทมและวัสดุ</div>' +
          '<div class="gld-coinbar">🏰 เหรียญกิลด์: <span data-cur="guildCoin">' + GAME.fmt(S.guildCoin) + '</span></div>' +
          GSHOP.map(function (it, i) {
            return '<div class="gld-shopitem">' +
              '<div class="gi">' + it.ic + '</div>' +
              '<div class="gg"><div class="gn">' + it.name + '</div><div class="gs">' + it.desc + '</div></div>' +
              '<button class="btn" style="padding:7px 14px;font-size:12px" data-buy="' + i + '">' +
                '<span class="gld-cost">🏰 ' + GAME.fmt(it.cost) + '</span></button>' +
            '</div>';
          }).join('') +
          '<div class="gld-actions"><button class="back glass" id="gld-shopclose" style="margin-left:auto">ปิด</button></div>' +
        '</div>';
    }
    var box = GAME.modal(build());
    GAME.refresh(); // sync the data-cur display we just injected

    function bind() {
      box.querySelectorAll('[data-buy]').forEach(function (b) {
        b.onclick = function () {
          var it = GSHOP[+b.getAttribute('data-buy')];
          if (GAME.spend('guildCoin', it.cost)) {
            it.give();
            GAME.save();
            GAME.toast('✅ แลก ' + it.name + ' สำเร็จ');
          }
          GAME.refresh();
        };
      });
      var c = box.querySelector('#gld-shopclose');
      if (c) c.onclick = function () { GAME.closeModal(); renderGuild(); };
    }
    bind();
  }

  // ============ WAR MODAL ============
  function openWar() {
    var html = '<div class="gld-modal">' +
        '<h3>⚔️ สงครามกิลด์</h3>' +
        '<div class="gld-sub">Guild War · ศึกชิงเจ้าสมุทรประจำสัปดาห์</div>' +
        '<div class="gld-warline"><span>คู่ต่อสู้</span><b>กิลด์ลังกาเหนือ</b></div>' +
        '<div class="gld-warline"><span>สถานะ</span><b style="color:var(--gold)">เตรียมพร้อม — เริ่ม 20:00</b></div>' +
        '<div class="gld-warline"><span>คะแนนกิลด์เรา</span><b>2,410,000</b></div>' +
        '<div class="gld-warline"><span>คะแนนคู่ต่อสู้</span><b>2,180,000</b></div>' +
        '<div class="gld-warline"><span>รางวัลชนะ</span><b>🏰 ×3,000 · 💎 ×500</b></div>' +
        '<div class="gld-sub" style="margin-top:10px">ลงทะเบียนทีมรับ-รุก ก่อนเวลาเริ่ม เพื่อให้กิลด์ได้คะแนนเต็ม</div>' +
        '<div class="gld-actions">' +
          '<button class="btn" id="gld-warreg">ลงทะเบียนทีม</button>' +
          '<button class="back glass" id="gld-warclose">ปิด</button>' +
        '</div>' +
      '</div>';
    GAME.modal(html);
    var r = document.getElementById('gld-warreg');
    if (r) r.onclick = function () { GAME.toast('📝 ลงทะเบียนทีมสงครามกิลด์แล้ว — รอเวลา 20:00'); };
    var c = document.getElementById('gld-warclose');
    if (c) c.onclick = function () { GAME.closeModal(); };
  }

  // ============ RAID MODAL ============
  function openRaid() {
    var glv = 18; // guild level shown in header
    var need = 20;
    var unlocked = glv >= need;
    var html = '<div class="gld-modal">' +
        '<h3>👹 เรดกิลด์</h3>' +
        '<div class="gld-sub">Guild Raid · บอสร่วมทั้งกิลด์ ดาเมจสะสมแลกรางวัลขั้นสูง</div>' +
        '<div class="gld-warline"><span>สถานะ</span><b style="color:' + (unlocked ? 'var(--gold)' : 'var(--fire)') + '">' +
          (unlocked ? 'เปิดให้ลุย' : 'ล็อก — ปลดที่กิลด์ Lv.' + need) + '</b></div>' +
        '<div class="gld-warline"><span>กิลด์ปัจจุบัน</span><b>Lv.' + glv + '</b></div>' +
        '<div class="gld-warline"><span>บอสเรด</span><b>อสูรทะเลโบราณ (3 เฟส)</b></div>' +
        '<div class="gld-warline"><span>รางวัล</span><b>เศษ Mythic · 🏰 เหรียญกิลด์ · อุปกรณ์ Legendary</b></div>' +
        '<div class="gld-sub" style="margin-top:10px">' +
          (unlocked ? 'เลือกเฟสบอสแล้วระดมดาเมจร่วมกับสมาชิก' :
            'ต้องอัปเกรดกิลด์อีก ' + (need - glv) + ' เลเวล โดยการบริจาคและทำกิจกรรมกิลด์') +
        '</div>' +
        '<div class="gld-actions">' +
          (unlocked ? '<button class="btn" id="gld-raidgo">เข้าเรด</button>' : '') +
          '<button class="back glass" id="gld-raidclose"' + (unlocked ? '' : ' style="margin-left:auto"') + '>ปิด</button>' +
        '</div>' +
      '</div>';
    GAME.modal(html);
    if (unlocked) {
      var g = document.getElementById('gld-raidgo');
      if (g) g.onclick = function () { GAME.toast('👹 เข้าสู่เรดกิลด์ — เลือกเฟสบอส'); };
    }
    var c = document.getElementById('gld-raidclose');
    if (c) c.onclick = function () { GAME.closeModal(); };
  }

  // expose modal openers (namespaced) for inline onclick in the tiles
  window.GLD = { boss: openBoss, shop: openShop, war: openWar, raid: openRaid };

  // ---- Members list (kept from original) ----
  var GMEM = (window.GMEM) || [
    ['ราชาสมุทร', 'Leader', 312000], ['คลื่นเงิน', 'Officer', 254000], ['พายุใต้', 'Member', 198000]
  ];

  // ============ MAIN RENDER OVERRIDE ============
  window.renderGuild = function () {
    var tiles = document.querySelector('#guild .tiles');
    if (tiles) {
      var hp = bossHp();
      var bossPct = Math.round((hp / BOSS.max) * 100);
      tiles.innerHTML =
        '<div class="tile glass" onclick="GLD.boss()"><div class="ic">' + BOSS.emoji + '</div>' +
          '<div class="t">บอสกิลด์</div><div class="s">HP ' + bossPct + '% · รีเซ็ต 6ชม.</div></div>' +
        '<div class="tile glass" onclick="GLD.war()"><div class="ic">⚔️</div>' +
          '<div class="t">สงครามกิลด์</div><div class="s">เริ่ม 20:00</div></div>' +
        '<div class="tile glass" onclick="GLD.shop()"><div class="ic">🛍️</div>' +
          '<div class="t">ร้านกิลด์</div><div class="s">เหรียญ <span data-cur="guildCoin">' + GAME.fmt(S.guildCoin) + '</span></div></div>' +
        '<div class="tile glass" onclick="GLD.raid()"><div class="ic">👹</div>' +
          '<div class="t">เรด</div><div class="s">Lv.20</div></div>';
    }

    var mem = document.getElementById('guildMembers');
    if (mem) {
      mem.innerHTML = GMEM.map(function (m, i) {
        return '<div class="glass rankrow"><div class="rk">' + (i + 1) + '</div>' +
          '<div style="flex:1"><div style="font-weight:700;font-size:13px">' + m[0] +
          ' <span class="badge2">' + m[1] + '</span></div>' +
          '<div class="pw">พลัง ' + m[2].toLocaleString() + '</div></div></div>';
      }).join('');
    }
    GAME.refresh(); // keep data-cur guildCoin in sync
  };

  // ---- idempotent hook: ensure go('guild') re-renders this screen ----
  if (!window.__gldHooked) {
    window.__gldHooked = true;
    var _go = window.go;
    if (typeof _go === 'function') {
      window.go = function (id) {
        var r = _go.apply(this, arguments);
        if (id === 'guild') { try { window.renderGuild(); } catch (e) {} }
        return r;
      };
    }
  }

  // ---- initial paint (and if guild currently visible, refresh it now) ----
  try { window.renderGuild(); } catch (e) {}
})();
