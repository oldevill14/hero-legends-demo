/* feat-settings.js — Profile / Settings + lightweight WebAudio engine for Hero Legends Thai
 * Loads AFTER game.html + game-core.js + the other 11 feat-*.js modules.
 * Vanilla JS, no libs, no build step.
 *
 * Responsibilities (scoped to the #profile screen + global audio):
 *   1. Persist GAME.state.settings = {bgm,sfx,bgmVol,sfxVol,lang} (additive on GAME.state).
 *   2. Enhance the static #profile rows into working toggle switches + volume sliders,
 *      bound to settings (every change persists via GAME.save() and applies live).
 *   3. A tiny WebAudio engine (ONE AudioContext, created lazily on first user gesture):
 *        - window.SFX(name)  → short synthesized blips: click / confirm / cancel / reward
 *          (each a different freq / decay), respecting settings.sfx + settings.sfxVol.
 *        - window.BGM        → a subtle ambient pad (a couple of detuned oscillators through
 *          a low-pass + master gain), toggled by settings.bgm + settings.bgmVol.
 *   4. ONE delegated document click listener that plays SFX('click') for the common
 *      interactive controls (.btn .navbtn .tile .start .pull .sbtn .back) — subtle, non-annoying.
 *
 * This module does NOT override any other screen's render fn. It only:
 *   - reads/writes GAME.state.settings
 *   - decorates the (render-fn-less) static #profile screen on boot
 *   - wraps window.go idempotently to (re)decorate #profile when it becomes visible
 */
(function () {
  'use strict';
  if (!window.GAME) { console.warn('[SETTINGS] GAME runtime missing — settings disabled'); return; }
  if (window.__settingsHooked) return;   // hard guard against double-load
  window.__settingsHooked = true;

  var G = window.GAME;
  var S = G.state;

  // ---------------------------------------------------------------
  //  1. STATE — additive, persisted under GAME.state.settings
  // ---------------------------------------------------------------
  var DEFAULTS = { bgm: true, sfx: true, bgmVol: 0.6, sfxVol: 0.8, lang: 'th' };
  function ensureSettings() {
    if (!S.settings || typeof S.settings !== 'object') S.settings = {};
    for (var k in DEFAULTS) {
      if (!(k in S.settings)) S.settings[k] = DEFAULTS[k];
    }
    // sanitize ranges
    S.settings.bgm = !!S.settings.bgm;
    S.settings.sfx = !!S.settings.sfx;
    S.settings.bgmVol = clamp01(S.settings.bgmVol);
    S.settings.sfxVol = clamp01(S.settings.sfxVol);
    if (S.settings.lang !== 'th' && S.settings.lang !== 'en') S.settings.lang = 'th';
    G.save();
  }
  function clamp01(v) { v = parseFloat(v); if (isNaN(v)) return 0.6; return Math.max(0, Math.min(1, v)); }
  function st() { return S.settings; }
  ensureSettings();

  // ---------------------------------------------------------------
  //  2. WEBAUDIO ENGINE — one lazily-created AudioContext
  // ---------------------------------------------------------------
  var AC = null;            // shared AudioContext
  var bgmNodes = null;      // { osc:[], lp, gain, lfo, lfoGain } while BGM playing
  var bgmRunning = false;

  // Lazily create / resume the context. Must be called from (or right after) a user gesture.
  function audio() {
    if (!AC) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try { AC = new Ctx(); } catch (e) { AC = null; }
    }
    if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (e) {} }
    return AC;
  }

  // ---- SFX: short synthesized blips ----
  // Different freq / waveform / decay per name; gentle so it never grates.
  var SFX_DEFS = {
    click:   { freq: 440, type: 'triangle', dur: 0.07, peak: 0.16, sweep: 0,    wobble: false },
    confirm: { freq: 523, type: 'sine',     dur: 0.18, peak: 0.22, sweep: 360,  wobble: false }, // up-chirp C5→
    cancel:  { freq: 300, type: 'sine',     dur: 0.16, peak: 0.20, sweep: -120, wobble: false }, // down-chirp
    reward:  { freq: 660, type: 'triangle', dur: 0.34, peak: 0.24, sweep: 0,    wobble: true  }  // sparkle arpeggio
  };

  function SFX(name) {
    var s = st();
    if (!s.sfx || s.sfxVol <= 0) return;
    var ctx = audio();
    if (!ctx) return;
    var def = SFX_DEFS[name] || SFX_DEFS.click;
    var vol = def.peak * clamp01(s.sfxVol);
    var t0 = ctx.currentTime;

    if (def.wobble) {
      // reward: a tiny 3-note rising arpeggio for a pleasant "ting"
      var notes = [def.freq, def.freq * 1.25, def.freq * 1.5];
      notes.forEach(function (f, i) {
        blip(ctx, f, 'triangle', t0 + i * 0.075, 0.16, vol * (1 - i * 0.12), 0);
      });
      return;
    }
    blip(ctx, def.freq, def.type, t0, def.dur, vol, def.sweep);
  }

  // one short enveloped oscillator (attack ~6ms, exponential decay)
  function blip(ctx, freq, type, when, dur, peak, sweep) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (sweep) {
      try { osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), when + dur); }
      catch (e) { osc.frequency.linearRampToValueAtTime(Math.max(40, freq + sweep), when + dur); }
    }
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + dur + 0.02);
    osc.onended = function () { try { osc.disconnect(); g.disconnect(); } catch (e) {} };
  }

  // ---- BGM: subtle ambient pad (detuned oscillators → low-pass → gain) ----
  function bgmStart() {
    var s = st();
    if (!s.bgm || s.bgmVol <= 0) return;
    var ctx = audio();
    if (!ctx) return;
    if (bgmRunning) { bgmApplyVol(); return; }

    var master = ctx.createGain();
    master.gain.value = 0; // fade in
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;          // warm, muffled pad
    lp.Q.value = 0.7;
    lp.connect(master);
    master.connect(ctx.destination);

    // a soft minor-ish chord (A2 / E3 / A3) with slight detune per voice for movement
    var base = [110, 164.81, 220];
    var detunes = [-6, +5, -3];
    var oscs = [];
    base.forEach(function (f, i) {
      var o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = f;
      o.detune.value = detunes[i];
      var vg = ctx.createGain();
      vg.gain.value = i === 0 ? 0.5 : 0.32; // bass louder, harmonics softer
      o.connect(vg).connect(lp);
      o.start();
      oscs.push(o);
    });

    // a slow LFO gently breathing the filter cutoff for a living pad
    var lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08;        // ~12s breath
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;          // ±180Hz around cutoff
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();

    bgmNodes = { oscs: oscs, lp: lp, master: master, lfo: lfo, lfoGain: lfoGain };
    bgmRunning = true;
    bgmApplyVol(1.2);                  // fade up over ~1.2s
  }

  function bgmApplyVol(fadeSec) {
    if (!bgmRunning || !bgmNodes || !AC) return;
    var s = st();
    var target = 0.10 * clamp01(s.bgmVol); // keep ceiling low → subtle bed
    var now = AC.currentTime;
    try {
      bgmNodes.master.gain.cancelScheduledValues(now);
      bgmNodes.master.gain.setValueAtTime(Math.max(0.0001, bgmNodes.master.gain.value), now);
      bgmNodes.master.gain.linearRampToValueAtTime(target, now + (fadeSec || 0.25));
    } catch (e) {
      bgmNodes.master.gain.value = target;
    }
  }

  function bgmStop(fadeSec) {
    if (!bgmRunning || !bgmNodes || !AC) { bgmRunning = false; bgmNodes = null; return; }
    var nodes = bgmNodes;
    var now = AC.currentTime;
    var fs = (fadeSec == null) ? 0.6 : fadeSec;
    try {
      nodes.master.gain.cancelScheduledValues(now);
      nodes.master.gain.setValueAtTime(Math.max(0.0001, nodes.master.gain.value), now);
      nodes.master.gain.linearRampToValueAtTime(0.0001, now + fs);
    } catch (e) {}
    setTimeout(function () {
      try {
        nodes.oscs.forEach(function (o) { try { o.stop(); o.disconnect(); } catch (e) {} });
        try { nodes.lfo.stop(); nodes.lfo.disconnect(); } catch (e) {}
        try { nodes.lp.disconnect(); nodes.master.disconnect(); nodes.lfoGain.disconnect(); } catch (e) {}
      } catch (e) {}
    }, Math.round(fs * 1000) + 60);
    bgmRunning = false;
    bgmNodes = null;
  }

  // Reconcile audio engine with current settings (call after any settings change / gesture)
  function applyAudio() {
    var s = st();
    if (s.bgm && s.bgmVol > 0) {
      if (bgmRunning) bgmApplyVol(); else bgmStart();
    } else {
      if (bgmRunning) bgmStop();
    }
  }

  // expose
  window.SFX = SFX;
  window.BGM = {
    start: bgmStart,
    stop: bgmStop,
    apply: applyAudio,
    isPlaying: function () { return bgmRunning; }
  };

  // ---------------------------------------------------------------
  //  First-gesture bootstrap — unlock audio + kick BGM if enabled
  // ---------------------------------------------------------------
  var unlocked = false;
  function unlockAudio() {
    if (unlocked) return;
    unlocked = true;
    audio();          // create + resume the context inside the gesture
    applyAudio();     // start the ambient pad if settings.bgm
    // these listeners only needed once
    document.removeEventListener('pointerdown', unlockAudio, true);
    document.removeEventListener('keydown', unlockAudio, true);
  }
  document.addEventListener('pointerdown', unlockAudio, true);
  document.addEventListener('keydown', unlockAudio, true);

  // ---------------------------------------------------------------
  //  4. DELEGATED CLICK → SFX('click')
  //  One capturing listener; matches common interactive controls. Subtle.
  // ---------------------------------------------------------------
  var SFX_SELECTOR = '.btn,.navbtn,.tile,.start,.pull,.sbtn,.back';
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    // skip our own settings controls (they make their own toggle/confirm sounds)
    if (t.closest('.set-ctl')) return;
    if (t.closest(SFX_SELECTOR)) {
      // unlockAudio runs on pointerdown (fires before click), so context is ready
      SFX('click');
    }
  }, false);

  // ---------------------------------------------------------------
  //  3 / 2. STYLE — prefixed .set-* classes, injected once with a guard id
  // ---------------------------------------------------------------
  function injectStyle() {
    if (document.getElementById('set-style')) return;
    var css = '' +
      '.set-row{align-items:center}' +
      '.set-row .gr{flex:1;min-width:0}' +
      '.set-ctl{flex:none;display:flex;align-items:center;gap:10px}' +
      /* toggle switch */
      '.set-switch{position:relative;width:46px;height:26px;border-radius:16px;cursor:pointer;flex:none;' +
        'background:#11111d;border:1px solid var(--line);transition:background .18s,border-color .18s}' +
      '.set-switch::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;' +
        'background:#55557a;transition:transform .18s,background .18s;box-shadow:0 1px 3px rgba(0,0,0,.5)}' +
      '.set-switch.on{background:linear-gradient(135deg,var(--glow),var(--glow2));border-color:transparent;' +
        'box-shadow:0 0 12px rgba(139,92,246,.45)}' +
      '.set-switch.on::after{transform:translateX(20px);background:#fff}' +
      /* volume slider */
      '.set-slider{appearance:none;-webkit-appearance:none;width:120px;height:6px;border-radius:5px;cursor:pointer;' +
        'background:#0c0c16;outline:none;border:1px solid var(--line)}' +
      '.set-slider::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;cursor:pointer;' +
        'background:radial-gradient(circle at 35% 30%,#e9d5ff,var(--glow) 55%,var(--glow2));' +
        'box-shadow:0 0 8px rgba(139,92,246,.6);border:none}' +
      '.set-slider::-moz-range-thumb{width:16px;height:16px;border-radius:50%;cursor:pointer;border:none;' +
        'background:radial-gradient(circle at 35% 30%,#e9d5ff,var(--glow) 55%,var(--glow2));box-shadow:0 0 8px rgba(139,92,246,.6)}' +
      '.set-slider:disabled{opacity:.35;cursor:default}' +
      '.set-vol{width:84px}' +
      '.set-pct{font-size:11px;color:var(--gold);font-weight:700;min-width:34px;text-align:right}' +
      '.set-sub{display:flex;flex-direction:column;gap:9px;margin-top:8px}' +
      '.set-subrow{display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--muted)}' +
      '.set-subrow .lbl{width:46px;flex:none;font-weight:700}' +
      /* language segmented control */
      '.set-seg{display:flex;gap:5px}' +
      '.set-seg .sg{padding:5px 13px;border-radius:14px;font-size:11.5px;cursor:pointer;font-weight:700;' +
        'background:var(--panel2);border:1px solid var(--line);color:var(--muted)}' +
      '.set-seg .sg.on{background:linear-gradient(135deg,var(--glow),var(--glow2));border-color:transparent;color:#fff}' +
      '.set-locked{font-size:13px;color:var(--muted)}';
    var styleEl = document.createElement('style');
    styleEl.id = 'set-style';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // ---------------------------------------------------------------
  //  Build / refresh the #profile rows (the screen has no render fn)
  // ---------------------------------------------------------------
  function pct(v) { return Math.round(clamp01(v) * 100) + '%'; }

  function decorateProfile() {
    var screen = document.getElementById('profile');
    if (!screen) return;
    var body = screen.querySelector('.body');
    if (!body) return;
    if (body.getAttribute('data-set-enhanced') === '1') { syncProfileUI(); return; }

    var s = st();
    var rows = body.querySelectorAll('.listcard');
    // rows[0] = เสียง & เพลง (audio) · rows[1] = ภาษา (lang)
    // rows[2] = การหมุนจอ (locked) · rows[3] = เชื่อมบัญชี (account)

    // --- AUDIO row: BGM + SFX toggles with volume sliders ---
    if (rows[0]) {
      var aRow = rows[0];
      aRow.classList.add('set-row');
      var gr = aRow.querySelector('.gr');
      var rt = aRow.querySelector('.rt');
      if (gr) {
        gr.innerHTML =
          '<div class="t">เสียง &amp; เพลง</div>' +
          '<div class="set-sub set-ctl">' +
            '<div class="set-subrow">' +
              '<span class="lbl">เพลง</span>' +
              '<div class="set-switch" data-toggle="bgm" role="switch" tabindex="0"></div>' +
              '<input class="set-slider set-vol" type="range" min="0" max="100" step="1" data-vol="bgmVol">' +
              '<span class="set-pct" data-pct="bgmVol"></span>' +
            '</div>' +
            '<div class="set-subrow">' +
              '<span class="lbl">เอฟเฟกต์</span>' +
              '<div class="set-switch" data-toggle="sfx" role="switch" tabindex="0"></div>' +
              '<input class="set-slider set-vol" type="range" min="0" max="100" step="1" data-vol="sfxVol">' +
              '<span class="set-pct" data-pct="sfxVol"></span>' +
            '</div>' +
          '</div>';
      }
      if (rt) rt.remove(); // drop the static "เปิด" label — toggles convey state now
    }

    // --- LANGUAGE row: segmented th / en ---
    if (rows[1]) {
      var lRow = rows[1];
      lRow.classList.add('set-row');
      var lrt = lRow.querySelector('.rt');
      if (lrt) {
        lrt.classList.add('set-ctl');
        lrt.innerHTML =
          '<div class="set-seg">' +
            '<div class="sg" data-lang="th">ไทย</div>' +
            '<div class="sg" data-lang="en">EN</div>' +
          '</div>';
      }
    }

    // --- ROTATION row: keep locked (just style the lock) ---
    if (rows[2]) {
      var rRow = rows[2];
      var rrt = rRow.querySelector('.rt');
      if (rrt) { rrt.classList.add('set-locked'); }
    }

    body.setAttribute('data-set-enhanced', '1');
    wireProfileEvents(body);
    syncProfileUI();
  }

  // bind events ONCE per body (delegated within the profile body)
  function wireProfileEvents(body) {
    if (body.getAttribute('data-set-wired') === '1') return;
    body.setAttribute('data-set-wired', '1');

    // toggles (switches)
    body.addEventListener('click', function (e) {
      var sw = e.target.closest && e.target.closest('.set-switch');
      if (sw && body.contains(sw)) { e.stopPropagation(); toggleSetting(sw.getAttribute('data-toggle')); return; }
      var sg = e.target.closest && e.target.closest('.sg[data-lang]');
      if (sg && body.contains(sg)) { e.stopPropagation(); setLang(sg.getAttribute('data-lang')); return; }
    });
    // keyboard a11y for switches
    body.addEventListener('keydown', function (e) {
      var sw = e.target.closest && e.target.closest('.set-switch');
      if (sw && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleSetting(sw.getAttribute('data-toggle')); }
    });
    // volume sliders (live while dragging)
    body.addEventListener('input', function (e) {
      var sl = e.target.closest && e.target.closest('.set-slider[data-vol]');
      if (sl) { setVol(sl.getAttribute('data-vol'), sl.value); }
    });
    // commit sound only on release (avoid a sound storm while dragging)
    body.addEventListener('change', function (e) {
      var sl = e.target.closest && e.target.closest('.set-slider[data-vol]');
      if (sl) { ensureUnlocked(); SFX('confirm'); }
    });
  }

  function ensureUnlocked() { if (!unlocked) unlockAudio(); else audio(); }

  function toggleSetting(key) {
    if (key !== 'bgm' && key !== 'sfx') return;
    var s = st();
    s[key] = !s[key];
    G.save();
    ensureUnlocked();
    if (key === 'bgm') {
      applyAudio();
      G.toast(s.bgm ? '🎵 เปิดเพลงประกอบ' : '🔇 ปิดเพลงประกอบ');
    } else {
      // sfx toggle: play a confirm only if turning ON (so OFF is silent)
      if (s.sfx) SFX('confirm');
      G.toast(s.sfx ? '🔊 เปิดเสียงเอฟเฟกต์' : '🔇 ปิดเสียงเอฟเฟกต์');
    }
    syncProfileUI();
  }

  function setVol(key, value) {
    if (key !== 'bgmVol' && key !== 'sfxVol') return;
    var s = st();
    s[key] = clamp01(parseFloat(value) / 100);
    G.save();
    if (key === 'bgmVol') { if (bgmRunning) bgmApplyVol(); else if (s.bgm) applyAudio(); }
    syncProfileUI(true); // light sync (just the %/positions), don't re-toast
  }

  function setLang(lang) {
    if (lang !== 'th' && lang !== 'en') return;
    var s = st();
    if (s.lang === lang) return;
    s.lang = lang;
    G.save();
    ensureUnlocked();
    SFX('confirm');
    G.toast(lang === 'th' ? '🌐 ภาษา: ไทย' : '🌐 Language: English (เดโม — UI ยังเป็นไทย)');
    syncProfileUI();
  }

  // reflect current settings into the profile DOM
  function syncProfileUI(light) {
    var screen = document.getElementById('profile');
    if (!screen) return;
    var body = screen.querySelector('.body');
    if (!body || body.getAttribute('data-set-enhanced') !== '1') return;
    var s = st();

    // switches
    body.querySelectorAll('.set-switch[data-toggle]').forEach(function (sw) {
      var on = !!s[sw.getAttribute('data-toggle')];
      sw.classList.toggle('on', on);
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    // sliders + their disabled state (slider greyed when its channel is OFF)
    body.querySelectorAll('.set-slider[data-vol]').forEach(function (sl) {
      var key = sl.getAttribute('data-vol');
      var chan = key === 'bgmVol' ? 'bgm' : 'sfx';
      var v = Math.round(clamp01(s[key]) * 100);
      if (String(sl.value) !== String(v)) sl.value = v;
      sl.disabled = !s[chan];
    });
    // percentages
    body.querySelectorAll('.set-pct[data-pct]').forEach(function (el) {
      el.textContent = pct(s[el.getAttribute('data-pct')]);
    });
    if (light) return;
    // language segments
    body.querySelectorAll('.sg[data-lang]').forEach(function (sg) {
      sg.classList.toggle('on', sg.getAttribute('data-lang') === s.lang);
    });
  }

  // ---------------------------------------------------------------
  //  Boot
  // ---------------------------------------------------------------
  function boot() {
    injectStyle();
    decorateProfile();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // Re-decorate / re-sync #profile whenever it becomes the active screen.
  // Wrap window.go idempotently (capture previous, call it first, then add ours).
  if (window.go && !window.go.__settingsWrapped) {
    var _origGo = window.go;
    window.go = function (id) {
      var r = _origGo.apply(this, arguments);
      try {
        if (id === 'profile') { injectStyle(); decorateProfile(); }
      } catch (e) {}
      return r;
    };
    window.go.__settingsWrapped = true;
  }
})();
