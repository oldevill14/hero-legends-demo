/* feat-mail.js — MAIL screen (id="mail") for Hero Legends Thai.
 * Loads AFTER game.html + game-core.js + the 11 existing feat modules.
 * Overrides ONLY window.renderMail (replaces the static mockup), and wires the
 * topbar "รับทั้งหมด" button. Everything goes through window.GAME.
 *
 * Mail list: a few fixed messages (Arena weekly reward / event announce / maintenance
 * compensation / first-clear gift / friend gift). Each:
 *   { id, icon, title, desc, reward:{gold|ruby|energy|arenaCoin|...|shard:{key:n}|mats:{key:n}}, time }
 * "claimed" is NOT stored on the message — it is derived from the persistent
 * GAME.state.mailClaimed array (id list). "Nothing is Deleted": we only ADD ids,
 * never remove them, so claimed history survives forever.
 *
 * Behaviour:
 *   - "รับ" per mail  -> grants reward (currencies via GAME.grant; shard/mats into
 *                        GAME.state.inventory) + pushes id into GAME.state.mailClaimed
 *                        + greys the row + toast.
 *   - "รับทั้งหมด"     -> claims every unclaimed reward at once (aggregated toast).
 *   - Unread badge     -> count of unclaimed mails, shown in the header + on the hub
 *                        ✉️ side button.
 * Currency is read via GAME (never hardcoded). Conflict-safe: redefines only
 * window.renderMail, exposes handlers under window.__mail*, wraps go() additively,
 * injects a <style id="mail-style"> with the 'mail-' prefix. Does not touch
 * go/toast/detail/HEROES or any other screen's render fn.
 */
(function () {
  'use strict';
  if (!window.GAME) { console.warn('[feat-mail] GAME not ready'); return; }
  var G = window.GAME, S = G.state;

  // ---- persistent sub-state (additive — never deletes existing keys) ----
  if (!Array.isArray(S.mailClaimed)) S.mailClaimed = [];
  G.save();

  // ---- scoped styles (all classes prefixed mail-) ----
  if (!document.getElementById('mail-style')) {
    var st = document.createElement('style');
    st.id = 'mail-style';
    st.textContent = [
      '#mail .mail-head{display:flex;align-items:center;gap:8px;margin:2px 0 12px}',
      '#mail .mail-headt{font-size:13px;font-weight:800;color:var(--muted)}',
      '#mail .mail-unread{background:var(--epic);color:#fff;font-size:9px;font-weight:800;',
      '  padding:2px 8px;border-radius:9px}',
      '#mail .mail-alldone{font-size:11px;color:var(--muted);font-weight:600}',
      '#mail .mail-list{display:flex;flex-direction:column;gap:9px}',
      '#mail .mail-row{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:13px;',
      '  position:relative;transition:opacity .25s,transform .12s,box-shadow .12s}',
      '#mail .mail-row.unread{box-shadow:inset 3px 0 0 var(--glow)}',
      '#mail .mail-row.unread:hover{transform:translateY(-2px);box-shadow:inset 3px 0 0 var(--glow),0 6px 22px rgba(139,92,246,.28)}',
      '#mail .mail-row.claimed{opacity:.42}',
      '#mail .mail-ic{font-size:24px;flex:none;width:34px;text-align:center;position:relative}',
      '#mail .mail-dot{position:absolute;top:-2px;right:-1px;width:9px;height:9px;border-radius:50%;',
      '  background:var(--epic);border:1.5px solid var(--panel2);box-shadow:0 0 7px rgba(236,72,153,.8)}',
      '#mail .mail-gr{flex:1;min-width:0}',
      '#mail .mail-gr .mail-t{font-weight:700;font-size:13px;display:flex;align-items:center;gap:7px}',
      '#mail .mail-gr .mail-d{font-size:10.5px;color:var(--muted);margin-top:2px;line-height:1.45}',
      '#mail .mail-gr .mail-time{font-size:9.5px;color:#6b6b8c;margin-top:3px}',
      '#mail .mail-reward{font-size:11px;color:var(--gold);font-weight:700;text-align:right;',
      '  min-width:118px;line-height:1.5}',
      '#mail .mail-claim{padding:7px 17px;border-radius:20px;cursor:pointer;font-weight:800;font-size:12px;',
      '  border:none;font-family:inherit;background:linear-gradient(135deg,var(--glow),var(--glow2));',
      '  color:#fff;box-shadow:0 4px 16px rgba(139,92,246,.4);flex:none}',
      '#mail .mail-claim:hover{filter:brightness(1.08)}',
      '#mail .mail-got{padding:7px 14px;border-radius:20px;font-weight:700;font-size:11px;flex:none;',
      '  background:var(--panel2);border:1px solid var(--line);color:var(--muted)}',
      '#mail .mail-empty{text-align:center;color:var(--muted);font-size:12px;padding:40px 10px}',
      '#mail .mail-empty .mail-eic{font-size:38px;margin-bottom:8px;opacity:.7}',
      // topbar "รับทั้งหมด" -> styled like a primary chip when there is something to claim
      '#mail .mail-allbtn{padding:6px 15px;border-radius:18px;cursor:pointer;font-size:12px;font-weight:800;',
      '  font-family:inherit;border:none;color:#fff;display:flex;align-items:center;gap:6px;',
      '  background:linear-gradient(135deg,var(--gold),#d99a2b);color:#3a2600;box-shadow:0 4px 14px rgba(245,196,81,.35)}',
      '#mail .mail-allbtn:disabled{opacity:.45;cursor:default;box-shadow:none;',
      '  background:var(--panel2);border:1px solid var(--line);color:var(--muted)}',
      '#mail .mail-allbtn .mail-alln{background:rgba(0,0,0,.22);border-radius:9px;padding:0 6px;font-size:11px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ---- currency icons + Thai labels (read names from GAME where possible) ----
  var CUR = {
    gold: ['🪙', 'ทอง'], ruby: ['💎', 'เพชร'], energy: ['⚡', 'พลังงาน'],
    arenaCoin: ['🏅', 'เหรียญสังเวียน'], guildCoin: ['🏰', 'เหรียญกิลด์'], eventCoin: ['🎫', 'เหรียญอีเวนต์']
  };
  function curIcon(k) { return (CUR[k] || ['•'])[0]; }

  // ---- mail data (fixed prototype set) ----
  // shard:{key:n} -> goes into inventory.shard ; mats:{key:n} -> inventory.mats
  var MAILS = [
    {
      id: 'arena_weekly', icon: '🏆',
      title: 'รางวัลอันดับสังเวียนประจำสัปดาห์',
      desc: 'ขอแสดงความยินดี! คุณจบสัปดาห์ที่อันดับ Diamond III',
      reward: { ruby: 300, arenaCoin: 500 }, time: '2 ชม.ที่แล้ว'
    },
    {
      id: 'event_laweng', icon: '🎆',
      title: 'อีเวนต์มหาศึกนางละเวงเปิดแล้ว',
      desc: 'ของขวัญต้อนรับอีเวนต์ — เก็บเหรียญอีเวนต์ไปแลกนางละเวง (Mythic)',
      reward: { eventCoin: 120, gold: 80000 }, time: '6 ชม.ที่แล้ว'
    },
    {
      id: 'maint_compensation', icon: '🛠️',
      title: 'ชดเชยการปิดปรับปรุงเซิร์ฟเวอร์',
      desc: 'ขออภัยในความไม่สะดวก — มอบของชดเชยให้ผู้เล่นทุกท่าน',
      reward: { ruby: 200, energy: 60 }, time: '1 วันที่แล้ว'
    },
    {
      id: 'firstclear_gift', icon: '🎁',
      title: 'ของขวัญผ่านบทแรก',
      desc: 'แสงนำทางมอบให้สำหรับการเดินทางครั้งแรกของคุณ',
      reward: { gold: 150000, shard: { hero_usaren: 20 } }, time: '2 วันที่แล้ว'
    },
    {
      id: 'friend_gift', icon: '💌',
      title: 'ของขวัญจากเพื่อนร่วมกิลด์',
      desc: '"ราชาสมุทร" ฝากของขวัญถึงคุณ — สู้ ๆ นะสหาย!',
      reward: { guildCoin: 150, mats: { stone: 10, dust: 20 } }, time: '3 วันที่แล้ว'
    }
  ];

  // ---- helpers ----
  function isClaimed(id) { return S.mailClaimed.indexOf(id) >= 0; }
  function unclaimed() { return MAILS.filter(function (m) { return !isClaimed(m.id); }); }
  function unreadCount() { return unclaimed().length; }

  // ensure inventory shape (mirrors feat-inventory expectations)
  function ensureInv() {
    var inv = S.inventory || (S.inventory = {});
    if (!inv.shard || typeof inv.shard !== 'object') inv.shard = {};
    if (!inv.mats || typeof inv.mats !== 'object') inv.mats = {};
    if (!Array.isArray(inv.equip)) inv.equip = [];
    return inv;
  }

  // grant a single mail reward through GAME (currencies) + inventory (shard/mats)
  function applyReward(reward) {
    var clean = {};
    for (var k in reward) {
      if (k === 'shard' || k === 'mats') continue;
      clean[k] = reward[k];
    }
    if (Object.keys(clean).length) G.grant(clean); // GAME owns currency + persist + refresh
    if (reward.shard || reward.mats) {
      var inv = ensureInv();
      if (reward.shard) for (var sk in reward.shard) inv.shard[sk] = (inv.shard[sk] | 0) + reward.shard[sk];
      if (reward.mats) for (var mk in reward.mats) inv.mats[mk] = (inv.mats[mk] | 0) + reward.mats[mk];
      G.save();
    }
  }

  // pretty label for a reward object (handles shard/mats pseudo-keys)
  var SHARD_TH = {}; // hero shard -> Thai name (filled lazily from HEROES)
  function shardName(key) {
    if (key === 'soul') return 'เศษวิญญาณ';
    if (!SHARD_TH[key]) {
      var h = (G.heroes() || []).find(function (x) { return x.id === key; });
      SHARD_TH[key] = h ? ('เศษ' + h.th) : 'เศษฮีโร่';
    }
    return SHARD_TH[key];
  }
  var MAT_TH = {
    stone: 'หินอัปเกรด', dust: 'ผงพลัง', pearl: 'ไข่มุกสมุทร', ember: 'ถ่านเพลิง',
    essence: 'แก่นพฤกษา', moonlight: 'แสงจันทรา', scale: 'เกล็ดนิล'
  };
  function rewardLabel(reward) {
    var parts = [];
    for (var k in reward) {
      if (k === 'shard') { for (var sk in reward.shard) parts.push('🧩 ' + shardName(sk) + ' ×' + G.fmt(reward.shard[sk])); }
      else if (k === 'mats') { for (var mk in reward.mats) parts.push('🧪 ' + (MAT_TH[mk] || mk) + ' ×' + G.fmt(reward.mats[mk])); }
      else parts.push(curIcon(k) + ' ×' + G.fmt(reward[k]));
    }
    return parts.join(' · ');
  }
  // short reward (for the row's right column) — currencies first, compact
  function rewardShort(reward) {
    var parts = [];
    for (var k in reward) {
      if (k === 'shard') { for (var sk in reward.shard) parts.push('🧩 ×' + G.fmt(reward.shard[sk])); }
      else if (k === 'mats') { for (var mk in reward.mats) parts.push('🧪 ×' + G.fmt(reward.mats[mk])); }
      else parts.push(curIcon(k) + ' ' + G.fmt(reward[k]));
    }
    return parts.join('<br>');
  }

  // ---- update the hub ✉️ badge + the in-screen header badge ----
  function ensureHubBadgeStyle() {
    if (document.getElementById('mail-hubbadge-style')) return;
    var s2 = document.createElement('style');
    s2.id = 'mail-hubbadge-style';
    s2.textContent =
      '.mail-sidebadge{position:absolute;top:-5px;right:-5px;min-width:17px;height:17px;padding:0 4px;' +
      'border-radius:9px;background:var(--epic);color:#fff;font-size:9.5px;font-weight:800;line-height:17px;' +
      'text-align:center;box-shadow:0 0 8px rgba(236,72,153,.7);pointer-events:none}';
    document.head.appendChild(s2);
  }
  function updateHubBadge() {
    ensureHubBadgeStyle();
    // the hub mail button is the .sbtn whose onclick opens 'mail'
    var sideBtns = document.querySelectorAll('#hub .side .sbtn');
    var mailBtn = null;
    sideBtns.forEach(function (b) {
      var oc = b.getAttribute('onclick') || '';
      if (oc.indexOf("'mail'") >= 0 || oc.indexOf('"mail"') >= 0) mailBtn = b;
    });
    if (!mailBtn) return;
    if (getComputedStyle(mailBtn).position === 'static') mailBtn.style.position = 'relative';
    var n = unreadCount();
    var badge = mailBtn.querySelector('.mail-sidebadge');
    if (n > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'mail-sidebadge'; mailBtn.appendChild(badge); }
      badge.textContent = n > 99 ? '99+' : n;
    } else if (badge) {
      badge.remove();
    }
  }

  // ---- wire the topbar: replace the static "รับทั้งหมด" with a live button ----
  function wireTopbar() {
    var mail = document.getElementById('mail'); if (!mail) return;
    var curr = mail.querySelector('.topbar .curr'); if (!curr) return;
    if (!curr.querySelector('.mail-allbtn')) {
      curr.innerHTML = '<button class="mail-allbtn" id="mailAllBtn" onclick="window.__mailClaimAll()">' +
        '🎁 รับทั้งหมด <span class="mail-alln" id="mailAllN">0</span></button>';
    }
    var n = unreadCount();
    var btn = document.getElementById('mailAllBtn');
    var nEl = document.getElementById('mailAllN');
    if (btn) btn.disabled = n === 0;
    if (nEl) nEl.textContent = n;
  }

  // ---- render the mail list (the global the shell calls) ----
  function renderMail() {
    wireTopbar();
    updateHubBadge();

    var host = document.getElementById('mailList'); if (!host) return;
    var n = unreadCount();

    var header = '<div class="mail-head">' +
      '<span class="mail-headt">กล่องจดหมายของคุณ</span>' +
      (n > 0 ? '<span class="mail-unread">ยังไม่ได้รับ ' + n + '</span>'
             : '<span class="mail-alldone">✓ รับครบทุกฉบับแล้ว</span>') +
      '</div>';

    var rows = MAILS.map(function (m) {
      var claimed = isClaimed(m.id);
      var dot = claimed ? '' : '<span class="mail-dot"></span>';
      var action = claimed
        ? '<span class="mail-got">✓ รับแล้ว</span>'
        : '<button class="mail-claim" onclick="window.__mailClaim(\'' + m.id + '\')">รับ</button>';
      return '<div class="glass mail-row ' + (claimed ? 'claimed' : 'unread') + '" id="mail-row-' + m.id + '">' +
        '<div class="mail-ic">' + m.icon + dot + '</div>' +
        '<div class="mail-gr">' +
          '<div class="mail-t">' + m.title + '</div>' +
          '<div class="mail-d">' + m.desc + '</div>' +
          '<div class="mail-time">' + m.time + '</div>' +
        '</div>' +
        '<div class="mail-reward">' + rewardShort(m.reward) + '</div>' +
        action +
      '</div>';
    }).join('');

    host.innerHTML = header + '<div class="mail-list">' + rows + '</div>';
    G.refresh();
  }

  // ---- claim one ----
  window.__mailClaim = function (id) {
    var m = MAILS.find(function (x) { return x.id === id; });
    if (!m) return;
    if (isClaimed(id)) { G.toast('✉️ จดหมายฉบับนี้รับไปแล้ว'); return; }
    applyReward(m.reward);
    S.mailClaimed.push(id);         // Nothing is Deleted: only add
    G.save();
    G.toast('🎁 รับแล้ว: ' + rewardLabel(m.reward));
    renderMail();                   // re-render -> greys the row, updates badges
  };

  // ---- claim all unclaimed at once ----
  window.__mailClaimAll = function () {
    var pending = unclaimed();
    if (!pending.length) { G.toast('✉️ ไม่มีจดหมายที่ยังไม่ได้รับ'); return; }
    // aggregate everything into one combined reward for a single tidy toast
    var agg = {};
    pending.forEach(function (m) {
      for (var k in m.reward) {
        if (k === 'shard') { agg.shard = agg.shard || {}; for (var sk in m.reward.shard) agg.shard[sk] = (agg.shard[sk] | 0) + m.reward.shard[sk]; }
        else if (k === 'mats') { agg.mats = agg.mats || {}; for (var mk in m.reward.mats) agg.mats[mk] = (agg.mats[mk] | 0) + m.reward.mats[mk]; }
        else agg[k] = (agg[k] | 0) + m.reward[k];
      }
      S.mailClaimed.push(m.id);
    });
    applyReward(agg);
    G.save();
    G.toast('🎁 รับ ' + pending.length + ' ฉบับ: ' + rewardLabel(agg));
    renderMail();
  };

  // expose the global the shell calls
  window.renderMail = renderMail;

  // ---- wrap go() additively so go('mail') re-renders + hub badge stays fresh ----
  if (!window.__mailHooked) {
    window.__mailHooked = true;
    var prevGo = window.go;
    if (typeof prevGo === 'function') {
      window.go = function (id) {
        var r = prevGo.apply(this, arguments);
        try {
          if (id === 'mail') renderMail();
          if (id === 'hub') updateHubBadge();
        } catch (e) {}
        return r;
      };
    }
  }

  // initial paint: refresh hub badge now, and the mail screen if it's already visible
  try { updateHubBadge(); } catch (e) {}
  try { renderMail(); } catch (e) {}
})();
