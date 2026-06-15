/* feat-campaign.js — Campaign / Stage Select for Hero Legends Thai.
 * Loads AFTER game.html + game-core.js. Overrides ONLY renderStages (screen id="stages").
 *
 * What it adds:
 *   - Chapters 1-8, each with several stages (boss on the last stage).
 *   - Cleared stages show 1-3 stars from GAME.state.progress.cleared[stageId].
 *   - Linear unlock: a stage unlocks only after the previous one is cleared (lock icon + disabled).
 *   - Energy cost per stage (⚡6 / ⚡8 boss) checked against GAME.state.energy before "เริ่มรบ".
 *   - On launch: keeps existing flow (calls global launch() -> team builder -> battle).
 *   - On returning a win: reads a result handoff (hlt_result), marks cleared with stars,
 *     grants first-clear reward via window.ECON.stageReward if present, else a sane default.
 *   - "ด่านถัดไปแนะนำ" highlight on the first not-yet-cleared unlocked stage.
 *
 * Conflict-safe: only redefines window.renderStages, adds window.campaignLaunch (its own
 * launcher), and injects a <style> with cmpg- prefixed classes. Does not touch go/toast/detail/HEROES.
 */
(function () {
  'use strict';
  if (!window.GAME) { console.warn('[feat-campaign] GAME not ready'); return; }

  // ---- inject scoped styles (cmpg- prefix) ----
  if (!document.getElementById('cmpg-style')) {
    const st = document.createElement('style');
    st.id = 'cmpg-style';
    st.textContent = `
    .cmpg-chaps{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 12px}
    .cmpg-chap{padding:6px 12px;border-radius:16px;font-size:11.5px;cursor:pointer;font-weight:700;
      background:var(--panel2);border:1px solid var(--line);display:flex;align-items:center;gap:6px;transition:transform .1s}
    .cmpg-chap:hover{transform:translateY(-1px)}
    .cmpg-chap.on{background:linear-gradient(135deg,var(--glow),var(--glow2));border-color:transparent}
    .cmpg-chap.locked{opacity:.45;cursor:default}
    .cmpg-chap .cmpg-cs{font-size:9px;color:var(--gold)}
    .cmpg-chap.on .cmpg-cs{color:#fff}
    .cmpg-banner{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:14px;margin-bottom:12px;
      background:linear-gradient(90deg,rgba(139,92,246,.28),rgba(245,196,81,.06))}
    .cmpg-banner .cmpg-em{font-size:34px;flex:none}
    .cmpg-banner .cmpg-bt{font-weight:800;font-size:15px}
    .cmpg-banner .cmpg-bs{font-size:11px;color:var(--muted);margin-top:2px}
    .cmpg-prog{height:7px;border-radius:5px;background:#0c0c16;overflow:hidden;margin-top:6px;width:160px}
    .cmpg-prog>i{display:block;height:100%;background:linear-gradient(90deg,var(--gold),#ffe9a8)}
    .cmpg-row{display:flex;align-items:center;gap:12px;border-radius:13px;margin-bottom:9px;padding:11px 14px;
      border:1px solid var(--line);background:var(--panel);backdrop-filter:blur(8px);position:relative;
      transition:transform .1s,box-shadow .12s}
    .cmpg-row.cmpg-open{cursor:pointer}
    .cmpg-row.cmpg-open:hover{transform:translateY(-2px)}
    .cmpg-row.cmpg-locked{opacity:.55}
    .cmpg-row.cmpg-rec{border-color:var(--glow);box-shadow:0 0 16px rgba(139,92,246,.4);
      background:linear-gradient(90deg,rgba(139,92,246,.22),var(--panel))}
    .cmpg-ic{font-size:22px;width:30px;text-align:center;flex:none}
    .cmpg-mid{flex:1;min-width:0}
    .cmpg-mid .cmpg-t{font-weight:700;font-size:13px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
    .cmpg-mid .cmpg-sub{font-size:10.5px;color:var(--muted);margin-top:2px}
    .cmpg-stars{font-size:11px;letter-spacing:1px;color:var(--gold)}
    .cmpg-stars .o{color:#44445e}
    .cmpg-boss{color:var(--gold);font-size:10px;font-weight:800}
    .cmpg-rectag{background:var(--glow);color:#fff;font-size:8.5px;padding:1px 7px;border-radius:8px;font-weight:800}
    .cmpg-clear{background:var(--nature);color:#06210f;font-size:8.5px;padding:1px 7px;border-radius:8px;font-weight:800}
    .cmpg-energy{font-size:11px;font-weight:700;color:var(--gold);white-space:nowrap}
    .cmpg-energy.cmpg-noenergy{color:var(--fire)}
    .cmpg-go{padding:7px 16px;font-size:12px}
    .cmpg-lock{font-size:18px;color:var(--muted);width:64px;text-align:center;flex:none}
    .cmpg-rewbox{display:flex;gap:14px;align-items:center;margin:6px 0 10px;flex-wrap:wrap}
    .cmpg-rewbox b{color:var(--gold)}
    `;
    document.head.appendChild(st);
  }

  // ---- Campaign data: 8 chapters of Phra Aphai Mani saga ----
  // stage = [id, name, enemy, isBoss], energy auto: 6 normal / 8 boss.
  const CHAPTERS = [
    { ch: 1, th: 'เสียงปี่กลางสมุทร', stages: [
      ['1-1','เสียงปี่กลางสายลม','โจรสลัด',false],
      ['1-2','ท่าเรือเมืองรัตนา','โจรสลัด',false],
      ['1-3','ออกเดินทาง','โจรสลัด',false],
      ['1-4','เกาะแก้วพิสดาร','ฤๅษีจำแลง',true],
    ]},
    { ch: 2, th: 'ถ้ำนางผีเสื้อสมุทร', stages: [
      ['2-1','คลื่นลมเปลี่ยนทิศ','ปลายักษ์',false],
      ['2-3','หาดทรายต้องมนตร์','นางมายา',false],
      ['2-5','ปากถ้ำมืดมิด','สมุนผีเสื้อ',false],
      ['2-6','ถ้ำนางผีเสื้อสมุทร','ผีเสื้อสมุทร',true],
    ]},
    { ch: 3, th: 'หนีข้ามมหาสมุทร', stages: [
      ['3-1','ขี่เงือกหนีภัย','คลื่นอาคม',false],
      ['3-3','เกาะปะการังเพลิง','อสูรน้อย',false],
      ['3-6','ศึกอสูรทะเล','อสูรทะเล',true],
    ]},
    { ch: 4, th: 'เมืองผลึกการะเวก', stages: [
      ['4-1','ประตูเมืองคริสตัล','ทหารผลึก',false],
      ['4-2','ตลาดอัญมณี','โจรผลึก',false],
      ['4-4','เมืองผลึก','แม่ทัพผลึก',false],
      ['4-6','ท้องพระโรงสุวรรณ','ราชาผลึก',true],
    ]},
    { ch: 5, th: 'ศึกชิงสมุทร', stages: [
      ['5-2','กองเรือลังกา','พลเรือลังกา',false],
      ['5-4','เพลิงกลางสมุทร','แม่ทัพเรือ',false],
      ['5-7','ศึกอุศเรนชิงสมุทร','อุศเรน',true],
    ]},
    { ch: 6, th: 'ปราบม้านิลมังกร', stages: [
      ['6-1','ป่าหิมพานต์','สัตว์ป่าอาคม',false],
      ['6-3','หุบเขามังกร','ลูกมังกร',false],
      ['6-6','ปราบม้านิลมังกร','ม้านิลมังกร',true],
    ]},
    { ch: 7, th: 'มหาศึกนางละเวง', stages: [
      ['7-2','กำแพงนครลังกา','ทัพลังกา',false],
      ['7-4','รูปวาดต้องมนตร์','สาวสนมจำแลง',false],
      ['7-5','ลานประลองศึก','ขุนพลลังกา',false],
      ['7-7','มหาศึกนางละเวง','นางละเวง',true],
    ]},
    { ch: 8, th: 'แสง เงา วิญญาณ', stages: [
      ['8-2','สมรภูมิสุดท้าย','เงาอสูร',false],
      ['8-4','ห้วงสนธยา','วิญญาณโบราณ',false],
      ['8-8','ตื่นรู้แห่งสมุทร','พลังมืดโบราณ',true],
    ]},
  ];

  // flat ordered list of stage ids — used for linear unlock
  const ORDER = [];
  CHAPTERS.forEach(c => c.stages.forEach(s => ORDER.push(s[0])));
  const STAGE_BY_ID = {};
  CHAPTERS.forEach(c => c.stages.forEach(s => { STAGE_BY_ID[s[0]] = { ch: c.ch, s }; }));

  function energyCost(isBoss) { return isBoss ? 8 : 6; }
  function clearedStars(id) {
    const p = (GAME.state.progress && GAME.state.progress.cleared) || {};
    return p[id] | 0; // 0 = not cleared
  }
  function isCleared(id) { return clearedStars(id) > 0; }

  // a stage is unlocked if it's the first stage overall OR the previous stage in ORDER is cleared
  function isUnlocked(id) {
    const idx = ORDER.indexOf(id);
    if (idx <= 0) return true;
    return isCleared(ORDER[idx - 1]);
  }

  // the recommended next stage = first unlocked & not-cleared stage in order
  function recommendedStage() {
    for (const id of ORDER) {
      if (isUnlocked(id) && !isCleared(id)) return id;
    }
    return null;
  }

  // ---- reward for first clear ----
  function rewardFor(id, isBoss, stars) {
    if (window.ECON && typeof window.ECON.stageReward === 'function') {
      try {
        const r = window.ECON.stageReward(id, { isBoss: isBoss, stars: stars });
        if (r && typeof r === 'object') return r;
      } catch (e) { /* fall through to default */ }
    }
    // sane default first-clear reward scaling with chapter
    const ch = (STAGE_BY_ID[id] && STAGE_BY_ID[id].ch) || 1;
    const base = { gold: 2000 * ch, ruby: isBoss ? 60 : 20 };
    return base;
  }
  function rewardText(r) {
    const parts = [];
    if (r.gold) parts.push('🪙 ' + GAME.fmt(r.gold));
    if (r.ruby) parts.push('💎 ' + GAME.fmt(r.ruby));
    if (r.energy) parts.push('⚡ ' + r.energy);
    for (const k in r) { if (!['gold','ruby','energy'].includes(k)) parts.push(k + ' ×' + r[k]); }
    return parts.join(' · ') || 'รางวัล';
  }

  // ---- handle a returning win (handoff from battle in index.html) ----
  // index.html / battle can drop: localStorage.hlt_result = {stage, win:true, stars:1..3}
  function applyReturn() {
    let res = null;
    try { res = JSON.parse(localStorage.getItem('hlt_result') || 'null'); } catch (e) {}
    if (!res || !res.stage) return false;
    // consume it so it applies once
    try { localStorage.removeItem('hlt_result'); } catch (e) {}
    if (!res.win) { GAME.toast('พ่ายแพ้ใน บท ' + res.stage + ' — ลองใหม่อีกครั้ง'); return true; }

    const id = res.stage;
    const meta = STAGE_BY_ID[id];
    const isBoss = meta ? !!meta.s[3] : false;
    const stars = Math.max(1, Math.min(3, res.stars | 0 || 3));
    const prev = clearedStars(id);
    const firstClear = prev === 0;

    if (!GAME.state.progress) GAME.state.progress = {};
    if (!GAME.state.progress.cleared) GAME.state.progress.cleared = {};
    // keep best stars (Nothing is Deleted — progress only grows)
    GAME.state.progress.cleared[id] = Math.max(prev, stars);
    GAME.save();

    if (firstClear) {
      const r = rewardFor(id, isBoss, stars);
      GAME.grant(r);
      GAME.toast('🎉 เคลียร์ บท ' + id + ' ครั้งแรก! รับ ' + rewardText(r));
    } else if (stars > prev) {
      GAME.toast('⭐ บท ' + id + ' ดีขึ้นเป็น ' + stars + ' ดาว!');
    } else {
      GAME.toast('ผ่าน บท ' + id + ' สำเร็จอีกครั้ง');
    }
    return true;
  }

  // ---- launch a stage: spend energy, then keep existing flow ----
  window.campaignLaunch = function (id) {
    if (!isUnlocked(id)) { GAME.toast('🔒 ด่านนี้ยังล็อกอยู่ — ผ่านด่านก่อนหน้าก่อน'); return; }
    const meta = STAGE_BY_ID[id];
    const isBoss = meta ? !!meta.s[3] : false;
    const cost = energyCost(isBoss);
    if ((GAME.state.energy | 0) < cost) {
      GAME.toast('⚡ พลังงานไม่พอ (ต้องการ ' + cost + ') — รอฟื้นฟูหรือซื้อเพิ่ม');
      return;
    }
    // spend energy via GAME (auto-saves + refreshes [data-cur] pills)
    GAME.spend('energy', cost);
    // remember which stage is in play so a returning win can be attributed
    try { localStorage.setItem('hlt_pending_stage', id); } catch (e) {}
    // keep existing flow: go to team builder -> battle. Prefer global launch().
    if (typeof window.launch === 'function') { window.launch(id); }
    else { GAME.go('team'); }
  };

  // ---- current chapter tab state ----
  function defaultChapter() {
    const rec = recommendedStage();
    if (rec && STAGE_BY_ID[rec]) return STAGE_BY_ID[rec].ch;
    return 1;
  }
  let activeChap = null;

  function chapterUnlocked(chNum) {
    const c = CHAPTERS.find(x => x.ch === chNum);
    if (!c) return false;
    return isUnlocked(c.stages[0][0]);
  }
  function chapterClearedCount(chNum) {
    const c = CHAPTERS.find(x => x.ch === chNum);
    if (!c) return 0;
    return c.stages.filter(s => isCleared(s[0])).length;
  }

  // ---- render ----
  function renderStages() {
    const host = document.getElementById('stageList');
    if (!host) return;
    // apply any pending battle result before drawing
    applyReturn();

    if (activeChap == null || !chapterUnlocked(activeChap)) activeChap = defaultChapter();
    const rec = recommendedStage();

    // chapter tabs
    const tabs = CHAPTERS.map(c => {
      const unlocked = chapterUnlocked(c.ch);
      const done = chapterClearedCount(c.ch);
      const cls = 'cmpg-chap' + (c.ch === activeChap ? ' on' : '') + (unlocked ? '' : ' locked');
      const click = unlocked ? ` onclick="window.__cmpgTab(${c.ch})"` : '';
      const tag = unlocked
        ? `<span class="cmpg-cs">${done}/${c.stages.length}</span>`
        : '<span class="cmpg-cs">🔒</span>';
      return `<div class="${cls}"${click}>บท ${c.ch} ${tag}</div>`;
    }).join('');

    const chap = CHAPTERS.find(c => c.ch === activeChap) || CHAPTERS[0];
    const total = chap.stages.length;
    const done = chapterClearedCount(activeChap);
    const pct = total ? Math.round(100 * done / total) : 0;

    const banner = `
      <div class="cmpg-banner">
        <div class="cmpg-em">${done === total ? '👑' : '🗺️'}</div>
        <div style="flex:1">
          <div class="cmpg-bt">บทที่ ${chap.ch} · ${chap.th}</div>
          <div class="cmpg-bs">ความคืบหน้า ${done}/${total} ด่าน${rec && STAGE_BY_ID[rec] && STAGE_BY_ID[rec].ch === activeChap ? ' · มีด่านแนะนำในบทนี้' : ''}</div>
          <div class="cmpg-prog"><i style="width:${pct}%"></i></div>
        </div>
        <div style="text-align:right">
          <div class="cmpg-energy"><span class="ic">⚡</span> <span data-cur="energy">${GAME.state.energy}/${GAME.state.energyMax}</span></div>
        </div>
      </div>`;

    const rows = chap.stages.map(s => {
      const [id, name, enemy, isBoss] = s;
      const unlocked = isUnlocked(id);
      const stars = clearedStars(id);
      const cost = energyCost(isBoss);
      const enough = (GAME.state.energy | 0) >= cost;
      const isRec = id === rec;

      if (!unlocked) {
        return `
        <div class="cmpg-row cmpg-locked">
          <div class="cmpg-ic">🔒</div>
          <div class="cmpg-mid">
            <div class="cmpg-t">บท ${id} — ??? ${isBoss ? '<span class="cmpg-boss">บอส</span>' : ''}</div>
            <div class="cmpg-sub">ผ่านด่านก่อนหน้าเพื่อปลดล็อก</div>
          </div>
          <div class="cmpg-lock">ล็อก</div>
        </div>`;
      }

      const starHtml = stars > 0
        ? `<span class="cmpg-stars">${'★'.repeat(stars)}<span class="o">${'★'.repeat(3 - stars)}</span></span>`
        : '';
      const tags = [];
      if (isRec) tags.push('<span class="cmpg-rectag">ด่านถัดไปแนะนำ</span>');
      if (stars > 0) tags.push('<span class="cmpg-clear">เคลียร์แล้ว</span>');
      if (isBoss) tags.push('<span class="cmpg-boss">บอส</span>');

      return `
      <div class="cmpg-row cmpg-open${isRec ? ' cmpg-rec' : ''}" onclick="window.campaignLaunch('${id}')">
        <div class="cmpg-ic">${isBoss ? '⚔️' : '📜'}</div>
        <div class="cmpg-mid">
          <div class="cmpg-t">บท ${id} — ${name} ${tags.join(' ')}</div>
          <div class="cmpg-sub">ศัตรู: ${enemy} ${starHtml}</div>
        </div>
        <div class="cmpg-energy ${enough ? '' : 'cmpg-noenergy'}">⚡${cost}</div>
        <div class="btn cmpg-go">เริ่มรบ</div>
      </div>`;
    }).join('');

    host.innerHTML = banner + `<div class="cmpg-chaps">${tabs}</div>` + rows;
    GAME.refresh();
  }

  // tab switch handler (kept on window so inline onclick can reach it)
  window.__cmpgTab = function (chNum) {
    if (!chapterUnlocked(chNum)) { GAME.toast('🔒 บทนี้ยังล็อกอยู่'); return; }
    activeChap = chNum;
    renderStages();
  };

  // expose as the global the shell calls
  window.renderStages = renderStages;

  // ---- hook go('stages') so it re-renders idempotently ----
  if (!window.__cmpgWrapped) {
    window.__cmpgWrapped = true;
    const origGo = window.go;
    if (typeof origGo === 'function') {
      window.go = function (id) {
        const r = origGo.apply(this, arguments);
        if (id === 'stages') { try { renderStages(); } catch (e) {} }
        return r;
      };
    }
  }

  // initial render; if stages screen is currently visible, refresh it now
  try { renderStages(); } catch (e) {}
})();
