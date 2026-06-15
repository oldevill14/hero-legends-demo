/* feat-story.js — Hero Legends Thai · เนื้อเรื่อง (Story / Visual Novel)
 * 8 บทแห่งพระอภัยมณี — กดเข้าบทจากรายการ → overlay visual-novel (portrait + 台詞)
 * Conflict-free: inject #story เอง, persist GAME.state.story.read[], CSS prefixed str-.
 */
(function () {
  'use strict';
  if (!window.GAME) { console.warn('[story] GAME missing'); return; }
  var G = window.GAME, S = G.state;
  if (!S.story || typeof S.story !== 'object') S.story = {};
  if (!Array.isArray(S.story.read)) S.story.read = [];

  // ---- chapter data ----
  var CHAPTERS = [
    {
      id: 'ch1',
      title: 'กำเนิดรัตนา',
      sub: 'สองโอรสท้าวสุทัศน์',
      icon: '👑',
      lines: [
        { hero: 'hero_phraaphai', name: 'พระอภัยมณี', text: 'ข้าเลือกเรียนวิชาปี่ — ไม่ใช่วิชาอาวุธ เพราะดนตรีสะกดใจได้ยิ่งกว่าดาบ' },
        { hero: 'hero_srisuwan', name: 'ศรีสุวรรณ', text: 'พี่ชาย... พ่อท้าวสุทัศน์จะกริ้วอย่างแน่นอน วิชาปี่ไม่ใช่วิชาของเจ้าชาย' },
        { hero: 'hero_phraaphai', name: 'พระอภัยมณี', text: 'แล้วข้าจะพิสูจน์ให้ประจักษ์ว่าเสียงปี่คือกุญแจไขดวงใจทุกหัวใจในสากลโลก' },
        { hero: 'hero_srisuwan', name: 'ศรีสุวรรณ', text: 'ท้าวสุทัศน์ประกาศเนรเทศพวกเรา... เราจะไปที่ไหนกัน พี่?' },
        { hero: 'hero_phraaphai', name: 'พระอภัยมณี', text: 'ไปหาความจริงในโลกกว้าง — เงาของเราจะยังคงอยู่ในราชสำนักนี้ แม้ตัวเราจะจากไปแล้ว' }
      ]
    },
    {
      id: 'ch2',
      title: 'ถ้ำผีเสื้อสมุทร',
      sub: 'รักต้องห้ามใต้ท้องทะเล',
      icon: '🌊',
      lines: [
        { hero: 'hero_phisuea_samut', name: 'นางผีเสื้อสมุทร', text: 'ข้าจะไม่ยอมให้ใครพรากชายผู้นี้ไป — เสียงปี่ของเขาทะลุทะลวงถ้ำน้ำลึกของข้า' },
        { hero: 'hero_phraaphai', name: 'พระอภัยมณี', text: 'โปรดปล่อยข้าไปเถิด นางผีเสื้อ... ข้าไม่อาจอยู่ใต้ท้องทะเลได้ตลอดกาล' },
        { hero: 'hero_phisuea_samut', name: 'นางผีเสื้อสมุทร', text: 'ลูกของเราชื่อ สินสมุทร — เขาจะเป็นสะพานระหว่างโลกบนและโลกใต้น้ำ' },
        { hero: 'hero_phraaphai', name: 'พระอภัยมณี', text: 'เสียงปี่ข้าบรรเลงในถ้ำนี้ก้องไปถึงฝั่งฟ้า แต่หัวใจข้ายังโหยหาแสงดาว' },
        { hero: 'hero_phisuea_samut', name: 'นางผีเสื้อสมุทร', text: 'เจ้าจะจากไปได้ก็ต่อเมื่อข้าหลับตาลง — และวันนั้นยังมาไม่ถึง' }
      ]
    },
    {
      id: 'ch3',
      title: 'นางเงือกพาหนี',
      sub: 'เสียงปี่สลายผีเสื้อสมุทร',
      icon: '🧜',
      lines: [
        { hero: 'hero_nang_ngeuak', name: 'นางเงือก', text: 'ข้ามาช่วยพระอภัยหนีจากถ้ำ — รักที่ข้ามีให้ท่านลึกดั่งมหาสมุทร' },
        { hero: 'hero_phraaphai', name: 'พระอภัยมณี', text: 'ขอบคุณนางเงือกผู้งาม — บุตรของเราชื่อสุดสาคร เขาจะเติบโตเป็นนักรบผู้ยิ่งใหญ่' },
        { hero: 'hero_nang_ngeuak', name: 'นางเงือก', text: 'ผีเสื้อสมุทรยกทัพตามมาแล้ว... พระอภัยเดียวเท่านั้นที่หยุดได้' },
        { hero: 'hero_phraaphai', name: 'พระอภัยมณี', text: 'ข้าจะเป่าปี่ครั้งสุดท้าย — ให้เสียงดนตรีนี้กล่อมจิตวิญญาณของเธอให้สงบ' },
        { hero: 'hero_nang_ngeuak', name: 'นางเงือก', text: 'ผีเสื้อสมุทรสิ้นใจในห้วงเสียงปี่ — มีเพียงความรักที่ยิ่งใหญ่เท่านั้นที่สลายร่างอมตะได้' }
      ]
    },
    {
      id: 'ch4',
      title: 'ม้านิลมังกร',
      sub: 'สุดสาครตามหาพ่อ',
      icon: '🐉',
      lines: [
        { hero: 'hero_sudsakorn', name: 'สุดสาคร', text: 'ข้าจะขี่ม้านิลมังกรออกค้นหาพ่อ — ม้าวิเศษตัวนี้คือของขวัญจากมหาสมุทร' },
        { hero: 'hero_ma_nin_mangkorn', name: 'ม้านิลมังกร', text: '(ม้าส่งเสียงร้องก้องกังวาน — กีบเหยียบเมฆพาหนีไปสู่ขอบฟ้า)' },
        { hero: 'hero_phra_ruesi', name: 'พระฤๅษี', text: 'สุดสาคร เจ้ามาถึงแล้ว — ข้าจะสอนวิชาให้เจ้าก่อนออกเดินทางไปพบพ่อ' },
        { hero: 'hero_sudsakorn', name: 'สุดสาคร', text: 'ขอบพระคุณพระฤๅษี — ข้าพเจ้าพร้อมรับทุกวิชาเพื่อปกป้องผู้เป็นที่รัก' },
        { hero: 'hero_phra_ruesi', name: 'พระฤๅษี', text: 'เดินทางด้วยใจที่บริสุทธิ์ — เงาของบรรพบุรุษจะคุ้มกันเจ้าตลอดการเดินทาง' }
      ]
    },
    {
      id: 'ch5',
      title: 'เมืองผลึก',
      sub: 'รักใหม่ของพระอภัย',
      icon: '💎',
      lines: [
        { hero: 'hero_suwanmali', name: 'นางสุวรรณมาลี', text: 'ข้าชื่อสุวรรณมาลี — ถูกกำหนดให้แต่งกับอุศเรนแห่งลังกาแต่หัวใจข้าไม่ยอมรับ' },
        { hero: 'hero_phraaphai', name: 'พระอภัยมณี', text: 'เสียงปี่ข้าเคยสะกดทะเล แต่เมื่อพบนางสุวรรณมาลี มือข้ากลับสั่นเทาด้วยความงาม' },
        { hero: 'hero_suwanmali', name: 'นางสุวรรณมาลี', text: 'เมืองผลึกเป็นดั่งฝัน — แต่เมื่อพระอภัยมณีมาถึง ความฝันกลายเป็นความจริง' },
        { hero: 'hero_phraaphai', name: 'พระอภัยมณี', text: 'ข้าขอพักพิงใจในเมืองผลึกแห่งนี้ — เจ้าคือแสงที่ข้าตามหามาตลอดชั่วชีวิต' },
        { hero: 'hero_suwanmali', name: 'นางสุวรรณมาลี', text: 'แต่อุศเรนจะไม่ยอม... พายุสงครามกำลังก่อตัวที่ขอบฟ้าทะเลลังกา' }
      ]
    },
    {
      id: 'ch6',
      title: 'ศึกอุศเรน',
      sub: 'สงครามทางทะเล',
      icon: '⚔️',
      lines: [
        { hero: 'hero_usaren', name: 'อุศเรน', text: 'ข้ายกทัพลังกามาชิงนางสุวรรณมาลีคืน — ไม่มีใครพรากสิ่งที่เป็นของข้าได้' },
        { hero: 'hero_phraaphai', name: 'พระอภัยมณี', text: 'นางสุวรรณมาลีเลือกเองแล้ว อุศเรน — ข้าจะปกป้องสิทธิ์เลือกของเธอด้วยชีวิต' },
        { hero: 'hero_usaren', name: 'อุศเรน', text: 'กองทัพลังกาครอบคลุมทะเลทั้งหมด — บัดนี้ไม่มีทางหนีแล้ว' },
        { hero: 'hero_srisuwan', name: 'ศรีสุวรรณ', text: 'พี่ชาย ข้ามาแล้ว — ศรีสุวรรณไม่เคยทิ้งพระอภัยมณีในยามวิกฤต' },
        { hero: 'hero_phraaphai', name: 'พระอภัยมณี', text: 'เมื่อสองพี่น้องรัตนาร่วมกัน ทะเลก็ยอมเปิดทางให้เราเสมอ' }
      ]
    },
    {
      id: 'ch7',
      title: 'เสน่ห์นางละเวง',
      sub: 'กับดักรูปวาดแห่งลังกา',
      icon: '🌹',
      lines: [
        { hero: 'hero_nang_laweng', name: 'นางละเวง', text: 'ข้าวาดรูปตัวเองด้วยเสน่ห์ลับ — ให้มันล่อทัพของพระอภัยให้เข้ามาในกับดัก' },
        { hero: 'hero_phraaphai', name: 'พระอภัยมณี', text: 'รูปวาดนี้... สวยดังเทพีจากฟากฟ้า หัวใจข้าเต้นแรงอย่างที่ไม่เคยเป็นมาก่อน' },
        { hero: 'hero_nang_laweng', name: 'นางละเวง', text: 'เสน่ห์ข้าไม่ใช่เวทมนตร์ดำ — มันคือความจริงที่ซ่อนในภาพซึ่งข้าวาดด้วยน้ำตา' },
        { hero: 'hero_usaren', name: 'อุศเรน', text: 'นางละเวง เจ้าทำให้ทัพศัตรูแตกพ่ายได้โดยไม่ต้องใช้ดาบแม้เล่มเดียว' },
        { hero: 'hero_nang_laweng', name: 'นางละเวง', text: 'แต่ข้าไม่แน่ใจแล้วว่าใครตกหลุมรักใคร — เงาของพระอภัยมณีติดตามข้ามาในความฝัน' }
      ]
    },
    {
      id: 'ch8',
      title: 'ปรองดองแผ่นดิน',
      sub: 'สิ้นสงคราม รวมแผ่นดิน',
      icon: '🕊️',
      lines: [
        { hero: 'hero_sinsamut', name: 'สินสมุทร', text: 'ถึงเวลาแล้วที่ลูกๆ ของพระอภัยจะก้าวออกมาไกล่เกลี่ย — เราคือสะพานระหว่างทุกสายเลือด' },
        { hero: 'hero_sudsakorn', name: 'สุดสาคร', text: 'ม้านิลมังกรพาข้าข้ามทะเล — พ่อ โอรสของท่านกลับมาพร้อมสันติภาพแล้ว' },
        { hero: 'hero_nang_laweng', name: 'นางละเวง', text: 'ลังกาไม่ขอสงครามอีกแล้ว — ข้าเองก็เหนื่อยกับการที่ต้องซ่อนตัวอยู่หลังรูปวาด' },
        { hero: 'hero_usaren', name: 'อุศเรน', text: 'ข้ายอมรับสันติภาพ — ประวัติศาสตร์จงจดจำไว้ว่าลังกาเลือกหยุดสงครามด้วยตัวเอง' },
        { hero: 'hero_phraaphai', name: 'พระอภัยมณี', text: 'เสียงปี่ข้าดังขึ้นอีกครั้ง — คราวนี้ไม่ใช่เพื่อสงคราม แต่เพื่อฉลองการรวมใจของทุกแผ่นดิน' }
      ]
    }
  ];

  // ---- dialogue state ----
  var _dlgOpen = false;
  var _dlgIdx = 0;
  var _dlgChapter = null;

  // ---- CSS ----
  if (!document.getElementById('str-style')) {
    var css = [
      '#story .body{padding:6px 16px 16px}',
      '.str-sum{font-size:12px;color:var(--muted);margin:0 0 14px;font-weight:600}.str-sum b{color:var(--gold)}',
      '.str-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(clamp(240px,28vw,360px),1fr));gap:14px}',
      '.str-card{border-radius:16px;padding:16px 18px;background:var(--panel2);border:1px solid var(--line);cursor:pointer;position:relative;transition:transform .12s,box-shadow .12s}',
      '.str-card:hover{transform:translateY(-3px);box-shadow:0 6px 24px rgba(139,92,246,.22)}',
      '.str-card.read{opacity:.7}',
      '.str-card.read::after{content:"✓ อ่านแล้ว";position:absolute;top:12px;right:14px;font-size:10px;font-weight:800;color:var(--nature)}',
      '.str-ic{font-size:clamp(28px,2.8vw,40px);margin-bottom:8px}',
      '.str-ch{font-size:10px;color:var(--muted);font-weight:800;letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px}',
      '.str-nm{font-weight:800;font-size:clamp(14px,1.3vw,18px);margin-bottom:4px}',
      '.str-sb{font-size:11px;color:var(--muted)}',
      // dialogue overlay
      '.str-ov{position:absolute;inset:0;z-index:60;background:rgba(6,6,12,.92);backdrop-filter:blur(6px);display:flex;flex-direction:column;animation:fade .25s ease}',
      '.str-ov-top{display:flex;justify-content:flex-end;padding:10px 14px 0}',
      '.str-close{background:rgba(255,255,255,.08);border:1px solid var(--line);border-radius:20px;padding:5px 14px;cursor:pointer;font-size:13px;color:var(--muted);font-family:inherit}',
      '.str-close:hover{color:#fff}',
      '.str-scene{flex:1;display:flex;align-items:flex-end;gap:clamp(12px,2vw,28px);padding:0 clamp(12px,3vw,36px) clamp(10px,2vh,18px);min-height:0}',
      '.str-portrait{flex:none;width:clamp(90px,14vw,180px);aspect-ratio:3/4;object-fit:cover;object-position:top center;border-radius:clamp(10px,1.2vw,18px);border:2px solid var(--glow);box-shadow:0 0 32px rgba(139,92,246,.4);align-self:flex-end}',
      '.str-portrait.miss{visibility:hidden}',
      '.str-bubble{flex:1;min-width:0;background:rgba(22,22,36,.95);border:1px solid var(--line);border-radius:16px;padding:clamp(12px,1.4vw,22px);cursor:pointer;user-select:none}',
      '.str-spk{font-size:clamp(12px,1.1vw,16px);font-weight:800;color:var(--gold);margin-bottom:8px}',
      '.str-txt{font-size:clamp(14px,1.25vw,19px);line-height:1.65;color:#e8e8f4}',
      '.str-hint{font-size:11px;color:var(--muted);margin-top:10px;text-align:right}',
      '.str-dots{display:flex;gap:5px;justify-content:center;padding:10px 0 clamp(10px,2vh,18px)}',
      '.str-dot{width:7px;height:7px;border-radius:50%;background:var(--line);transition:background .15s}',
      '.str-dot.on{background:var(--glow)}'
    ].join('');
    var s = document.createElement('style'); s.id = 'str-style'; s.textContent = css; document.head.appendChild(s);
  }

  // ---- ensure screen ----
  function ensureScreen() {
    if (!document.getElementById('story')) {
      var sec = document.createElement('section');
      sec.className = 'screen'; sec.id = 'story';
      sec.innerHTML =
        '<div class="topbar"><div class="back glass" onclick="go(\'hub\')">‹ กลับ</div>' +
        '<div class="h2" style="margin:0 0 0 10px">เนื้อเรื่อง <span class="sub">Story · พระอภัยมณี</span></div></div>' +
        '<div class="body" id="storyBody"></div>';
      (document.getElementById('stage') || document.body).appendChild(sec);
    }
    var side = document.querySelector('#hub .side');
    if (side && !side.querySelector('[data-story]')) {
      var b = document.createElement('div');
      b.className = 'sbtn glass'; b.title = 'เนื้อเรื่อง'; b.setAttribute('data-story', '1');
      b.setAttribute('onclick', "go('story')"); b.textContent = '📖';
      side.appendChild(b);
    }
  }

  // ---- dialogue overlay ----
  function openDialogue(chIdx) {
    _dlgChapter = CHAPTERS[chIdx];
    _dlgIdx = 0;
    _dlgOpen = true;
    renderDialogue();
  }

  function renderDialogue() {
    var stage = document.getElementById('stage') || document.body;
    var existing = document.getElementById('str-dlg');
    if (existing) existing.remove();

    var ch = _dlgChapter;
    var line = ch.lines[_dlgIdx];
    var total = ch.lines.length;

    var dots = ch.lines.map(function (_, i) {
      return '<div class="str-dot' + (i === _dlgIdx ? ' on' : '') + '"></div>';
    }).join('');

    var ov = document.createElement('div');
    ov.id = 'str-dlg'; ov.className = 'str-ov';
    ov.innerHTML =
      '<div class="str-ov-top"><button class="str-close" onclick="storyDlgClose()">✕ จบ</button></div>' +
      '<div class="str-scene">' +
        '<img class="str-portrait" id="str-portrait" src="portraits/' + line.hero + '.jpg" alt="' + line.name + '" onerror="this.classList.add(\'miss\')">' +
        '<div class="str-bubble" onclick="storyDlgNext()">' +
          '<div class="str-spk">' + line.name + '</div>' +
          '<div class="str-txt">' + line.text + '</div>' +
          '<div class="str-hint">แตะเพื่อดำเนินต่อ ' + (_dlgIdx + 1) + '/' + total + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="str-dots">' + dots + '</div>';
    stage.appendChild(ov);
  }

  window.storyDlgNext = function () {
    if (!_dlgOpen || !_dlgChapter) return;
    _dlgIdx++;
    if (_dlgIdx >= _dlgChapter.lines.length) {
      // finished chapter — mark read
      var cid = _dlgChapter.id;
      if (S.story.read.indexOf(cid) < 0) {
        S.story.read.push(cid);
        G.save();
        G.toast('📖 จบบทที่ ' + (_dlgChapter.title));
        if (window.SFX) try { SFX('reward'); } catch (e) {}
      }
      storyDlgClose();
      renderStory();
      return;
    }
    renderDialogue();
  };

  window.storyDlgClose = function () {
    _dlgOpen = false;
    var el = document.getElementById('str-dlg');
    if (el) el.remove();
  };

  window.storyOpenChapter = function (chIdx) {
    openDialogue(chIdx);
  };

  // ---- chapter list ----
  function renderStory() {
    var body = document.getElementById('storyBody'); if (!body) return;
    var readCount = S.story.read.length;
    var cards = CHAPTERS.map(function (ch, i) {
      var isRead = S.story.read.indexOf(ch.id) >= 0;
      return '<div class="str-card' + (isRead ? ' read' : '') + '" onclick="storyOpenChapter(' + i + ')">' +
        '<div class="str-ic">' + ch.icon + '</div>' +
        '<div class="str-ch">บทที่ ' + (i + 1) + '</div>' +
        '<div class="str-nm">' + ch.title + '</div>' +
        '<div class="str-sb">' + ch.sub + '</div>' +
        '</div>';
    }).join('');
    body.innerHTML =
      '<div class="str-sum">อ่านแล้ว <b>' + readCount + '</b>/' + CHAPTERS.length + ' บท</div>' +
      '<div class="str-grid">' + cards + '</div>';
  }
  window.renderStory = renderStory;

  // ---- hook go() ----
  function boot() {
    ensureScreen();
    if (!window.__strGoHooked && typeof window.go === 'function') {
      var _go = window.go;
      window.go = function (id) {
        var r = _go.apply(this, arguments);
        try {
          ensureScreen();
          if (id === 'story') renderStory();
        } catch (e) {}
        return r;
      };
      window.__strGoHooked = true;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
