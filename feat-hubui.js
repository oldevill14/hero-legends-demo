/* feat-hubui.js — Hero Legends Thai · hub chrome redesign
 * The hub utility menu (shop/mail/events/modes/inventory/artifact/bonds/achievements/
 * story) is now a HORIZONTAL toolbar with a LABEL under each icon (easier to pick),
 * using the ChatGPT graphic icons (icons/ui/ui_*.png). Currency pills + profile chip
 * enlarged with graphic icons + a golden avatar frame. Loads LAST. Graceful: an icon
 * only replaces its emoji once the image loads. Re-applies on go('hub') for lazily
 * injected buttons. CSS scoped to #hub, prefixed hub-.
 */
(function () {
  'use strict';

  if (!document.getElementById('hubui-style')) {
    var css = [
      // ---- horizontal utility toolbar (was a vertical right rail) ----
      '#hub .side{position:absolute;top:clamp(60px,7.2vw,106px);left:50%;transform:translateX(-50%);right:auto;bottom:auto;' +
        'flex-direction:row;align-items:flex-start;gap:clamp(6px,.8vw,14px);z-index:4;max-width:95vw;overflow-x:auto;overflow-y:visible;' +
        'padding:4px 8px 6px;background:none;scrollbar-width:thin}',
      '#hub .side::-webkit-scrollbar{height:5px}',
      '#hub .side::-webkit-scrollbar-thumb{background:#3a3358;border-radius:5px}',
      '#hub .sbtn{width:auto;height:auto;flex:none;min-width:clamp(62px,6.6vw,100px);display:flex;flex-direction:column;align-items:center;' +
        'gap:5px;padding:8px 7px 7px;border-radius:15px;position:relative;transition:transform .14s,box-shadow .14s}',
      '#hub .sbtn:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(139,92,246,.45)}',
      '#hub .sbtn .hub-ico{width:clamp(34px,3.1vw,52px);height:clamp(34px,3.1vw,52px);background-size:contain;background-position:center;' +
        'background-repeat:no-repeat;display:flex;align-items:center;justify-content:center;font-size:clamp(20px,1.8vw,28px)}',
      '#hub .sbtn .hub-ico.on{font-size:0}',
      '#hub .sbtn .hub-lbl{font-size:clamp(10px,.92vw,14px);font-weight:800;color:var(--ink);white-space:nowrap;text-shadow:0 1px 4px rgba(0,0,0,.9)}',
      '#hub .sbtn .mail-sidebadge{top:2px;right:6px}',
      // free up the top: hide the small promo banner (อัญเชิญ is in the main nav)
      '#hub .hub-mid{display:none}',
      // ---- bigger currency pills + graphic icons ----
      '#hub .curr{gap:clamp(8px,1vw,14px)}',
      '#hub .curr .pill{font-size:clamp(14px,1.25vw,22px);padding:clamp(9px,1vw,15px) clamp(15px,1.4vw,23px);border-radius:18px;gap:9px;font-weight:800}',
      '#hub .curr .pill .ic{font-size:clamp(16px,1.4vw,25px)}',
      '#hub .curr .pill .ic.hub-cur{width:clamp(22px,2vw,34px);height:clamp(22px,2vw,34px);background-size:contain;background-position:center;' +
        'background-repeat:no-repeat;color:transparent;font-size:0;display:inline-block;vertical-align:middle}',
      // ---- bigger profile chip + golden avatar frame ----
      '#hub .pf{padding:clamp(7px,.8vw,12px) clamp(16px,1.5vw,26px) clamp(7px,.8vw,12px) clamp(7px,.8vw,10px);border-radius:22px;align-items:center}',
      '#hub .pf img{width:clamp(46px,3.8vw,70px)!important;height:clamp(46px,3.8vw,70px)!important;border:2.5px solid var(--gold)!important;' +
        'box-shadow:0 0 14px rgba(245,196,81,.55);border-radius:50%}',
      '#hub .pf .nm{font-size:clamp(14px,1.25vw,21px);font-weight:800}',
      '#hub .pf .lv{font-size:clamp(11px,.95vw,15px);color:var(--gold);font-weight:700}'
    ].join('');
    var s = document.createElement('style'); s.id = 'hubui-style'; s.textContent = css; document.head.appendChild(s);
  }

  var BASE = 'icons/ui/';
  var EMOJI_CUR = { '🪙': 'gold', '💎': 'ruby', '⚡': 'energy' };
  var LABELS = {
    shop: 'ร้านค้า', mail: 'จดหมาย', events: 'อีเวนต์', modes: 'โหมดเกม', inventory: 'คลังของ',
    artifact: 'ของวิเศษ', bonds: 'สายสัมพันธ์', achievements: 'ภารกิจ', story: 'เนื้อเรื่อง'
  };

  function iconForBtn(btn) {
    var oc = btn.getAttribute('onclick') || '';
    var m = /go\(\s*['"]([a-z]+)['"]\s*\)/.exec(oc);
    var t = m ? m[1] : '';
    var byTarget = { shop: 'shop', mail: 'mail', events: 'events', modes: 'modes', bonds: 'bonds', achievements: 'achievements', story: 'story', inventory: 'inventory', artifact: 'artifact' };
    if (byTarget[t]) return byTarget[t];
    var ti = btn.title || '';
    if (/คลังของ/.test(ti)) return 'inventory';
    if (/ของวิเศษ/.test(ti)) return 'artifact';
    if (/ร้านค้า/.test(ti)) return 'shop';
    if (/จดหมาย/.test(ti)) return 'mail';
    if (/อีเวนต์/.test(ti)) return 'events';
    if (/โหมด/.test(ti)) return 'modes';
    if (/สายสัมพันธ์/.test(ti)) return 'bonds';
    if (/ภารกิจสะสม/.test(ti)) return 'achievements';
    if (/เนื้อเรื่อง/.test(ti)) return 'story';
    return null;
  }

  function decorate() {
    var hub = document.getElementById('hub'); if (!hub) return;
    // side buttons → icon + label (restructure once, then leave alone)
    hub.querySelectorAll('.side .sbtn').forEach(function (b) {
      if (b.getAttribute('data-hublbl') === '1') return;
      var name = iconForBtn(b);
      var emoji = '';
      for (var i = 0; i < b.childNodes.length; i++) {
        var n = b.childNodes[i];
        if (n.nodeType === 3 && n.textContent.trim()) { emoji = n.textContent.trim(); break; }
      }
      var badge = b.querySelector('.mail-sidebadge');
      var label = (name && LABELS[name]) || b.title || '';
      b.innerHTML = '<span class="hub-ico">' + emoji + '</span><span class="hub-lbl">' + label + '</span>';
      if (badge) b.appendChild(badge);
      b.setAttribute('data-hublbl', '1');
      if (name) (function (el) {
        var url = BASE + 'ui_' + name + '.png';
        var im = new Image();
        im.onload = function () { var ic = el.querySelector('.hub-ico'); if (ic) { ic.style.backgroundImage = "url('" + url + "')"; ic.classList.add('on'); } };
        im.src = url;
      })(b);
    });
    // currency pill icons
    hub.querySelectorAll('.curr .pill .ic').forEach(function (ic) {
      if (ic.getAttribute('data-hubcur') === '1') return;
      var cur = EMOJI_CUR[(ic.textContent || '').trim()];
      if (!cur) return;
      var url = BASE + 'ui_' + cur + '.png';
      var im = new Image();
      im.onload = function () { ic.style.backgroundImage = "url('" + url + "')"; ic.classList.add('hub-cur'); ic.setAttribute('data-hubcur', '1'); };
      im.src = url;
    });
  }

  function boot() {
    decorate();
    if (!window.__hubuiGoHooked && typeof window.go === 'function') {
      var _go = window.go;
      window.go = function (id) {
        var r = _go.apply(this, arguments);
        if (id === 'hub') { try { decorate(); } catch (e) {} }
        return r;
      };
      window.__hubuiGoHooked = true;
    }
    var n = 0, iv = setInterval(function () { decorate(); if (++n >= 8) clearInterval(iv); }, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
