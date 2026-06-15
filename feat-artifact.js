/* feat-artifact.js — ARTIFACT system (ของวิเศษ) for Hero Legends Thai (GDD §12)
 * Loads AFTER game.html + game-core.js + the 11 existing feat modules.
 * Touches ONLY a NEW 'artifact' screen + adds a 📿 .sbtn to the hub side stack.
 * - Injects <section class="screen" id="artifact"> into #stage (before #toast)
 * - Adds a 📿 .sbtn to the hub .side -> go('artifact')
 * - Defines window.renderArtifact() (called by wrapped go())
 * - ~5 canon artifacts, each with a unique passive + statBonus (% additive)
 * - Assign ONE artifact to ONE OWNED hero (GAME.state.artifacts = {heroId:artifactId})
 *   via GAME.modal hero picker; each artifact lives on at most one hero.
 * - Exposes window.artifactBonus(heroId) -> {hp,atk,def,spd} additive flat values
 *   (derived from the hero's base stat * the artifact's % bonus) for other screens.
 * Uses window.GAME for all state/persistence/modal/toast. Idempotent. Thai UI.
 */
(function () {
  'use strict';
  if (!window.GAME) { return; } // game-core not ready

  var G = window.GAME;

  // ---------- canon artifacts (GDD §12 — unique passive per item) ----------
  // statBonus values are PERCENT bonuses applied to the hero's base stat.
  var ARTIFACTS = [
    {
      id: 'art_pi',
      th: 'ปี่วิเศษ',
      en: 'Magic Flute',
      ic: '🎵',
      passive: 'เพลงปี่กล่อมนิทรา — โจมตีมีโอกาส 25% สะกดศัตรูให้หลับ 1 เทิร์น (CC)',
      tag: '+sleep / CC',
      statBonus: { atk: 12, spd: 8 }
    },
    {
      id: 'art_staff',
      th: 'ไม้เท้าฤๅษี',
      en: 'Hermit Staff',
      ic: '📿',
      passive: 'มนตร์บำบัด — ทุกต้นเทิร์นฟื้น HP ทีม 4% และล้างสถานะร้าย 1 อย่าง (cleanse)',
      tag: '+heal / cleanse',
      statBonus: { hp: 15, def: 6 }
    },
    {
      id: 'art_portrait',
      th: 'รูปวาดเสน่ห์',
      en: 'Enchanted Portrait',
      ic: '🖼️',
      passive: 'เสน่ห์ต้องจิต — อัลติเมทมีโอกาส 30% สะกดใจศัตรู (charm) ให้โจมตีพวกเดียวกัน',
      tag: '+charm / control',
      statBonus: { atk: 18 }
    },
    {
      id: 'art_conch',
      th: 'หอยสังข์จันทรา',
      en: 'Moon Conch',
      ic: '🐚',
      passive: 'เสียงสังข์เร่งวาระ — เริ่มรบด้วยเกจอัลติเมท +30% และเพิ่มความเร็วทั้งทีม (energy)',
      tag: '+SPD / energy',
      statBonus: { spd: 20, atk: 6 }
    },
    {
      id: 'art_scale',
      th: 'เกล็ดม้านิลมังกร',
      en: 'Nin-Mangkorn Scale',
      ic: '🐲',
      passive: 'เกล็ดอมตะ — ลดดาเมจที่ได้รับ 12% และภูมิคุ้มกันสถานะร้ายเทิร์นแรก (immunity)',
      tag: '+DEF / immunity',
      statBonus: { def: 22, hp: 10 }
    }
  ];
  var ART_BY_ID = {};
  ARTIFACTS.forEach(function (a) { ART_BY_ID[a.id] = a; });
  // expose canon list for other screens that might want to read it
  window.ARTIFACTS = ARTIFACTS;

  // ---------- ensure state shape (additive, never clobber) ----------
  if (!G.state.artifacts || typeof G.state.artifacts !== 'object' || Array.isArray(G.state.artifacts)) {
    G.state.artifacts = {}; // { heroId: artifactId }
  }
  G.save();

  // ---------- one-time CSS (prefixed: art-) ----------
  if (!document.getElementById('art-style')) {
    var st = document.createElement('style');
    st.id = 'art-style';
    st.textContent = [
      '#artifact .art-sum{font-size:11px;color:var(--muted);margin:0 0 12px;font-weight:600}',
      '#artifact .art-sum b{color:var(--gold)}',
      '#artifact .art-list{display:flex;flex-direction:column;gap:9px}',
      '.art-row{display:flex;align-items:center;gap:12px;padding:11px 13px;border-radius:13px;',
      '  background:var(--panel2);border:1px solid var(--line);transition:transform .12s,box-shadow .12s}',
      '.art-row:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(139,92,246,.28)}',
      '.art-row.art-assigned{border-color:var(--myth);box-shadow:0 0 12px rgba(168,85,247,.30)}',
      '.art-ic{width:46px;height:46px;flex:none;border-radius:12px;display:flex;align-items:center;justify-content:center;',
      '  font-size:26px;background:radial-gradient(circle at 35% 30%,rgba(196,181,253,.25),rgba(109,40,217,.18));',
      '  border:1px solid var(--line)}',
      '.art-gr{flex:1;min-width:0}',
      '.art-nm{font-weight:800;font-size:13.5px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}',
      '.art-en{font-size:10px;color:var(--muted);font-weight:600}',
      '.art-pv{font-size:10.5px;color:var(--muted);margin-top:3px;line-height:1.45}',
      '.art-stats{margin-top:5px;display:flex;gap:6px;flex-wrap:wrap}',
      '.art-chip{font-size:9.5px;font-weight:800;padding:2px 8px;border-radius:9px;',
      '  color:#3a2600;background:linear-gradient(135deg,var(--gold),#d99a2b)}',
      '.art-tag{font-size:9px;font-weight:800;padding:2px 7px;border-radius:8px;color:#fff;background:var(--myth)}',
      '.art-rt{flex:none;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px}',
      '.art-who{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700}',
      '.art-who img{width:30px;height:30px;border-radius:8px;object-fit:cover;object-position:top center;',
      '  border:1.5px solid var(--gold)}',
      '.art-who .art-whonm{max-width:88px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.art-none{font-size:11px;color:var(--muted);font-weight:600}',
      '.art-btn{padding:6px 14px;border-radius:16px;font-size:11px;font-weight:800;cursor:pointer;border:none;',
      '  font-family:inherit;background:linear-gradient(135deg,var(--glow),var(--glow2));color:#fff;',
      '  box-shadow:0 4px 14px rgba(139,92,246,.40)}',
      '.art-btn.art-clear{background:var(--panel2);border:1px solid var(--line);color:var(--ink);box-shadow:none}',
      // picker modal
      '.art-mt{font-size:15px;font-weight:800;margin-bottom:2px;display:flex;align-items:center;gap:8px}',
      '.art-ms{font-size:11px;color:var(--muted);margin-bottom:12px}',
      '.art-pgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;max-width:520px}',
      '.art-pcell{position:relative;border-radius:11px;overflow:hidden;cursor:pointer;aspect-ratio:3/4;',
      '  border:2px solid var(--line);transition:transform .12s}',
      '.art-pcell:hover{transform:translateY(-3px) scale(1.03)}',
      '.art-pcell.Legendary{border-color:var(--leg)}',
      '.art-pcell.Mythic{border-color:var(--myth)}',
      '.art-pcell.Epic{border-color:var(--epic)}',
      '.art-pcell img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}',
      '.art-pcell .art-pnm{position:absolute;left:0;right:0;bottom:0;padding:12px 4px 3px;font-size:9px;',
      '  font-weight:700;text-align:center;background:linear-gradient(transparent,rgba(0,0,0,.9))}',
      '.art-pcell.art-busy::after{content:attr(data-busy);position:absolute;inset:0;display:flex;',
      '  align-items:center;justify-content:center;text-align:center;font-size:8.5px;font-weight:800;',
      '  color:var(--gold);background:rgba(0,0,0,.62);padding:4px}',
      '.art-pempty{font-size:12px;color:var(--muted);padding:26px 8px;text-align:center}',
      '.art-mbtns{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function heroById(id) {
    var list = (G.heroes && G.heroes()) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  // which hero currently holds an artifact (reverse lookup), or null
  function holderOf(artId) {
    var map = G.state.artifacts || {};
    for (var hid in map) if (map[hid] === artId) return hid;
    return null;
  }

  // ---------- PUBLIC API: flat additive bonus for a hero from its artifact ----------
  // Returns {hp,atk,def,spd}. Derived from base stat * artifact percent (rounded).
  window.artifactBonus = function (heroId) {
    var out = { hp: 0, atk: 0, def: 0, spd: 0 };
    if (!heroId) return out;
    var map = (G.state && G.state.artifacts) || {};
    var artId = map[heroId];
    if (!artId) return out;
    var art = ART_BY_ID[artId];
    var h = heroById(heroId);
    if (!art || !h) return out;
    var b = art.statBonus || {};
    ['hp', 'atk', 'def', 'spd'].forEach(function (k) {
      var pct = +b[k] || 0;
      var base = +h[k] || 0;
      out[k] = Math.round(base * pct / 100);
    });
    return out;
  };
  // also expose the canon table accessor for convenience
  window.artifactById = function (id) { return ART_BY_ID[id] || null; };

  // ---------- assign / clear ----------
  window.__artAssign = function (artId, heroId) {
    if (!ART_BY_ID[artId] || !heroId) return;
    if (!G.isOwned(heroId)) { G.toast('❌ ยังไม่ได้ครอบครองฮีโร่ตัวนี้'); return; }
    var map = G.state.artifacts || (G.state.artifacts = {});
    // each artifact -> at most one hero: remove it from any prior holder
    var prev = holderOf(artId);
    if (prev && prev !== heroId) delete map[prev];
    // each hero -> one artifact (replace whatever they held)
    map[heroId] = artId;
    G.save();
    G.closeModal();
    var h = heroById(heroId), a = ART_BY_ID[artId];
    G.toast('📿 มอบ ' + a.th + ' ให้ ' + (h ? h.th : heroId));
    window.renderArtifact();
  };

  window.__artClear = function (artId) {
    var hid = holderOf(artId);
    if (!hid) return;
    delete G.state.artifacts[hid];
    G.save();
    var a = ART_BY_ID[artId];
    G.toast('ถอด ' + (a ? a.th : 'ของวิเศษ') + ' ออกแล้ว');
    window.renderArtifact();
  };

  // ---------- hero picker modal ----------
  window.__artPick = function (artId) {
    var art = ART_BY_ID[artId];
    if (!art) return;
    var owned = (G.ownedList && G.ownedList()) || [];
    var map = G.state.artifacts || {};
    var curHolder = holderOf(artId);

    var cells = owned.map(function (hid) {
      var h = heroById(hid);
      if (!h) return '';
      var heldArt = map[hid]; // artifact this hero already wears (if any)
      var busy = heldArt && heldArt !== artId;
      var isCur = hid === curHolder;
      var busyLabel = '';
      if (isCur) busyLabel = 'กำลังถือ';
      else if (busy) busyLabel = 'ถือ ' + (ART_BY_ID[heldArt] ? ART_BY_ID[heldArt].th : '');
      return '<div class="art-pcell ' + esc(h.r) + (busyLabel ? ' art-busy' : '') + '"' +
        (busyLabel ? ' data-busy="' + esc(busyLabel) + '"' : '') +
        ' title="' + esc(h.th) + '" onclick="__artAssign(\'' + esc(artId) + '\',\'' + esc(hid) + '\')">' +
        '<img src="portraits/' + esc(hid) + '.jpg" alt="" onerror="this.style.display=\'none\'">' +
        '<div class="art-pnm">' + esc(h.th) + '</div>' +
        '</div>';
    }).join('');
    if (!cells) cells = '<div class="art-pempty">ยังไม่มีฮีโร่ในครอบครอง — อัญเชิญฮีโร่ก่อน</div>';

    var clearBtn = curHolder
      ? '<button class="art-btn art-clear" onclick="__artClear(\'' + esc(artId) + '\')">ถอดออก</button>'
      : '';

    G.modal(
      '<div class="art-mt">' + art.ic + ' มอบ ' + esc(art.th) +
        ' <span class="art-en">' + esc(art.en) + '</span></div>' +
      '<div class="art-ms">เลือกฮีโร่ที่จะรับของวิเศษ — ' + esc(art.passive) + '</div>' +
      '<div class="art-pgrid">' + cells + '</div>' +
      '<div class="art-mbtns">' + clearBtn +
        '<button class="art-btn art-clear" onclick="GAME.closeModal()">ปิด</button>' +
      '</div>'
    );
  };

  // ---------- main render ----------
  window.renderArtifact = function () {
    ensureScreen();
    var body = document.getElementById('art-body');
    if (!body) return;

    var map = G.state.artifacts || {};
    var assignedCount = ARTIFACTS.reduce(function (n, a) { return n + (holderOf(a.id) ? 1 : 0); }, 0);

    var rows = ARTIFACTS.map(function (a) {
      var hid = holderOf(a.id);
      var h = hid ? heroById(hid) : null;
      var b = a.statBonus || {};
      var chips = ['hp', 'atk', 'def', 'spd'].filter(function (k) { return b[k]; }).map(function (k) {
        var lbl = { hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD' }[k];
        return '<span class="art-chip">+' + b[k] + '% ' + lbl + '</span>';
      }).join('');

      var who = h
        ? '<div class="art-who"><img src="portraits/' + esc(hid) + '.jpg" alt="" ' +
            'onerror="this.style.display=\'none\'"><span class="art-whonm">' + esc(h.th) + '</span></div>'
        : '<div class="art-none">ยังไม่ได้มอบ</div>';
      var actBtn = h
        ? '<button class="art-btn art-clear" onclick="__artClear(\'' + esc(a.id) + '\')">เปลี่ยน/ถอด</button>'
        : '<button class="art-btn" onclick="__artPick(\'' + esc(a.id) + '\')">มอบให้ฮีโร่</button>';

      return '<div class="art-row ' + (h ? 'art-assigned' : '') + '" ' +
          'onclick="__artPick(\'' + esc(a.id) + '\')">' +
        '<div class="art-ic">' + a.ic + '</div>' +
        '<div class="art-gr">' +
          '<div class="art-nm">' + esc(a.th) +
            ' <span class="art-en">' + esc(a.en) + '</span>' +
            ' <span class="art-tag">' + esc(a.tag) + '</span></div>' +
          '<div class="art-pv">' + esc(a.passive) + '</div>' +
          '<div class="art-stats">' + chips + '</div>' +
        '</div>' +
        '<div class="art-rt" onclick="event.stopPropagation()">' + who + actBtn + '</div>' +
        '</div>';
    }).join('');

    body.innerHTML =
      '<div class="art-sum">ของวิเศษทั้งหมด <b>' + ARTIFACTS.length + '</b> ชิ้น · ' +
        'มอบแล้ว <b>' + assignedCount + '/' + ARTIFACTS.length + '</b> — ' +
        'แต่ละชิ้นมอบให้ฮีโร่ได้ทีละตัว ให้พลัง passive + โบนัสสเตตัส %</div>' +
      '<div class="art-list">' + rows + '</div>';
  };

  // ---------- inject screen + hub side button ----------
  function ensureScreen() {
    var stage = document.getElementById('stage');
    if (!stage) return;
    if (!document.getElementById('artifact')) {
      var sec = document.createElement('section');
      sec.className = 'screen';
      sec.id = 'artifact';
      sec.innerHTML =
        '<div class="topbar">' +
        '  <div class="back glass" onclick="go(\'hub\')">‹ กลับ</div>' +
        '  <div class="h2" style="margin:0 0 0 10px">ของวิเศษ <span class="sub">Artifacts · พลัง passive เฉพาะตัว</span></div>' +
        '</div>' +
        '<div class="body"><div id="art-body"></div></div>';
      var toastEl = document.getElementById('toast');
      if (toastEl && toastEl.parentNode === stage) stage.insertBefore(sec, toastEl);
      else stage.appendChild(sec);
    }
    ensureHubButton();
  }

  function ensureHubButton() {
    var hub = document.getElementById('hub');
    if (!hub) return;
    var side = hub.querySelector('.side');
    if (!side) return;
    if (side.querySelector('[data-art-btn]')) return; // idempotent
    var btn = document.createElement('div');
    btn.className = 'sbtn glass';
    btn.setAttribute('data-art-btn', '1');
    btn.setAttribute('title', 'ของวิเศษ');
    btn.textContent = '📿';
    btn.onclick = function () { go('artifact'); };
    side.appendChild(btn);
  }

  // ---------- wrap go() so go('artifact') re-renders (idempotent) ----------
  if (!window.__artifactGoWrapped && typeof window.go === 'function') {
    var origGo = window.go;
    window.go = function (id) {
      var r = origGo.apply(this, arguments);
      if (id === 'artifact') { try { window.renderArtifact(); } catch (e) {} }
      return r;
    };
    window.__artifactGoWrapped = true;
  }

  // ---------- initial mount ----------
  ensureScreen();
  var cur = document.getElementById('artifact');
  if (cur && cur.classList.contains('on')) {
    try { window.renderArtifact(); } catch (e) {}
  }
})();
