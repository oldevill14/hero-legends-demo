/* feat-hubui.js — Hero Legends Thai · hub chrome redesign
 * Bigger side buttons / currency pills / profile chip + swaps the emoji for the
 * ChatGPT-generated graphic icons (icons/ui/ui_*.png). Loads LAST (after every
 * feat that injects a side button). Graceful: an icon only replaces its emoji
 * once the image actually loads (missing icon → emoji stays). Re-applies on go('hub')
 * because some side buttons are injected lazily. CSS scoped to #hub, prefixed hub-.
 */
(function () {
  'use strict';

  if (!document.getElementById('hubui-style')) {
    var css = [
      // bigger side rail + buttons
      '#hub .side{top:clamp(56px,7vw,92px);right:clamp(14px,1.4vw,26px);gap:clamp(10px,1.2vw,16px)}',
      '#hub .sbtn{width:clamp(54px,4.6vw,80px);height:clamp(54px,4.6vw,80px);border-radius:17px;font-size:clamp(22px,2vw,33px);position:relative;overflow:visible;transition:transform .14s,box-shadow .14s}',
      '#hub .sbtn:hover{transform:translateY(-3px) scale(1.06);box-shadow:0 8px 26px rgba(139,92,246,.45)}',
      '#hub .sbtn.hub-img{background-size:76%;background-position:center;background-repeat:no-repeat;color:transparent;font-size:0;text-shadow:none}',
      '#hub .sbtn.hub-img .mail-sidebadge{font-size:11px;color:#fff}',
      // bigger currency pills + icon graphics
      '#hub .curr{gap:clamp(8px,1vw,14px)}',
      '#hub .curr .pill{font-size:clamp(14px,1.25vw,22px);padding:clamp(9px,1vw,15px) clamp(15px,1.4vw,23px);border-radius:18px;gap:9px;font-weight:800}',
      '#hub .curr .pill .ic{font-size:clamp(16px,1.4vw,25px)}',
      '#hub .curr .pill .ic.hub-img{width:clamp(22px,2vw,34px);height:clamp(22px,2vw,34px);background-size:contain;background-position:center;background-repeat:no-repeat;color:transparent;font-size:0;display:inline-block;vertical-align:middle}',
      // bigger profile chip + golden avatar frame
      '#hub .pf{padding:clamp(7px,.8vw,12px) clamp(16px,1.5vw,26px) clamp(7px,.8vw,12px) clamp(7px,.8vw,10px);border-radius:22px;align-items:center}',
      '#hub .pf img{width:clamp(46px,3.8vw,70px)!important;height:clamp(46px,3.8vw,70px)!important;border:2.5px solid var(--gold)!important;box-shadow:0 0 14px rgba(245,196,81,.55);border-radius:50%}',
      '#hub .pf .nm{font-size:clamp(14px,1.25vw,21px);font-weight:800}',
      '#hub .pf .lv{font-size:clamp(11px,.95vw,15px);color:var(--gold);font-weight:700}'
    ].join('');
    var s = document.createElement('style'); s.id = 'hubui-style'; s.textContent = css; document.head.appendChild(s);
  }

  var BASE = 'icons/ui/';
  var EMOJI_CUR = { '🪙': 'gold', '💎': 'ruby', '⚡': 'energy' };

  // map a side button to its icon name by go() target then by title
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

  // apply an icon as background only after the image loads (graceful fallback to emoji)
  function applyBg(el, name, klass) {
    if (!name) return;
    var url = BASE + 'ui_' + name + '.png';
    if (el.getAttribute('data-hubico') === name) return; // already applied
    var im = new Image();
    im.onload = function () { el.style.backgroundImage = "url('" + url + "')"; el.classList.add(klass); el.setAttribute('data-hubico', name); };
    im.src = url;
  }

  function decorate() {
    var hub = document.getElementById('hub'); if (!hub) return;
    // side buttons
    hub.querySelectorAll('.side .sbtn').forEach(function (b) { applyBg(b, iconForBtn(b), 'hub-img'); });
    // currency pill icons (the .ic emoji span)
    hub.querySelectorAll('.curr .pill .ic').forEach(function (ic) {
      var cur = EMOJI_CUR[(ic.textContent || '').trim()];
      if (cur) applyBg(ic, cur, 'hub-img');
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
    // late-injected side buttons → re-decorate a few times after load
    var n = 0, iv = setInterval(function () { decorate(); if (++n >= 6) clearInterval(iv); }, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
