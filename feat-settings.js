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

  // ---------------------------------------------------------------
  //  FLUTE LULLABY — "เพลงปี่กล่อมนิทรา" (พระอภัยมณี's enchanted flute)
  //  A breathy synthesized flute playing a slow, spacious pentatonic
  //  melody → hypnotic / sleep-inducing, like the magic ปี่ in the tale.
  // ---------------------------------------------------------------
  // ---- scales (Hz, 7 voices) + melodic phrases [scaleIndex, beats] (idx<0 = rest) ----
  var SCALES = {
    pentaG:   [196.00, 220.00, 246.94, 293.66, 329.63, 392.00, 440.00], // G A B D E G A
    pentaDhi: [293.66, 329.63, 369.99, 440.00, 493.88, 587.33, 659.25], // D E F# A B D E (bright)
    minorA:   [220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25], // A C D E G A C (tense)
    pentaC:   [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33]  // C D E G A C D (warm)
  };
  var PHRASES = {
    lullaby: [[4,4],[3,2],[2,2],[1,4],[-1,2],[3,2],[2,2],[1,2],[0,6],[-1,3],[2,2],[1,2],[0,8],[-1,5],[5,3],[4,3],[3,2],[2,2],[1,4],[0,8],[-1,6]],
    mystic:  [[2,3],[4,3],[5,4],[-1,2],[6,3],[4,3],[3,5],[-1,3],[4,2],[5,2],[6,6],[-1,5]],
    voyage:  [[1,2],[2,2],[3,3],[4,3],[-1,1],[3,2],[4,2],[5,3],[4,3],[-1,2],[2,2],[3,2],[1,5],[-1,3]],
    duel:    [[0,1],[0,1],[3,1],[2,1],[0,1],[3,1],[4,2],[-1,1],[5,1],[4,1],[5,1],[6,1],[5,2],[3,1],[2,1],[0,2],[3,1],[4,1],[6,3],[-1,1]],
    hall:    [[0,2],[1,2],[2,3],[1,2],[3,3],[2,2],[1,2],[0,4],[-1,2],[2,2],[3,2],[4,4],[-1,3]]
  };
  // each screen-mood: scale + phrase + tempo + flute tone (cut) + pad chord + reverb wet + nature ambience mix
  var MOODS = {
    calm:   { scale: SCALES.pentaG,   beat: 0.95, mel: PHRASES.lullaby, cut: 2100, pad: [110, 164.81, 220],    wet: 0.55, amb: { ocean: 0.8, crickets: 0.5 } },
    mystic: { scale: SCALES.pentaDhi, beat: 0.80, mel: PHRASES.mystic,  cut: 3200, pad: [146.83, 220, 293.66], wet: 0.72, amb: { wind: 0.5, ocean: 0.4 } },
    voyage: { scale: SCALES.pentaG,   beat: 0.72, mel: PHRASES.voyage,  cut: 2500, pad: [98, 146.83, 196],     wet: 0.50, amb: { ocean: 1.0 } },
    duel:   { scale: SCALES.minorA,   beat: 0.46, mel: PHRASES.duel,    cut: 3100, pad: [110, 164.81, 220],    wet: 0.30, amb: { wind: 0.5 },
              perc: { steps: 16, kick: [0, 3, 6, 8, 11, 13], tom: [2, 5, 10, 12, 14, 15], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] } },
    hall:   { scale: SCALES.pentaC,   beat: 0.74, mel: PHRASES.hall,    cut: 2200, pad: [130.81, 196, 261.63], wet: 0.50, amb: { ocean: 0.6, crickets: 0.3 } }
  };
  var SCREEN_MOOD = {
    hub: 'calm', heroes: 'calm', detail: 'calm', profile: 'calm', upgrade: 'calm', equip: 'calm', inventory: 'calm', mail: 'calm',
    summon: 'mystic', events: 'mystic',
    stages: 'voyage', team: 'voyage', modes: 'voyage',
    arena: 'duel',
    guild: 'hall', shop: 'hall'
  };
  function moodFor(id) { return SCREEN_MOOD[id] || 'calm'; }
  var currentMood = 'calm';
  var brownBuf = null;

  var noiseBuf = null, reverbBuf = null;
  function getNoise(ctx) {
    if (noiseBuf) return noiseBuf;
    var len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function getReverb(ctx) {
    if (reverbBuf) return reverbBuf;
    var secs = 2.8, len = Math.floor(ctx.sampleRate * secs);
    reverbBuf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var c = reverbBuf.getChannelData(ch);
      for (var i = 0; i < len; i++) c[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return reverbBuf;
  }

  // a soft envelope: gentle attack, sustain, gentle release (legato, breathy)
  function aenv(param, when, dur, peak, atk, rel) {
    peak = Math.max(0.0003, peak);
    param.setValueAtTime(0.0001, when);
    param.exponentialRampToValueAtTime(peak, when + atk);
    param.setValueAtTime(peak, when + Math.max(atk + 0.02, dur));
    param.exponentialRampToValueAtTime(0.0001, when + dur + rel);
  }

  // one flute note: fundamental (sine) + soft octave (triangle) + breath noise,
  // shared vibrato on detune, into the flute bus.
  function fluteNote(ctx, freq, when, dur, vel, bus, vibGain) {
    var atk = 0.12, rel = Math.min(0.7, dur * 0.5);
    var o1 = ctx.createOscillator(); o1.type = 'sine';     o1.frequency.value = freq;
    var o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq * 2;
    if (vibGain) { try { vibGain.connect(o1.detune); vibGain.connect(o2.detune); } catch (e) {} }
    var g1 = ctx.createGain(); aenv(g1.gain, when, dur, vel,        atk, rel);
    var g2 = ctx.createGain(); aenv(g2.gain, when, dur, vel * 0.18, atk, rel);
    // breath air: band-passed noise around the note, very soft
    var nb = ctx.createBufferSource(); nb.buffer = getNoise(ctx); nb.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * 2.0; bp.Q.value = 5;
    var gn = ctx.createGain(); aenv(gn.gain, when, dur, vel * 0.05, atk * 1.6, rel);
    o1.connect(g1).connect(bus);
    o2.connect(g2).connect(bus);
    nb.connect(bp).connect(gn).connect(bus);
    var end = when + dur + rel + 0.12;
    o1.start(when); o2.start(when); nb.start(when);
    o1.stop(end); o2.stop(end); nb.stop(end);
    o1.onended = function () { try { o1.disconnect(); o2.disconnect(); g1.disconnect(); g2.disconnect(); nb.disconnect(); bp.disconnect(); gn.disconnect(); } catch (e) {} };
  }

  // look-ahead scheduler: plays the CURRENT scene's phrase + loops seamlessly
  function fluteSchedule() {
    if (!bgmRunning || !bgmNodes || !AC) return;
    var ctx = AC, nodes = bgmNodes;
    var mel = nodes.mel, scale = nodes.scale, beat = nodes.beat;
    if (!mel || !scale) return;
    var lookahead = ctx.currentTime + 0.7;
    while (nodes.nextNote < lookahead) {
      var step = mel[nodes.mi % mel.length];
      var beats = step[1], idx = step[0];
      if (idx >= 0) {
        var dur = beats * beat * 0.92;
        var vel = 0.5 + ((nodes.mi % 3) * 0.04);   // tiny per-note variation
        fluteNote(ctx, scale[idx], nodes.nextNote, dur, vel, nodes.fluteLP, nodes.vibGain);
      }
      nodes.nextNote += beats * beat;
      nodes.mi = (nodes.mi + 1) % mel.length;      // loop the phrase
    }
  }

  // ---------------------------------------------------------------
  //  NATURE AMBIENCE — ocean waves / wind / night crickets (เสียงธรรมชาติคลอ)
  // ---------------------------------------------------------------
  function getBrown(ctx) {
    if (brownBuf) return brownBuf;
    var len = Math.floor(ctx.sampleRate * 3);
    brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = brownBuf.getChannelData(0), last = 0;
    for (var i = 0; i < len; i++) { var w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    return brownBuf;
  }

  // build the ambience generators once → ambBus → master. Returns handles.
  function buildAmbience(ctx, master) {
    var ambBus = ctx.createGain(); ambBus.gain.value = 1; ambBus.connect(master);

    // OCEAN: brown noise → lowpass, amplitude swelling on a slow wave LFO
    var ocean = ctx.createBufferSource(); ocean.buffer = getBrown(ctx); ocean.loop = true;
    var oceanLP = ctx.createBiquadFilter(); oceanLP.type = 'lowpass'; oceanLP.frequency.value = 480; oceanLP.Q.value = 0.6;
    var oceanWave = ctx.createGain(); oceanWave.gain.value = 0.5;       // swelled by LFO
    var oceanLevel = ctx.createGain(); oceanLevel.gain.value = 0;       // scene-controlled
    ocean.connect(oceanLP).connect(oceanWave).connect(oceanLevel).connect(ambBus);
    var waveLfo = ctx.createOscillator(); waveLfo.type = 'sine'; waveLfo.frequency.value = 0.09; // ~11s swell
    var waveAmt = ctx.createGain(); waveAmt.gain.value = 0.34;
    waveLfo.connect(waveAmt).connect(oceanWave.gain); waveLfo.start();
    ocean.start();

    // WIND: white noise → bandpass that drifts
    var wind = ctx.createBufferSource(); wind.buffer = getNoise(ctx); wind.loop = true;
    var windBP = ctx.createBiquadFilter(); windBP.type = 'bandpass'; windBP.frequency.value = 650; windBP.Q.value = 0.8;
    var windLevel = ctx.createGain(); windLevel.gain.value = 0;
    wind.connect(windBP).connect(windLevel).connect(ambBus);
    var windLfo = ctx.createOscillator(); windLfo.type = 'sine'; windLfo.frequency.value = 0.05;
    var windAmt = ctx.createGain(); windAmt.gain.value = 320;
    windLfo.connect(windAmt).connect(windBP.frequency); windLfo.start();
    wind.start();

    // CRICKETS: scheduled high trills, gated by cricketLevel
    var cricketLevel = ctx.createGain(); cricketLevel.gain.value = 0; cricketLevel.connect(ambBus);

    // WAR-DRUM bus (used only by intense moods that define a perc pattern)
    var drumBus = ctx.createGain(); drumBus.gain.value = 1.25; drumBus.connect(master);

    return {
      ambBus: ambBus,
      ocean: ocean, oceanLP: oceanLP, oceanWave: oceanWave, oceanLevel: oceanLevel, waveLfo: waveLfo, waveAmt: waveAmt,
      wind: wind, windBP: windBP, windLevel: windLevel, windLfo: windLfo, windAmt: windAmt,
      cricketLevel: cricketLevel, drumBus: drumBus
    };
  }

  // one cricket trill: a few short high chirps
  function cricketChirp(ctx, when, dest) {
    var base = 4200 + Math.random() * 1100;
    var n = 2 + (Math.random() * 3 | 0);
    for (var i = 0; i < n; i++) {
      var t = when + i * 0.035;
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base + (Math.random() * 120 - 60);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.026);
      o.connect(g).connect(dest);
      o.start(t); o.stop(t + 0.04);
      o.onended = (function (oo, gg) { return function () { try { oo.disconnect(); gg.disconnect(); } catch (e) {} }; })(o, g);
    }
  }

  // ---------------------------------------------------------------
  //  WAR DRUMS — driving percussion for intense moods (กลองศึก)
  // ---------------------------------------------------------------
  function drumKick(ctx, when, vel, dest) {
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(155, when); o.frequency.exponentialRampToValueAtTime(45, when + 0.11);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vel, when + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    o.connect(g).connect(dest); o.start(when); o.stop(when + 0.26);
    o.onended = function () { try { o.disconnect(); g.disconnect(); } catch (e) {} };
  }
  function drumTom(ctx, when, vel, dest) { // taiko-ish war drum
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(184, when); o.frequency.exponentialRampToValueAtTime(92, when + 0.14);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vel, when + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
    var nb = ctx.createBufferSource(); nb.buffer = getNoise(ctx);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
    var ng = ctx.createGain(); ng.gain.setValueAtTime(vel * 0.5, when); ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    o.connect(g).connect(dest); nb.connect(lp).connect(ng).connect(dest);
    o.start(when); o.stop(when + 0.34); nb.start(when); nb.stop(when + 0.07);
    o.onended = function () { try { o.disconnect(); g.disconnect(); nb.disconnect(); lp.disconnect(); ng.disconnect(); } catch (e) {} };
  }
  function drumSnare(ctx, when, vel, dest) {
    var nb = ctx.createBufferSource(); nb.buffer = getNoise(ctx);
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vel * 0.8, when + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
    var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 220;
    var og = ctx.createGain(); og.gain.setValueAtTime(vel * 0.28, when); og.gain.exponentialRampToValueAtTime(0.0001, when + 0.1);
    nb.connect(hp).connect(g).connect(dest); o.connect(og).connect(dest);
    nb.start(when); nb.stop(when + 0.16); o.start(when); o.stop(when + 0.12);
    nb.onended = function () { try { nb.disconnect(); hp.disconnect(); g.disconnect(); o.disconnect(); og.disconnect(); } catch (e) {} };
  }
  function drumHat(ctx, when, vel, dest) {
    var nb = ctx.createBufferSource(); nb.buffer = getNoise(ctx);
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vel * 0.4, when + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    nb.connect(hp).connect(g).connect(dest); nb.start(when); nb.stop(when + 0.06);
    nb.onended = function () { try { nb.disconnect(); hp.disconnect(); g.disconnect(); } catch (e) {} };
  }

  // look-ahead drum scheduler — runs only when the current mood has a `perc` pattern
  function percSchedule() {
    if (!bgmRunning || !bgmNodes || !AC) return;
    var p = bgmNodes.perc; if (!p) return;
    var ctx = AC, n = bgmNodes, dest = n.amb && n.amb.drumBus; if (!dest) return;
    var stepDur = n.beat * 0.5;                 // eighth-note grid
    var lookahead = ctx.currentTime + 0.7;
    while (n.percTime < lookahead) {
      var s = n.percStep % p.steps;
      if (p.kick && p.kick.indexOf(s) >= 0) drumKick(ctx, n.percTime, 0.95, dest);
      if (p.tom && p.tom.indexOf(s) >= 0) drumTom(ctx, n.percTime, 0.72, dest);
      if (p.snare && p.snare.indexOf(s) >= 0) drumSnare(ctx, n.percTime, 0.8, dest);
      if (p.hat && p.hat.indexOf(s) >= 0) drumHat(ctx, n.percTime, (s % 2 ? 0.42 : 0.7), dest);
      n.percTime += stepDur;
      n.percStep = (n.percStep + 1) % p.steps;
    }
  }

  // ramp an AudioParam smoothly to a target
  function ramp(param, to, sec) {
    if (!AC) { try { param.value = to; } catch (e) {} return; }
    var now = AC.currentTime;
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(to, now + (sec || 1));
    } catch (e) { try { param.value = to; } catch (e2) {} }
  }

  // crossfade ambience generators to a mood's mix (name→level)
  function setAmbience(mix, sec) {
    if (!bgmNodes || !bgmNodes.amb) return;
    var a = bgmNodes.amb;
    ramp(a.oceanLevel.gain, (mix.ocean || 0) * 0.6, sec);
    ramp(a.windLevel.gain, (mix.wind || 0) * 0.18, sec);
    ramp(a.cricketLevel.gain, (mix.crickets || 0) * 0.6, sec);
    bgmNodes.cricketsOn = (mix.crickets || 0) > 0;
  }

  // morph the running BGM to a screen's mood (smooth — no teardown)
  function applyScene(key) {
    currentMood = key;
    if (!bgmRunning || !bgmNodes || !AC) return;
    var m = MOODS[key] || MOODS.calm;
    bgmNodes.scale = m.scale; bgmNodes.mel = m.mel; bgmNodes.beat = m.beat;
    bgmNodes.mi = 0; // start the new motif cleanly at the next scheduled note
    bgmNodes.perc = m.perc || null;                 // war drums only on intense moods
    if (m.perc) { bgmNodes.percStep = 0; bgmNodes.percTime = AC.currentTime + 0.25; }
    // glide the pad chord to the new harmony
    var now = AC.currentTime;
    m.pad.forEach(function (f, i) {
      var o = bgmNodes.oscs[i]; if (!o) return;
      try { o.frequency.cancelScheduledValues(now); o.frequency.setValueAtTime(o.frequency.value, now); o.frequency.linearRampToValueAtTime(f, now + 1.6); }
      catch (e) { try { o.frequency.value = f; } catch (e2) {} }
    });
    ramp(bgmNodes.fluteLP.frequency, m.cut, 1.2);   // flute brightness
    ramp(bgmNodes.revGain.gain, m.wet, 1.0);        // reverb depth
    setAmbience(m.amb, 1.6);                         // nature bed
  }

  // ---- BGM: enchanted flute melody over a subtle ambient pad ----
  function bgmStart() {
    var s = st();
    if (!s.bgm || s.bgmVol <= 0) return;
    var ctx = audio();
    if (!ctx) return;
    if (bgmRunning) { bgmApplyVol(); return; }

    var master = ctx.createGain();
    master.gain.value = 0; // fade in
    // analyser tap for level metering / verification: master → analyser → out
    var analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
    master.connect(analyser);
    analyser.connect(ctx.destination);

    // --- ambient pad bed (kept subtle — sits UNDER the flute) ---
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;          // warm, muffled pad
    lp.Q.value = 0.7;
    var padGain = ctx.createGain();
    padGain.gain.value = 0.5;           // pad quieter than the flute melody
    lp.connect(padGain).connect(master);

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
      vg.gain.value = i === 0 ? 0.42 : 0.24; // bass louder, harmonics softer
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

    // --- enchanted flute layer (the melody — เพลงปี่กล่อมนิทรา) ---
    var fluteLP = ctx.createBiquadFilter();
    fluteLP.type = 'lowpass'; fluteLP.frequency.value = 2300; fluteLP.Q.value = 0.6;
    var fluteGain = ctx.createGain(); fluteGain.gain.value = 0.9; // flute = the focus
    fluteLP.connect(fluteGain).connect(master);
    // dreamy reverb (temple-hall tail)
    var reverb = ctx.createConvolver(); reverb.buffer = getReverb(ctx);
    var revGain = ctx.createGain(); revGain.gain.value = 0.55;
    fluteGain.connect(reverb).connect(revGain).connect(master);
    // one shared slow vibrato on note pitch (±7 cents) for the breathy flute feel
    var vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = 5.0;
    var vibGain = ctx.createGain(); vibGain.gain.value = 7;
    vib.connect(vibGain); vib.start();

    // --- nature ambience bed (ocean / wind / crickets) ---
    var amb = buildAmbience(ctx, master);

    var m0 = MOODS[currentMood] || MOODS.calm;
    bgmNodes = {
      oscs: oscs, lp: lp, padGain: padGain, master: master, analyser: analyser,
      lfo: lfo, lfoGain: lfoGain,
      fluteLP: fluteLP, fluteGain: fluteGain, reverb: reverb, revGain: revGain,
      vib: vib, vibGain: vibGain,
      amb: amb, cricketId: 0, cricketsOn: false,
      scale: m0.scale, mel: m0.mel, beat: m0.beat,
      nextNote: ctx.currentTime + 0.35, mi: 0, schedId: 0
    };
    bgmRunning = true;
    bgmNodes.perc = null; bgmNodes.percStep = 0; bgmNodes.percTime = ctx.currentTime + 0.35;
    fluteSchedule();                                  // prime the first notes
    bgmNodes.schedId = setInterval(function () { fluteSchedule(); percSchedule(); }, 130); // melody + drums
    // cricket trills (only when the current mood asks for them)
    bgmNodes.cricketId = setInterval(function () {
      if (!bgmRunning || !bgmNodes || !bgmNodes.cricketsOn || !AC) return;
      if (Math.random() < 0.4) cricketChirp(AC, AC.currentTime + 0.05, bgmNodes.amb.cricketLevel);
    }, 150);
    applyScene(currentMood);            // set mood tone/pad/ambience for the active screen
    bgmApplyVol(1.4);                   // fade up over ~1.4s
  }

  function bgmApplyVol(fadeSec) {
    if (!bgmRunning || !bgmNodes || !AC) return;
    var s = st();
    var target = 0.20 * clamp01(s.bgmVol); // gentle ceiling — flute audible but soft
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
    if (nodes.schedId) { try { clearInterval(nodes.schedId); } catch (e) {} }   // stop melody scheduler
    if (nodes.cricketId) { try { clearInterval(nodes.cricketId); } catch (e) {} } // stop cricket scheduler
    try {
      nodes.master.gain.cancelScheduledValues(now);
      nodes.master.gain.setValueAtTime(Math.max(0.0001, nodes.master.gain.value), now);
      nodes.master.gain.linearRampToValueAtTime(0.0001, now + fs);
    } catch (e) {}
    setTimeout(function () {
      try {
        nodes.oscs.forEach(function (o) { try { o.stop(); o.disconnect(); } catch (e) {} });
        try { nodes.lfo.stop(); nodes.lfo.disconnect(); } catch (e) {}
        try { nodes.vib.stop(); nodes.vib.disconnect(); } catch (e) {}
        try { nodes.lp.disconnect(); nodes.padGain.disconnect(); } catch (e) {}
        try { nodes.fluteLP.disconnect(); nodes.fluteGain.disconnect(); nodes.reverb.disconnect(); nodes.revGain.disconnect(); nodes.vibGain.disconnect(); } catch (e) {}
        // ambience
        var a = nodes.amb;
        if (a) {
          try { a.ocean.stop(); a.ocean.disconnect(); } catch (e) {}
          try { a.wind.stop(); a.wind.disconnect(); } catch (e) {}
          try { a.waveLfo.stop(); a.waveLfo.disconnect(); a.windLfo.stop(); a.windLfo.disconnect(); } catch (e) {}
          try { a.oceanLP.disconnect(); a.oceanWave.disconnect(); a.oceanLevel.disconnect(); a.waveAmt.disconnect(); } catch (e) {}
          try { a.windBP.disconnect(); a.windLevel.disconnect(); a.windAmt.disconnect(); a.cricketLevel.disconnect(); a.ambBus.disconnect(); } catch (e) {}
          try { a.drumBus.disconnect(); } catch (e) {}
        }
        try { nodes.analyser.disconnect(); nodes.lfoGain.disconnect(); nodes.master.disconnect(); } catch (e) {}
      } catch (e) {}
    }, Math.round(fs * 1000) + 60);
    bgmRunning = false;
    bgmNodes = null;
  }

  // RMS level off the master analyser (0..~1) — for verification / VU
  function bgmLevel() {
    if (!bgmRunning || !bgmNodes || !bgmNodes.analyser) return 0;
    var a = bgmNodes.analyser, buf = new Uint8Array(a.fftSize);
    a.getByteTimeDomainData(buf);
    var sum = 0; for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
    return Math.sqrt(sum / buf.length);
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
    isPlaying: function () { return bgmRunning; },
    level: bgmLevel,
    mood: function () { return currentMood; },
    scene: function (k) { applyScene(k); },   // set per-context mood (e.g. battle page → 'duel')
    debug: function () {
      if (!bgmRunning || !bgmNodes) return { mood: currentMood, running: false };
      var a = bgmNodes.amb || {};
      return {
        mood: currentMood, beat: bgmNodes.beat, scale0: bgmNodes.scale && bgmNodes.scale[0],
        drums: !!bgmNodes.perc,
        padF: bgmNodes.oscs[0] && Math.round(bgmNodes.oscs[0].frequency.value),
        ocean: a.oceanLevel && +a.oceanLevel.gain.value.toFixed(3),
        wind: a.windLevel && +a.windLevel.gain.value.toFixed(3),
        cricket: a.cricketLevel && +a.cricketLevel.gain.value.toFixed(3)
      };
    }
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
        var nm = moodFor(id);                 // per-screen music mood
        if (nm !== currentMood) applyScene(nm); // morph the BGM (sets currentMood even if idle)
      } catch (e) {}
      return r;
    };
    window.go.__settingsWrapped = true;
  }
})();
