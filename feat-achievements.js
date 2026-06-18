/* feat-achievements.js — Hero Legends Thai · ภารกิจสะสม (Achievements)
 * เป้าหมายระยะยาว + รับรางวัลครั้งเดียว. อ่าน progress จาก GAME.state.
 * เพิ่มหน้า #achievements (ปุ่มข้าง hub 🏆), แถบสรุปจำนวนที่รับได้.
 * Conflict-free: inject screen, persist GAME.state.ach = {id:true}, CSS prefixed ach-.
 */
(function () {
  'use strict';
  if (!window.GAME) { console.warn('[ach] GAME missing'); return; }
  var G = window.GAME, S = G.state;
  if (!S.ach || typeof S.ach !== 'object') S.ach = {};

  function ownedCount() { return Object.keys(S.owned || {}).length; }
  function clearedCount() { return Object.keys((S.progress && S.progress.cleared) || {}).length; }
  function maxStar() { var m = 0; for (var k in (S.owned || {})) m = Math.max(m, (S.owned[k] || {}).star || 0); return m; }
  function maxLevel() { var m = 0; for (var k in (S.owned || {})) m = Math.max(m, (S.owned[k] || {}).level || 0); return m; }
  function bondsUnlocked() {
    if (typeof window.bondsActive !== 'function') return 0;
    return window.bondsActive(Object.keys(S.owned || {})).length;
  }

  // id, icon, name, desc, goal, prog()→current, reward {ruby|gold|...}
  var ACH = [
    { id: 'collect5', ic: '🧩', name: 'นักสะสมเริ่มต้น', desc: 'ครอบครองฮีโร่ 5 ตัว', goal: 5, prog: ownedCount, reward: { ruby: 200 } },
    { id: 'collect15', ic: '📦', name: 'นักสะสมมือโปร', desc: 'ครอบครองฮีโร่ 15 ตัว', goal: 15, prog: ownedCount, reward: { ruby: 500 } },
    { id: 'collect24', ic: '👑', name: 'ครบทีมตำนาน', desc: 'ครอบครองฮีโร่ 24 ตัว', goal: 24, prog: ownedCount, reward: { ruby: 1200 } },
    { id: 'clear1', ic: '🗺️', name: 'ก้าวแรกผจญภัย', desc: 'ผ่านด่าน 1 ด่าน', goal: 1, prog: clearedCount, reward: { gold: 50000 } },
    { id: 'clear8', ic: '⚔️', name: 'นักผจญภัย', desc: 'ผ่านด่าน 8 ด่าน', goal: 8, prog: clearedCount, reward: { ruby: 300 } },
    { id: 'summon', ic: '🔮', name: 'เริ่มอัญเชิญ', desc: 'อัญเชิญฮีโร่ครั้งแรก', goal: 1, prog: function () { return (S.pity || 0) > 0 ? 1 : 0; }, reward: { gold: 100000 } },
    { id: 'star6', ic: '⭐', name: 'ติดดาวสูงสุด', desc: 'ฮีโร่ดาว 6 ขึ้นไป', goal: 6, prog: maxStar, reward: { ruby: 400 } },
    { id: 'lv40', ic: '📈', name: 'ฝึกปรือ', desc: 'อัปฮีโร่ถึงเลเวล 40', goal: 40, prog: maxLevel, reward: { ruby: 300 } },
    { id: 'arena', ic: '🏅', name: 'นักสู้สังเวียน', desc: 'เรตติ้งสังเวียน 2400', goal: 2400, prog: function () { return S.arenaRating || 0; }, reward: { ruby: 300 } },
    { id: 'rich', ic: '🪙', name: 'เศรษฐีสมุทร', desc: 'มีทอง 1,000,000', goal: 1000000, prog: function () { return S.gold || 0; }, reward: { ruby: 200 } },
    { id: 'bond1', ic: '🔗', name: 'สายสัมพันธ์แรก', desc: 'ปลดล็อกสายสัมพันธ์ 1 สาย', goal: 1, prog: bondsUnlocked, reward: { ruby: 250 } },
    { id: 'bond5', ic: '💞', name: 'ผูกพันลึกซึ้ง', desc: 'ปลดล็อกสายสัมพันธ์ 5 สาย', goal: 5, prog: bondsUnlocked, reward: { ruby: 600 } }
  ];

  function claimable(a) { return a.prog() >= a.goal && !S.ach[a.id]; }
  function rewardText(r) {
    return Object.keys(r).map(function (k) {
      return (k === 'ruby' ? '💎 ' : k === 'gold' ? '🪙 ' : '') + G.fmt(r[k]);
    }).join(' · ');
  }

  if (!document.getElementById('ach-style')) {
    var css = [
      '#achievements .body{padding:6px 16px 16px}',
      '.ach-sum{font-size:12px;color:var(--muted);margin:0 0 12px;font-weight:600}.ach-sum b{color:var(--gold)}',
      '.ach-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(clamp(280px,32vw,440px),1fr));gap:12px}',
      '.ach-card{display:flex;align-items:center;gap:13px;border-radius:14px;padding:13px 15px;background:var(--panel2);border:1px solid var(--line)}',
      '.ach-card.done{opacity:.6}',
      '.ach-card.ready{border-color:var(--gold);box-shadow:0 0 16px rgba(245,196,81,.28)}',
      '.ach-ic{font-size:clamp(26px,2.4vw,36px);flex:none;width:clamp(40px,3vw,52px);height:clamp(40px,3vw,52px);text-align:center;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:11px}',
      '.ach-ic img{width:100%;height:100%;object-fit:cover;display:block}',
      '.ach-mid{flex:1;min-width:0}',
      '.ach-nm{font-weight:800;font-size:clamp(13px,1.2vw,17px)}',
      '.ach-ds{font-size:11px;color:var(--muted);margin:1px 0 6px}',
      '.ach-bar{height:8px;border-radius:5px;background:#0c0c16;overflow:hidden;border:1px solid var(--line)}',
      '.ach-bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--glow),var(--gold))}',
      '.ach-pg{font-size:10px;color:var(--muted);margin-top:3px}',
      '.ach-rw{flex:none;text-align:right;min-width:96px}',
      '.ach-rwv{font-size:12px;font-weight:800;color:var(--gold);white-space:nowrap}',
      '.ach-btn{margin-top:6px;padding:7px 15px;border:none;border-radius:18px;cursor:pointer;font-weight:800;font-size:12px;font-family:inherit;background:linear-gradient(135deg,var(--gold),#d99a2b);color:#3a2600}',
      '.ach-btn:disabled{opacity:.4;cursor:default;filter:grayscale(.4)}',
      '.ach-done{font-size:11px;color:var(--nature);font-weight:800}'
    ].join('');
    var st = document.createElement('style'); st.id = 'ach-style'; st.textContent = css; document.head.appendChild(st);
  }

  function ensureScreen() {
    if (!document.getElementById('achievements')) {
      var sec = document.createElement('section');
      sec.className = 'screen'; sec.id = 'achievements';
      sec.innerHTML = '<div class="topbar"><div class="back glass" onclick="go(\'hub\')">‹ กลับ</div>' +
        '<div class="h2" style="margin:0 0 0 10px">ภารกิจสะสม <span class="sub">Achievements</span></div></div>' +
        '<div class="body" id="achBody"></div>';
      (document.getElementById('stage') || document.body).appendChild(sec);
    }
    var side = document.querySelector('#hub .side');
    if (side && !side.querySelector('[data-ach]')) {
      var b = document.createElement('div');
      b.className = 'sbtn glass'; b.title = 'ภารกิจสะสม'; b.setAttribute('data-ach', '1');
      b.setAttribute('onclick', "go('achievements')"); b.textContent = '🏆';
      side.appendChild(b);
    }
  }

  window.achClaim = function (id) {
    var a = ACH.find(function (x) { return x.id === id; });
    if (!a || !claimable(a)) return;
    S.ach[id] = true;
    G.grant(a.reward);
    G.save();
    G.toast('🏆 รับรางวัล: ' + rewardText(a.reward));
    if (window.SFX) try { SFX('reward'); } catch (e) {}
    renderAch();
  };

  function renderAch() {
    var body = document.getElementById('achBody'); if (!body) return;
    var ready = ACH.filter(claimable).length;
    var done = ACH.filter(function (a) { return S.ach[a.id]; }).length;
    var cards = ACH.map(function (a) {
      var cur = a.prog(), pct = Math.min(100, Math.round(cur / a.goal * 100));
      var got = !!S.ach[a.id], can = claimable(a);
      return '<div class="ach-card ' + (got ? 'done' : can ? 'ready' : '') + '">' +
        '<div class="ach-ic"><img src="icons/cat/ach_' + a.id + '.png" alt="" ' +
          'onerror="this.outerHTML=\'' + a.ic + '\'"></div>' +
        '<div class="ach-mid"><div class="ach-nm">' + a.name + '</div><div class="ach-ds">' + a.desc + '</div>' +
        '<div class="ach-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="ach-pg">' + G.fmt(Math.min(cur, a.goal)) + '/' + G.fmt(a.goal) + '</div></div>' +
        '<div class="ach-rw"><div class="ach-rwv">' + rewardText(a.reward) + '</div>' +
        (got ? '<div class="ach-done">✓ รับแล้ว</div>'
             : '<button class="ach-btn" onclick="achClaim(\'' + a.id + '\')"' + (can ? '' : ' disabled') + '>' + (can ? 'รับรางวัล' : 'ยังไม่ถึง') + '</button>') +
        '</div></div>';
    }).join('');
    body.innerHTML = '<div class="ach-sum">รับได้ตอนนี้ <b>' + ready + '</b> · สำเร็จแล้ว ' + done + '/' + ACH.length + '</div>' +
      '<div class="ach-grid">' + cards + '</div>';
  }
  window.renderAchievements = renderAch;

  function boot() {
    ensureScreen();
    if (!window.__achGoHooked && typeof window.go === 'function') {
      var _go = window.go;
      window.go = function (id) {
        var r = _go.apply(this, arguments);
        try { ensureScreen(); if (id === 'achievements') renderAch(); } catch (e) {}
        return r;
      };
      window.__achGoHooked = true;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
