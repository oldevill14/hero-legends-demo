/* sim.js — build a live battle from a chosen team + stage using the REAL bundled
   engine (window.HLT.simulateBattle from engine.js). Mirrors generate-replay.ts /
   BattleService team-building so results match the server. Produces the same
   {meta, player[], enemy[], events[]} shape the viewer already renders. */
window.HLTSim = (function () {
  const SEED = 20690614;
  let GD = null; // {heroes, skills, enemies, stages, byId...}

  async function loadGamedata() {
    if (GD) return GD;
    const j = async (f) => (await fetch('gamedata/' + f)).json();
    const [heroes, skillsRaw, enemiesRaw, stagesRaw] = await Promise.all(
      ['heroes.json', 'skills.json', 'enemies.json', 'stages.json'].map(j));
    const skills = Array.isArray(skillsRaw) ? skillsRaw : skillsRaw.skills;
    const enemies = Array.isArray(enemiesRaw) ? enemiesRaw : enemiesRaw.enemies;
    const stages = Array.isArray(stagesRaw) ? stagesRaw : stagesRaw.stages;
    const skillById = new Map(skills.map(s => [s.skill_id, s]));
    const skillsByHero = new Map();
    for (const s of skills) { if (!skillsByHero.has(s.hero_id)) skillsByHero.set(s.hero_id, []); skillsByHero.get(s.hero_id).push(s); }
    GD = {
      heroes, skills, enemies, stages, skillById, skillsByHero,
      heroById: new Map(heroes.map(h => [h.id, h])),
      enemyById: new Map(enemies.map(e => [e.id, e])),
      stageById: new Map(stages.map(s => [s.stage_id ?? s.id, s])),
    };
    return GD;
  }

  // skillsFor with by-hero_id fallback (demo — heroes.json skill_ids often mismatch)
  function skillsFor(h) {
    const ids = h.skill_ids || [];
    const byId = ids.map(i => GD.skillById.get(i)).filter(Boolean);
    return byId.length ? byId : (GD.skillsByHero.get(h.id) || []);
  }
  function playerSpec(heroId, level) {
    const h = GD.heroById.get(heroId);
    const stats = { ...h.base_stats };
    const eb = (typeof window !== 'undefined' && window.equipBonus) ? window.equipBonus(h.id) : null;
    if (eb) {
      stats.hp = Math.round((stats.hp || 0) + (eb.hp || 0));
      stats.atk = Math.round((stats.atk || 0) + (eb.atk || 0));
      stats.def = Math.round((stats.def || 0) + (eb.def || 0));
      stats.spd = Math.round((stats.spd || 0) + (eb.spd || 0));
      stats.crit = Math.min(1, (stats.crit || 0) + (eb.crit || 0));
      stats.critdmg = (stats.critdmg || 0) + (eb.critdmg || 0);
      stats.acc = Math.min(1, (stats.acc || 0) + (eb.acc || 0));
      stats.res = Math.min(1, (stats.res || 0) + (eb.res || 0));
    }
    return { heroId: h.id, name: h.name_en || h.name_th || h.id, level, element: h.element, stats, skills: skillsFor(h) };
  }
  function enemySpecs(stage, lvl) {
    return (stage.enemy_team || []).slice(0, 5).map(e => {
      const l = e.level ?? lvl;
      if (e.enemy) { const d = GD.enemyById.get(e.enemy);
        if (d) return { heroId: d.id, name: d.name_en || d.name_th || d.id, level: l, element: d.element, stats: { ...d.base_stats }, skills: d.skill ? [d.skill] : [] }; }
      if (e.hero_id) { const h = GD.heroById.get(e.hero_id);
        if (h) return { heroId: h.id, name: h.name_en || h.name_th || h.id, level: l, element: h.element, stats: { ...h.base_stats }, skills: skillsFor(h) }; }
      return { heroId: 'unknown', name: 'Unknown', level: l, element: 'Water', stats: { hp: 1000, atk: 100, def: 80, spd: 100, crit: .05, critdmg: 1.5, acc: 0, res: 0 }, skills: [] };
    });
  }
  function roster(specs, side) {
    return specs.map((s, i) => {
      const src = GD.heroById.get(s.heroId) || GD.enemyById.get(s.heroId);
      return { uid: side + ':' + i, slotIndex: i, side, heroId: s.heroId,
        name_th: (src && src.name_th) || s.name, name_en: (src && src.name_en) || s.name,
        element: s.element, class: (src && src.class) || '-', rarity: (src && src.rarity) || '-',
        is_boss: !!(src && src.is_boss), maxHp: Math.max(1, Math.round(s.stats.hp)),
        atk: s.stats.atk, def: s.stats.def, spd: s.stats.spd, skills: [] };
    });
  }

  async function build(stageId, teamIds) {
    await loadGamedata();
    // normalize '2-6' (game.html) -> 'stage_2_6' (gamedata)
    let sid = stageId;
    if (!GD.stageById.has(sid)) { const alt = 'stage_' + String(stageId).replace(/-/g, '_'); if (GD.stageById.has(alt)) sid = alt; }
    const stage = GD.stageById.get(sid) || GD.stages[0];
    const lvl = stage.battle_level ?? stage.level ?? 30;
    const pSpecs = (teamIds && teamIds.length ? teamIds : ['hero_phraaphai','hero_srisuwan','hero_sudsakorn','hero_sinsamut','hero_nang_ngeuak'])
      .map(id => playerSpec(id, lvl));
    const eSpecs = enemySpecs(stage, lvl);
    const sim = window.HLT.simulateBattle({ seed: SEED, playerTeam: pSpecs, enemyTeam: eSpecs, turnLimit: 50 });
    return {
      meta: { stageId, stageName: stage.name || stageId, chapter: stage.chapter ?? null, isBoss: !!stage.is_boss,
        seed: SEED, result: sim.result, turns: sim.turns, finalHpPercent: sim.replay.finalHpPercent, live: true },
      player: roster(pSpecs, 'player'), enemy: roster(eSpecs, 'enemy'), events: sim.replay.events,
    };
  }
  return { build, loadGamedata };
})();
