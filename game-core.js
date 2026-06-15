/* game-core.js — shared runtime for Hero Legends Thai web prototype.
 * Loaded AFTER game.html's inline script. Feature modules (feat-*.js) load after
 * this and enhance individual screens by overriding their render fns + using GAME.
 *
 * CONTRACT for feature modules:
 *   - Read roster: GAME.heroes()  -> the HEROES array (id,th,r,e,c,hp,atk,def,spd,star,skills)
 *   - State:       GAME.state     -> {gold,ruby,energy,energyMax,arenaCoin,guildCoin,eventCoin,
 *                                     owned:{heroId:{level,star}}, inventory:{shard:{},equip:[],mats:{}},
 *                                     progress:{cleared:{stageId:stars}}, equipment:{heroId:{slot:item}}}
 *   - Currency:    GAME.spend(cur,n)->bool · GAME.grant({gold:100,ruby:5,...}) · GAME.fmt(n)
 *   - UI helpers:  GAME.go(id) · GAME.toast(msg) · GAME.modal(html[,onClose]) · GAME.closeModal()
 *   - Persist:     GAME.save() (auto-called by spend/grant) · GAME.refresh() (updates [data-cur] displays)
 *   - Owned:       GAME.own(heroId,opts) · GAME.isOwned(id) · GAME.ownedList()
 *   - To make a screen functional: redefine its global render fn (e.g. window.renderShop=...)
 *     then call GAME.rerender(screenId) or just rely on go() calling it.
 */
window.GAME = (function () {
  const DEFAULT = {
    gold: 1240500, ruby: 8420, energy: 112, energyMax: 120,
    arenaCoin: 1240, guildCoin: 1820, eventCoin: 460,
    owned: {}, inventory: { shard: {}, equip: [], mats: { stone: 20, dust: 50 } },
    progress: { cleared: {} }, equipment: {},
  };
  let S;
  try { S = Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem('hlt_save') || '{}')); }
  catch (e) { S = JSON.parse(JSON.stringify(DEFAULT)); }

  function save() { try { localStorage.setItem('hlt_save', JSON.stringify(S)); } catch (e) {} }
  function fmt(n) { n = Math.round(n || 0); return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n.toLocaleString(); }
  function heroes() { return window.HEROES || []; }

  function ensureOwned() {
    if (Object.keys(S.owned).length) return;
    // demo: start owning the 11 launch heroes
    const launch = ['hero_phraaphai','hero_srisuwan','hero_sudsakorn','hero_sinsamut','hero_nang_ngeuak',
      'hero_phisuea_samut','hero_nang_laweng','hero_ma_nin_mangkorn','hero_suwanmali','hero_phra_ruesi','hero_usaren'];
    heroes().forEach(h => { if (launch.includes(h.id)) S.owned[h.id] = { level: 24, star: h.star || 3 }; });
    save();
  }
  function own(id, opts) { S.owned[id] = Object.assign({ level: 1, star: (heroes().find(h=>h.id===id)||{}).star || 3 }, opts || {}); save(); }
  function isOwned(id) { return !!S.owned[id]; }
  function ownedList() { return Object.keys(S.owned); }

  function spend(cur, n) {
    if ((S[cur] || 0) < n) { toast('❌ ' + curName(cur) + 'ไม่พอ'); return false; }
    S[cur] -= n; save(); refresh(); return true;
  }
  function grant(obj) { for (const k in obj) S[k] = (S[k] || 0) + obj[k]; save(); refresh(); }
  function curName(c) { return { gold: 'ทอง', ruby: 'เพชร', energy: 'พลังงาน', arenaCoin: 'เหรียญสังเวียน', guildCoin: 'เหรียญกิลด์', eventCoin: 'เหรียญอีเวนต์' }[c] || c; }

  // update any element with data-cur="gold" (textContent = formatted value)
  function refresh() {
    document.querySelectorAll('[data-cur]').forEach(el => {
      const c = el.getAttribute('data-cur');
      el.textContent = c === 'energy' ? (S.energy + '/' + S.energyMax) : fmt(S[c]);
    });
  }

  function go(id) {
    if (window.go) return window.go(id); // game.html owns the screen switcher
  }
  function toast(m) {
    const t = document.getElementById('toast'); if (!t) return;
    t.textContent = m; t.classList.add('on');
    clearTimeout(window.__gtt); window.__gtt = setTimeout(() => t.classList.remove('on'), 2000);
  }
  // re-run a screen's render (feature modules name theirs render<Cap>)
  function rerender(id) {
    const map = { summon: 'renderSummon', shop: 'renderShop', arena: 'renderArena', guild: 'renderGuild',
      events: 'renderEvents', mail: 'renderMail', modes: 'renderModes', heroes: 'renderHeroes',
      inventory: 'renderInventory' };
    const fn = window[map[id]]; if (typeof fn === 'function') try { fn(); } catch (e) {}
  }

  // ---- modal/overlay (for gacha results, confirms, etc.) ----
  function modal(html, onClose) {
    closeModal();
    const ov = document.createElement('div'); ov.id = 'gmodal';
    ov.style.cssText = 'position:absolute;inset:0;z-index:50;background:rgba(8,8,14,.78);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;animation:fade .2s ease';
    const box = document.createElement('div');
    box.style.cssText = 'max-width:78%;max-height:86%;overflow:auto;background:#161624;border:1px solid #2c2c46;border-radius:16px;padding:18px 20px;box-shadow:0 10px 50px rgba(0,0,0,.6)';
    box.innerHTML = html;
    ov.appendChild(box);
    ov.addEventListener('click', e => { if (e.target === ov) { closeModal(); onClose && onClose(); } });
    (document.getElementById('stage') || document.body).appendChild(ov);
    return box;
  }
  function closeModal() { const m = document.getElementById('gmodal'); if (m) m.remove(); }

  ensureOwned();
  return { state: S, save, load: () => S, fmt, heroes, ensureOwned, own, isOwned, ownedList,
    spend, grant, curName, refresh, go, toast, rerender, modal, closeModal };
})();
