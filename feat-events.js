/* feat-events.js — Hero Legends Thai · อีเวนต์ & ภารกิจรายวัน
 * Overrides window.renderDaily to make #events screen fully functional:
 *   (A) 7-Day Login Calendar with escalating rewards (once per calendar day)
 *   (B) Daily Missions with live progress bars + claim tracking (reset daily)
 *   (C) Weekly Event banner for อีเวนต์นางละเวง
 * #events and its hub 🎉 button already exist in game.html — not duplicated here.
 * Persists: GAME.state.login = {claimed:[],lastStamp} · GAME.state.daily = {claimed:[],stamp}
 * CSS prefixed evd-.
 */
(function () {
  'use strict';
  if (!window.GAME) { console.warn('[events] GAME missing'); return; }
  var G = window.GAME, S = G.state;

  // ---- state init ----
  if (!S.login || typeof S.login !== 'object') S.login = { claimed: [], lastStamp: '' };
  if (!S.daily || typeof S.daily !== 'object') S.daily = { claimed: [], stamp: '' };

  // ---- date helpers ----
  function todayStamp() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // reset daily mission claims if calendar day has changed
  function checkDailyReset() {
    var t = todayStamp();
    if (S.daily.stamp !== t) { S.daily.claimed = []; S.daily.stamp = t; G.save(); }
  }

  // ---- 7-day calendar config ----
  var LOGIN_DAYS = [
    { day: 1, label: 'วัน 1', icon: '🪙', reward: { gold: 50000 },  desc: '🪙 50,000' },
    { day: 2, label: 'วัน 2', icon: '💎', reward: { ruby: 100 },    desc: '💎 ×100' },
    { day: 3, label: 'วัน 3', icon: '⚡', reward: { energy: 60 },   desc: '⚡ ×60' },
    { day: 4, label: 'วัน 4', icon: '🪙', reward: { gold: 100000 }, desc: '🪙 100,000' },
    { day: 5, label: 'วัน 5', icon: '💎', reward: { ruby: 200 },    desc: '💎 ×200' },
    { day: 6, label: 'วัน 6', icon: '🧪', reward: { mats: 10 },     desc: '🧪 วัสดุ ×10' },
    { day: 7, label: 'วัน 7', icon: '👑', reward: { ruby: 500 },    desc: '💎 ×500 JACKPOT' }
  ];

  // ---- daily mission config ----
  var MISSIONS = [
    {
      id: 'login', ic: '📅', name: 'ล็อกอินวันนี้',
      prog: function () { return 1; }, goal: 1,
      reward: { ruby: 30 }, rewardDesc: '💎 ×30'
    },
    {
      id: 'stages', ic: '⚔️', name: 'ผ่านด่าน 3 ครั้ง',
      prog: function () { return Math.min(3, Object.keys((S.progress && S.progress.cleared) || {}).length); },
      goal: 3, reward: { gold: 20000 }, rewardDesc: '🪙 20,000'
    },
    {
      id: 'summon', ic: '🔮', name: 'อัญเชิญฮีโร่ 1 ครั้ง',
      prog: function () { return (S.pity || 0) > 0 ? 1 : 0; }, goal: 1,
      reward: { ruby: 50 }, rewardDesc: '💎 ×50'
    },
    {
      id: 'arena', ic: '🏅', name: 'ชนะสังเวียน 2 ครั้ง',
      prog: function () { return Math.min(2, S.arenaWins || 0); }, goal: 2,
      reward: { ruby: 40 }, rewardDesc: '💎 ×40'
    }
  ];

  // ---- CSS (injected once) ----
  if (!document.getElementById('evd-style')) {
    var css = [
      /* body padding */
      '#events .body{padding:6px 16px 16px}',

      /* section header */
      '.evd-sec{font-size:13px;font-weight:800;margin:14px 0 8px;display:flex;align-items:center;gap:6px}',
      '.evd-sec .sub{font-size:10.5px;font-weight:500;color:var(--muted)}',
      '.evd-sec:first-child{margin-top:2px}',

      /* 7-day calendar strip */
      '.evd-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:4px}',
      '.evd-dc{border-radius:12px;padding:8px 4px;text-align:center;background:var(--panel2);border:1px solid var(--line);transition:transform .1s,box-shadow .1s}',
      '.evd-dc.claimed{border-color:var(--nature,#22c55e);background:rgba(34,197,94,.1)}',
      '.evd-dc.today{border-color:var(--gold);box-shadow:0 0 14px rgba(245,196,81,.35)}',
      '.evd-dc .di{font-size:9px;color:var(--muted);font-weight:700;margin-bottom:3px}',
      '.evd-dc .ic{font-size:clamp(16px,2vw,22px);line-height:1.2}',
      '.evd-dc .ds{font-size:8.5px;color:var(--muted);margin-top:3px;line-height:1.2}',
      '.evd-dc .ck{font-size:14px;color:var(--nature,#22c55e)}',
      '.evd-claim-row{text-align:center;margin:6px 0 2px}',
      '.evd-clmbtn{padding:9px 28px;border:none;border-radius:20px;font-weight:800;font-size:13px;font-family:inherit;cursor:pointer;background:linear-gradient(135deg,var(--gold),#d99a2b);color:#3a2600}',
      '.evd-clmbtn:disabled{opacity:.4;cursor:default;filter:grayscale(.5)}',

      /* daily mission rows */
      '.evd-mrow{display:flex;align-items:center;gap:10px;border-radius:14px;padding:11px 14px;background:var(--panel2);border:1px solid var(--line);margin-bottom:8px}',
      '.evd-mrow.done{opacity:.55}',
      '.evd-mrow.ready{border-color:var(--gold);box-shadow:0 0 14px rgba(245,196,81,.26)}',
      '.evd-mic{font-size:clamp(20px,2vw,28px);flex:none;width:clamp(32px,2.5vw,42px);height:clamp(32px,2.5vw,42px);text-align:center;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:10px}',
      '.evd-mic img{width:100%;height:100%;object-fit:cover;display:block}',
      '.evd-mmid{flex:1;min-width:0}',
      '.evd-mnm{font-weight:800;font-size:clamp(12px,1.15vw,16px)}',
      '.evd-bar{height:7px;border-radius:4px;background:#0c0c16;overflow:hidden;border:1px solid var(--line);margin:5px 0 3px}',
      '.evd-bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--glow),var(--gold))}',
      '.evd-mpg{font-size:10px;color:var(--muted)}',
      '.evd-mrt{flex:none;text-align:right;min-width:90px}',
      '.evd-mrw{font-size:11.5px;font-weight:800;color:var(--gold);white-space:nowrap}',
      '.evd-mbtn{margin-top:6px;padding:6px 14px;border:none;border-radius:16px;cursor:pointer;font-weight:800;font-size:11.5px;font-family:inherit;background:linear-gradient(135deg,var(--gold),#d99a2b);color:#3a2600}',
      '.evd-mbtn:disabled{opacity:.4;cursor:default;filter:grayscale(.4)}',
      '.evd-mdone{font-size:11px;color:var(--nature,#22c55e);font-weight:800}',

      /* weekly event banner */
      '.evd-banner{border-radius:16px;padding:15px 16px;background:linear-gradient(120deg,rgba(236,72,153,.22),rgba(139,92,246,.2));border:1px solid rgba(236,72,153,.4);display:flex;align-items:center;gap:13px;margin-bottom:6px}',
      '.evd-bic{font-size:clamp(30px,3vw,42px);flex:none}',
      '.evd-bmid{flex:1;min-width:0}',
      '.evd-bnm{font-weight:800;font-size:clamp(14px,1.3vw,18px)}',
      '.evd-bds{font-size:11.5px;color:var(--muted);margin:3px 0 8px}',
      '.evd-bbtn{padding:8px 18px;border:none;border-radius:16px;cursor:pointer;font-weight:800;font-size:12px;font-family:inherit;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff}'
    ].join('');
    var st = document.createElement('style'); st.id = 'evd-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  // ---- handlers exposed globally ----

  // Claim next login day (once per calendar-day)
  window.evdClaimLogin = function () {
    var stamp = todayStamp();
    if (S.login.lastStamp === stamp) { G.toast('รับแล้ววันนี้ — กลับมาพรุ่งนี้ 🌙'); return; }
    var nextDay = S.login.claimed.length; // 0-based index into LOGIN_DAYS
    if (nextDay >= LOGIN_DAYS.length) { G.toast('ครบ 7 วันแล้ว 🎉'); return; }
    var cfg = LOGIN_DAYS[nextDay];
    // handle mats separately (not a GAME currency key)
    var grantObj = {};
    for (var k in cfg.reward) {
      if (k !== 'mats') grantObj[k] = cfg.reward[k];
    }
    if (Object.keys(grantObj).length) G.grant(grantObj);
    if (cfg.reward.mats) {
      S.inventory = S.inventory || {};
      S.inventory.mats = S.inventory.mats || {};
      S.inventory.mats.stone = (S.inventory.mats.stone || 0) + cfg.reward.mats;
      G.save();
    }
    S.login.claimed.push(nextDay);
    S.login.lastStamp = stamp;
    G.save();
    G.toast('✅ รับรางวัลวันที่ ' + cfg.day + ': ' + cfg.desc);
    if (window.SFX) try { SFX('reward'); } catch (e) {}
    renderDaily();
  };

  // Claim a daily mission reward (once per calendar day per mission id)
  window.evdClaimMission = function (id) {
    checkDailyReset();
    var m = MISSIONS.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    if (S.daily.claimed.indexOf(id) >= 0) { G.toast('รับแล้ววันนี้'); return; }
    if (m.prog() < m.goal) { G.toast('ยังทำไม่ครบ'); return; }
    S.daily.claimed.push(id);
    G.grant(m.reward);
    G.save();
    G.toast('✅ ภารกิจสำเร็จ: ' + m.rewardDesc);
    if (window.SFX) try { SFX('reward'); } catch (e) {}
    renderDaily();
  };

  // ---- render ----
  function renderDaily() {
    var body = document.querySelector('#events .body');
    if (!body) return;
    checkDailyReset();

    var stamp = todayStamp();
    var claimedDays = S.login.claimed || [];
    var alreadyTodayLogin = S.login.lastStamp === stamp;
    var nextDayIdx = claimedDays.length; // next unclaimed day index (0-6)

    // (A) 7-Day Login Calendar
    var dayCards = LOGIN_DAYS.map(function (cfg, idx) {
      var isClaimed = claimedDays.indexOf(idx) >= 0;
      var isNext = idx === nextDayIdx && !alreadyTodayLogin;
      return '<div class="evd-dc ' + (isClaimed ? 'claimed' : isNext ? 'today' : '') + '">' +
        '<div class="di">' + cfg.label + '</div>' +
        '<div class="ic">' + (isClaimed ? '<span class="ck">✓</span>' : cfg.icon) + '</div>' +
        '<div class="ds">' + cfg.desc + '</div>' +
        '</div>';
    }).join('');

    var canClaim = nextDayIdx < LOGIN_DAYS.length && !alreadyTodayLogin;
    var claimBtnLabel = canClaim
      ? 'รับวันที่ ' + (nextDayIdx + 1)
      : (nextDayIdx >= LOGIN_DAYS.length ? 'ครบ 7 วันแล้ว 🎉' : 'รับแล้ววันนี้ ✓');

    var calHTML =
      '<div class="evd-sec">📅 เช็คอินรายวัน <span class="sub">7 วัน · วันที่ ' + claimedDays.length + '/7</span></div>' +
      '<div class="evd-cal">' + dayCards + '</div>' +
      '<div class="evd-claim-row"><button class="evd-clmbtn" onclick="evdClaimLogin()"' +
      (canClaim ? '' : ' disabled') + '>' + claimBtnLabel + '</button></div>';

    // (B) Daily Missions
    var missionHTML = '<div class="evd-sec">⚔️ ภารกิจรายวัน <span class="sub">รีเซ็ตทุกวัน</span></div>' +
      MISSIONS.map(function (m) {
        var cur = m.prog(), pct = Math.min(100, Math.round(cur / m.goal * 100));
        var claimed = S.daily.claimed.indexOf(m.id) >= 0;
        var ready = !claimed && cur >= m.goal;
        return '<div class="evd-mrow ' + (claimed ? 'done' : ready ? 'ready' : '') + '">' +
          '<div class="evd-mic"><img src="icons/cat/ev_' + m.id + '.png" alt="" ' +
            'onerror="this.outerHTML=\'' + m.ic + '\'"></div>' +
          '<div class="evd-mmid">' +
            '<div class="evd-mnm">' + m.name + '</div>' +
            '<div class="evd-bar"><i style="width:' + pct + '%"></i></div>' +
            '<div class="evd-mpg">' + Math.min(cur, m.goal) + '/' + m.goal + '</div>' +
          '</div>' +
          '<div class="evd-mrt">' +
            '<div class="evd-mrw">' + m.rewardDesc + '</div>' +
            (claimed
              ? '<div class="evd-mdone">✓ รับแล้ว</div>'
              : '<button class="evd-mbtn" onclick="evdClaimMission(\'' + m.id + '\')"' + (ready ? '' : ' disabled') + '>' +
                (ready ? 'รับรางวัล' : 'ยังไม่ถึง') + '</button>') +
          '</div>' +
          '</div>';
      }).join('');

    // (C) Weekly Event Banner
    var eventHTML =
      '<div class="evd-sec">🎆 อีเวนต์ประจำสัปดาห์ <span class="sub">เหลือ 5 วัน</span></div>' +
      '<div class="evd-banner">' +
        '<div class="evd-bic">⚔️</div>' +
        '<div class="evd-bmid">' +
          '<div class="evd-bnm">มหาศึกนางละเวง</div>' +
          '<div class="evd-bds">เก็บเหรียญอีเวนต์แลกฮีโร่ Mythic · นางละเวง · รางวัลสูงสุด 💎 ×2,000</div>' +
          '<button class="evd-bbtn" onclick="evdEventDetail()">ดูรายละเอียด ›</button>' +
        '</div>' +
      '</div>';

    // (D) Existing static content placeholder (the original #dailyList is now inside .body)
    // We inject our sections above it, then ensure #dailyList is cleared (we own its parent now)
    body.innerHTML = calHTML + missionHTML + eventHTML + '<div id="dailyList"></div>';
  }

  // Expose weekly event detail toast
  window.evdEventDetail = function () {
    G.toast('🎆 มหาศึกนางละเวง: เก็บเหรียญอีเวนต์จากด่านพิเศษ แลกรับนางละเวง (Mythic) · รางวัลอันดับ: 💎 ×2,000 + เครื่องประดับ Legend');
  };

  // Override renderDaily globally (game.html's version is now replaced)
  window.renderDaily = renderDaily;

  // ---- hook go() to re-render on screen entry ----
  function boot() {
    if (!window.__evdGoHooked && typeof window.go === 'function') {
      var _go = window.go;
      window.go = function (id) {
        var r = _go.apply(this, arguments);
        try { if (id === 'events') renderDaily(); } catch (e) {}
        return r;
      };
      window.__evdGoHooked = true;
    }
    // initial render if #events is already visible
    try { renderDaily(); } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
