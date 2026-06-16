/* feat-tutorial.js — Hero Legends Thai · บทนำ/Onboarding (Tutorial)
 * แสดง overlay เต็มจอครั้งแรกที่เล่น (เมื่อ GAME.state.tutorialDone เป็น falsy)
 * 5 ขั้นตอนแนะนำผู้เล่นใหม่ พร้อมปุ่ม "?" ถาวรที่มุมล่างซ้ายเพื่อเปิดซ้ำได้
 * Conflict-free: inject overlay + help btn เอง, persist GAME.state.tutorialDone, CSS prefixed tut-.
 */
(function () {
  'use strict';
  if (!window.GAME) { console.warn('[tutorial] GAME missing'); return; }
  var G = window.GAME, S = G.state;

  // --- step definitions ---
  var STEPS = [
    {
      ic: '🔮',
      title: 'อัญเชิญฮีโร่',
      desc: 'ใช้เพชร (💎) อัญเชิญฮีโร่จากตำนานพระอภัยมณี สะสมตัวละครหายากและเสริมสร้างทีมของคุณ',
      act: function () { tutClose(); if (window.go) window.go('summon'); }
    },
    {
      ic: '🧩',
      title: 'จัดทีม 5 ตัว',
      desc: 'เลือกฮีโร่ 5 คนที่เหมาะสม จัดทีมให้มีสายสัมพันธ์เพื่อปลดบัฟพิเศษเสริมพลังทีม',
      act: function () { tutClose(); if (window.go) window.go('stages'); }
    },
    {
      ic: '⚔️',
      title: 'ออกผจญภัย',
      desc: 'พาทีมฝ่าด่านต่างๆ ทั่วดินแดนแห่งมหาสมุทร สะสมรางวัลและเปิดด่านใหม่',
      act: null
    },
    {
      ic: '📈',
      title: 'อัปเกรดฮีโร่',
      desc: 'เพิ่มเลเวล อัปดาว และติดตั้งอุปกรณ์ให้ฮีโร่ เพื่อเพิ่มพลังในการต่อสู้',
      act: null
    },
    {
      ic: '🔗',
      title: 'สายสัมพันธ์ & ภารกิจสะสม',
      desc: 'สำรวจสายสัมพันธ์ระหว่างตัวละคร ทำภารกิจสะสมรับรางวัลพิเศษ และแข่งขันในสังเวียน',
      act: null
    }
  ];

  var _curStep = 0;

  // --- CSS (injected once) ---
  if (!document.getElementById('tut-style')) {
    var css = [
      '.tut-overlay{position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;',
      'background:rgba(4,4,12,.82);backdrop-filter:blur(8px);animation:tut-fade .3s ease}',
      '@keyframes tut-fade{from{opacity:0}to{opacity:1}}',
      '.tut-box{max-width:clamp(300px,88vw,560px);width:100%;border-radius:22px;',
      'background:linear-gradient(160deg,#1a1232 0%,#0f0c24 60%,#130e2e 100%);',
      'border:1.5px solid rgba(139,92,246,.45);box-shadow:0 0 60px rgba(139,92,246,.25),0 20px 70px rgba(0,0,0,.7);',
      'padding:28px 26px 22px;position:relative}',
      '.tut-hd{text-align:center;margin-bottom:20px}',
      '.tut-title{font-size:clamp(18px,4vw,24px);font-weight:900;',
      'background:linear-gradient(90deg,var(--gold,#f5c451),#e9d5ff,var(--gold,#f5c451));',
      '-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;',
      'line-height:1.2;margin-bottom:4px}',
      '.tut-sub{font-size:clamp(10px,2vw,13px);color:rgba(200,180,255,.65);font-weight:600;letter-spacing:.05em}',
      '.tut-dots{display:flex;justify-content:center;gap:8px;margin-bottom:18px}',
      '.tut-dot{width:8px;height:8px;border-radius:50%;background:rgba(139,92,246,.25);',
      'border:1.5px solid rgba(139,92,246,.4);transition:all .2s}',
      '.tut-dot.on{background:var(--glow,#8b5cf6);box-shadow:0 0 8px var(--glow,#8b5cf6);border-color:var(--glow,#8b5cf6)}',
      '.tut-card{border-radius:16px;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.25);',
      'padding:20px 20px 18px;text-align:center;min-height:148px;display:flex;flex-direction:column;',
      'align-items:center;justify-content:center;gap:10px;margin-bottom:18px}',
      '.tut-card-ic{font-size:clamp(36px,7vw,52px);line-height:1}',
      '.tut-card-nm{font-size:clamp(15px,3vw,20px);font-weight:900;color:#e9d5ff}',
      '.tut-card-desc{font-size:clamp(11px,2vw,14px);color:rgba(200,185,255,.75);line-height:1.55;max-width:400px}',
      '.tut-btns{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap}',
      '.tut-btn-next{padding:11px 32px;border:none;border-radius:50px;cursor:pointer;',
      'font-weight:900;font-size:clamp(13px,2.5vw,16px);font-family:inherit;',
      'background:linear-gradient(135deg,var(--glow,#8b5cf6),#6d28d9);color:#fff;',
      'box-shadow:0 4px 20px rgba(139,92,246,.45);transition:transform .1s,box-shadow .1s}',
      '.tut-btn-next:hover{transform:translateY(-2px);box-shadow:0 6px 28px rgba(139,92,246,.6)}',
      '.tut-btn-next:active{transform:translateY(0)}',
      '.tut-btn-next.gold{background:linear-gradient(135deg,var(--gold,#f5c451),#d99a2b);color:#3a2600;',
      'box-shadow:0 4px 20px rgba(245,196,81,.45)}',
      '.tut-btn-next.gold:hover{box-shadow:0 6px 28px rgba(245,196,81,.6)}',
      '.tut-btn-skip{background:none;border:none;cursor:pointer;font-size:12px;',
      'color:rgba(200,185,255,.45);font-family:inherit;padding:6px 10px;text-decoration:underline;',
      'transition:color .15s}',
      '.tut-btn-skip:hover{color:rgba(200,185,255,.75)}',
      '.tut-skip-top{position:absolute;top:14px;right:16px}',
      // help button (fixed, persistent)
      '.tut-help-btn{position:fixed;bottom:18px;left:18px;z-index:500;',
      'width:38px;height:38px;border-radius:50%;border:1.5px solid rgba(139,92,246,.5);',
      'background:rgba(13,10,28,.85);backdrop-filter:blur(6px);cursor:pointer;',
      'font-size:17px;font-weight:900;color:rgba(200,185,255,.7);',
      'display:flex;align-items:center;justify-content:center;',
      'transition:border-color .2s,color .2s,box-shadow .2s;',
      'box-shadow:0 2px 12px rgba(0,0,0,.4)}',
      '.tut-help-btn:hover{border-color:var(--glow,#8b5cf6);color:#e9d5ff;',
      'box-shadow:0 0 16px rgba(139,92,246,.4)}'
    ].join('');
    var st = document.createElement('style'); st.id = 'tut-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  // --- helpers ---
  function removeOverlay() {
    var el = document.getElementById('tut-overlay');
    if (el) el.remove();
  }

  function tutClose() {
    removeOverlay();
    S.tutorialDone = true;
    G.save();
  }

  function stepHTML(idx) {
    var s = STEPS[idx];
    var isLast = (idx === STEPS.length - 1);
    var dots = STEPS.map(function (_, i) {
      return '<div class="tut-dot' + (i === idx ? ' on' : '') + '"></div>';
    }).join('');

    var btnLabel = isLast ? '🌟 เริ่มเล่น!' : 'ถัดไป ›';
    var btnCls = 'tut-btn-next' + (isLast ? ' gold' : '');

    return '<div class="tut-hd">' +
      '<div class="tut-title">ยินดีต้อนรับสู่<br>ตำนานแห่งมหาสมุทร</div>' +
      '<div class="tut-sub">Legend of the Ocean · พระอภัยมณี</div></div>' +
      '<div class="tut-dots">' + dots + '</div>' +
      '<div class="tut-card">' +
      '<div class="tut-card-ic">' + s.ic + '</div>' +
      '<div class="tut-card-nm">ขั้นที่ ' + (idx + 1) + ' · ' + s.title + '</div>' +
      '<div class="tut-card-desc">' + s.desc + '</div>' +
      '</div>' +
      '<div class="tut-btns">' +
      '<button class="' + btnCls + '" onclick="tutStep(' + (isLast ? -1 : idx + 1) + ')">' + btnLabel + '</button>' +
      '</div>';
  }

  window.tutStep = function (idx) {
    if (idx < 0) {
      // last step: mark done, optionally navigate
      var last = STEPS[STEPS.length - 1];
      tutClose();
      if (last.act) try { last.act(); } catch (e) {}
      return;
    }
    _curStep = idx;
    var box = document.querySelector('#tut-overlay .tut-box');
    if (!box) { window.showTutorial(); return; }
    box.innerHTML = stepHTML(idx) +
      '<button class="tut-btn-skip tut-skip-top" onclick="tutSkip()">ข้าม</button>';
    // if this step has an action and is not the last, fire it on next click handled by tutStep
  };

  window.tutSkip = function () {
    tutClose();
    G.toast('💡 กดปุ่ม ? มุมล่างซ้ายเพื่อดูคู่มืออีกครั้ง');
  };

  window.showTutorial = function () {
    removeOverlay();
    _curStep = 0;
    var ov = document.createElement('div');
    ov.id = 'tut-overlay';
    ov.className = 'tut-overlay';
    var box = document.createElement('div');
    box.className = 'tut-box';
    box.innerHTML = stepHTML(0) +
      '<button class="tut-btn-skip tut-skip-top" onclick="tutSkip()">ข้าม</button>';
    ov.appendChild(box);
    // clicking backdrop closes/skips
    ov.addEventListener('click', function (e) {
      if (e.target === ov) window.tutSkip();
    });
    document.body.appendChild(ov);
  };

  // --- persistent help button ---
  function ensureHelpBtn() {
    if (document.getElementById('tut-help-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'tut-help-btn';
    btn.className = 'tut-help-btn';
    btn.title = 'คู่มือผู้เล่น';
    btn.textContent = '?';
    btn.setAttribute('onclick', 'showTutorial()');
    document.body.appendChild(btn);
  }

  // --- boot ---
  function boot() {
    ensureHelpBtn();
    // show the tutorial the FIRST time the player reaches the hub — never over the title screen
    if (!window.__tutGoHooked && typeof window.go === 'function') {
      var _go = window.go;
      window.go = function (id) {
        var r = _go.apply(this, arguments);
        if (id === 'hub' && !S.tutorialDone) {
          setTimeout(function () { if (!S.tutorialDone) window.showTutorial(); }, 350);
        }
        return r;
      };
      window.__tutGoHooked = true;
    }
    // reloaded straight onto the hub (mid-game) → show it too
    if (!S.tutorialDone) {
      var on = document.querySelector('.screen.on');
      if (on && on.id === 'hub') setTimeout(function () { if (!S.tutorialDone) window.showTutorial(); }, 600);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
