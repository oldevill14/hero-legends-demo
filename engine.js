(() => {
  // backend/src/modules/battle/battle.constants.ts
  var ATB_ACT_THRESHOLD = 1000;
  var DEF_K_BASE = 320;
  var DEF_K_PER_LEVEL = 5;
  var DEF_REDUCTION_CAP = 0.75;
  var MIN_DAMAGE = 1;
  var ELEMENT_ADVANTAGE_MULT = 1.3;
  var ELEMENT_NEUTRAL_MULT = 1;
  var ELEMENT_DISADVANTAGE_MULT = 0.75;
  var ELEMENT_EFFECT_BONUS = 0.15;
  var ENERGY_MAX = 100;
  var ENERGY_GAIN_BASIC = 25;
  var ENERGY_GAIN_ACTIVE = 15;
  var ENERGY_GAIN_ON_HIT = 10;
  var ENERGY_GAIN_ON_HIT_CAP = 10;
  var ULTIMATE_ENERGY_COST = 100;
  var DEFAULT_CRIT_RATE = 0.05;
  var DEFAULT_CRIT_DMG = 1.5;
  var CRIT_RATE_CAP = 1;
  var EFFECT_LAND_MIN = 0.15;
  var EFFECT_LAND_MAX = 1;
  var TURN_LIMIT_PVE = 50;

  // backend/src/modules/battle/prng.ts
  class SeededRng {
    state;
    count = 0;
    constructor(seed) {
      this.state = seed >>> 0;
    }
    next() {
      this.state = this.state + 1831565813 >>> 0;
      let t = this.state;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      this.count++;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    nextInt(min, max) {
      if (max < min) {
        [min, max] = [max, min];
      }
      return min + Math.floor(this.next() * (max - min + 1));
    }
    chance(p) {
      if (p <= 0)
        return false;
      if (p >= 1)
        return true;
      return this.next() < p;
    }
    drawn() {
      return this.count;
    }
  }

  // backend/src/modules/battle/battle-simulator.ts
  var PHYSICAL_BEATS = {
    ["Water" /* Water */]: "Fire" /* Fire */,
    ["Fire" /* Fire */]: "Nature" /* Nature */,
    ["Nature" /* Nature */]: "Water" /* Water */
  };
  function elementRelation(attacker, target) {
    if (PHYSICAL_BEATS[attacker] === target)
      return "advantage";
    if (PHYSICAL_BEATS[target] === attacker)
      return "disadvantage";
    if (attacker === "Light" /* Light */ && target === "Dark" /* Dark */ || attacker === "Dark" /* Dark */ && target === "Light" /* Light */) {
      return "advantage";
    }
    return "neutral";
  }
  function elementDamageMult(attacker, target) {
    switch (elementRelation(attacker, target)) {
      case "advantage":
        return ELEMENT_ADVANTAGE_MULT;
      case "disadvantage":
        return ELEMENT_DISADVANTAGE_MULT;
      default:
        return ELEMENT_NEUTRAL_MULT;
    }
  }
  function elementEffectBonus(attacker, target) {
    switch (elementRelation(attacker, target)) {
      case "advantage":
        return ELEMENT_EFFECT_BONUS;
      case "disadvantage":
        return -ELEMENT_EFFECT_BONUS;
      default:
        return 0;
    }
  }
  function defReduction(def, level) {
    const k = DEF_K_BASE + DEF_K_PER_LEVEL * level;
    const r = def / (def + k);
    return Math.min(r, DEF_REDUCTION_CAP);
  }
  function computeDamage(attacker, target, skillMult, isCrit) {
    const raw = attacker.stats.atk * skillMult;
    const elem = elementDamageMult(attacker.element, target.element);
    const crit = isCrit ? attacker.stats.critdmg || DEFAULT_CRIT_DMG : 1;
    const defR = defReduction(target.stats.def, target.level);
    const dmg = raw * elem * crit * (1 - defR);
    return Math.max(MIN_DAMAGE, Math.round(dmg));
  }
  function effectLandChance(base, attacker, target) {
    const acc = attacker.stats.acc || 0;
    const res = target.stats.res || 0;
    const elem = elementEffectBonus(attacker.element, target.element);
    const chance = base + acc - res + elem;
    return Math.min(EFFECT_LAND_MAX, Math.max(EFFECT_LAND_MIN, chance));
  }
  function makeUnit(spec, side, slotIndex) {
    const maxHp = Math.max(1, Math.round(spec.stats.hp));
    return {
      uid: `${side}:${slotIndex}`,
      side,
      slotIndex,
      heroId: spec.heroId,
      name: spec.name,
      level: spec.level,
      element: spec.element,
      stats: { ...spec.stats },
      hp: maxHp,
      maxHp,
      energy: 0,
      atbGauge: 0,
      statuses: [],
      energyFromHitsThisTurn: 0,
      skills: spec.skills
    };
  }
  function isAlive(u) {
    return u.hp > 0;
  }
  function hasStatus(u, status) {
    return u.statuses.some((s) => s.status === status && s.duration > 0);
  }
  function findSkill(u, slot) {
    return u.skills.find((s) => s.slot === slot);
  }
  function gainEnergy(u, amount) {
    u.energy = Math.min(ENERGY_MAX, Math.max(0, u.energy + amount));
  }
  function gainEnergyFromHit(u) {
    if (u.energyFromHitsThisTurn >= ENERGY_GAIN_ON_HIT_CAP)
      return;
    const room = ENERGY_GAIN_ON_HIT_CAP - u.energyFromHitsThisTurn;
    const grant = Math.min(ENERGY_GAIN_ON_HIT, room);
    u.energyFromHitsThisTurn += grant;
    gainEnergy(u, grant);
  }
  function wakeOnHit(u) {
    u.statuses = u.statuses.filter((s) => s.status !== "sleep" /* Sleep */);
  }
  function isControlled(u) {
    if (hasStatus(u, "stun" /* Stun */))
      return { skip: true, reason: "stun" };
    if (hasStatus(u, "sleep" /* Sleep */))
      return { skip: true, reason: "sleep" };
    if (hasStatus(u, "freeze" /* Freeze */))
      return { skip: true, reason: "freeze" };
    return { skip: false };
  }
  function aliveEnemies(units, side) {
    const foe = side === "player" ? "enemy" : "player";
    return units.filter((u) => u.side === foe && isAlive(u));
  }
  function pickTarget(units, actor) {
    const enemies = aliveEnemies(units, actor.side);
    if (enemies.length === 0)
      return;
    return enemies.reduce((best, cur) => cur.slotIndex < best.slotIndex ? cur : best);
  }
  function applyStatus(u, incoming) {
    if (hasStatus(u, "immunity" /* Immunity */))
      return;
    const existing = u.statuses.find((s) => s.status === incoming.status);
    if (existing) {
      existing.duration = Math.max(existing.duration, incoming.duration);
      if (incoming.value !== undefined) {
        existing.value = existing.value === undefined ? incoming.value : Math.max(existing.value, incoming.value);
      }
    } else {
      u.statuses.push({ ...incoming, stacks: incoming.stacks ?? 1 });
    }
  }
  function tickStatuses(actor, event) {
    const dotMap = {
      ["burn" /* Burn */]: true,
      ["poison" /* Poison */]: true,
      ["bleed" /* Bleed */]: true
    };
    for (const s of actor.statuses) {
      if (dotMap[s.status] && s.duration > 0) {
        const perTurn = Math.max(MIN_DAMAGE, Math.round((s.value ?? 0) * (s.stacks ?? 1)));
        actor.hp = Math.max(0, actor.hp - perTurn);
        event.note = (event.note ? event.note + "+" : "") + `${s.status}(${perTurn})`;
      }
    }
    for (const s of actor.statuses) {
      s.duration -= 1;
    }
    actor.statuses = actor.statuses.filter((s) => s.duration > 0);
  }
  function chooseSlot(actor) {
    if (actor.energy >= ULTIMATE_ENERGY_COST && findSkill(actor, "ultimate")) {
      return "ultimate";
    }
    if (findSkill(actor, "active"))
      return "active";
    return "basic";
  }
  function executeAction(actor, slot, ctx) {
    const event = {
      turn: ctx.turn,
      actor: actor.uid,
      side: actor.side,
      skill: slot,
      targets: [],
      rolls: [],
      amounts: [],
      applied: []
    };
    const skill = findSkill(actor, slot);
    if (slot === "ultimate") {
      gainEnergy(actor, -ULTIMATE_ENERGY_COST);
    } else if (slot === "basic") {
      gainEnergy(actor, ENERGY_GAIN_BASIC);
    } else if (slot === "active") {
      gainEnergy(actor, ENERGY_GAIN_ACTIVE);
    }
    const ops = skill?.effect_ops?.length ? skill.effect_ops : [{ op: "damage", mult: slot === "ultimate" ? 2 : 1 }];
    const isAoe = (skill?.target_rule ?? "").includes("all");
    for (const op of ops) {
      if (op.op === "damage") {
        const targets = isAoe ? aliveEnemies(ctx.units, actor.side) : [pickTarget(ctx.units, actor)].filter(Boolean);
        const baseMult = (skill?.scaling?.mult ?? 0) || op.mult || (slot === "ultimate" ? 2 : 1);
        const hits = Math.max(1, op.hits ?? 1);
        for (const target of targets) {
          let total = 0;
          let crit = false;
          for (let h = 0;h < hits; h++) {
            const roll = ctx.rng.next();
            event.rolls.push(Number(roll.toFixed(6)));
            const critRate = Math.min(CRIT_RATE_CAP, actor.stats.crit || DEFAULT_CRIT_RATE);
            const thisCrit = roll < critRate;
            crit = crit || thisCrit;
            total += computeDamage(actor, target, baseMult, thisCrit);
          }
          target.hp = Math.max(0, target.hp - total);
          wakeOnHit(target);
          gainEnergyFromHit(target);
          event.targets.push(target.uid);
          event.amounts.push(total);
        }
      } else if (op.op === "heal") {
        const allies = ctx.units.filter((u) => u.side === actor.side && isAlive(u));
        const target = allies.reduce((low, cur) => cur.hp / cur.maxHp < low.hp / low.maxHp ? cur : low, actor);
        const amount = Math.max(MIN_DAMAGE, Math.round(actor.stats.atk * ((skill?.scaling?.mult ?? 0) || op.mult || 1)));
        target.hp = Math.min(target.maxHp, target.hp + amount);
        event.targets.push(target.uid);
        event.amounts.push(-amount);
      } else if (op.op === "cc" || op.op === "debuff" || op.op === "buff") {
        const targets = op.op === "buff" ? ctx.units.filter((u) => u.side === actor.side && isAlive(u)) : isAoe ? aliveEnemies(ctx.units, actor.side) : [pickTarget(ctx.units, actor)].filter(Boolean);
        for (const target of targets) {
          const base = op.chance ?? 1;
          const land = op.op === "buff" ? 1 : effectLandChance(base, actor, target);
          const roll = ctx.rng.next();
          event.rolls.push(Number(roll.toFixed(6)));
          if (roll < land) {
            applyStatus(target, {
              status: op.status ?? "stun" /* Stun */,
              duration: Math.max(1, op.duration ?? 1),
              value: op.value
            });
            event.applied?.push({
              target: target.uid,
              status: String(op.status ?? "stun" /* Stun */),
              duration: Math.max(1, op.duration ?? 1)
            });
          }
        }
      } else if (op.op === "energy") {
        const allies = ctx.units.filter((u) => u.side === actor.side && isAlive(u));
        for (const ally of allies)
          gainEnergy(ally, op.value ?? 0);
      } else if (op.op === "cleanse") {
        const allies = ctx.units.filter((u) => u.side === actor.side && isAlive(u));
        for (const ally of allies) {
          ally.statuses = ally.statuses.filter((s) => !isDebuff(s.status));
        }
      }
    }
    return event;
  }
  function isDebuff(status) {
    return status === "sleep" /* Sleep */ || status === "stun" /* Stun */ || status === "silence" /* Silence */ || status === "freeze" /* Freeze */ || status === "burn" /* Burn */ || status === "poison" /* Poison */ || status === "bleed" /* Bleed */ || status === "charm" /* Charm */ || String(status).endsWith("_down");
  }
  function sideAlive(units, side) {
    return units.some((u) => u.side === side && isAlive(u));
  }
  function hpPercent(units, side) {
    const team = units.filter((u) => u.side === side);
    if (team.length === 0)
      return 0;
    const cur = team.reduce((s, u) => s + Math.max(0, u.hp), 0);
    const max = team.reduce((s, u) => s + u.maxHp, 0);
    return max === 0 ? 0 : cur / max;
  }
  function tickUntilReady(units) {
    const living = units.filter(isAlive);
    if (living.length === 0)
      return [];
    let minTicks = Infinity;
    for (const u of living) {
      const spd = Math.max(1, u.stats.spd);
      const remaining = ATB_ACT_THRESHOLD - u.atbGauge;
      const ticks = Math.max(0, Math.ceil(remaining / spd));
      if (ticks < minTicks)
        minTicks = ticks;
    }
    if (!isFinite(minTicks))
      return [];
    for (const u of living) {
      u.atbGauge += Math.max(1, u.stats.spd) * minTicks;
    }
    const ready = living.filter((u) => u.atbGauge >= ATB_ACT_THRESHOLD);
    ready.sort((a, b) => {
      if (b.atbGauge !== a.atbGauge)
        return b.atbGauge - a.atbGauge;
      if (b.stats.spd !== a.stats.spd)
        return b.stats.spd - a.stats.spd;
      return a.slotIndex - b.slotIndex;
    });
    return ready;
  }
  function simulateBattle(input) {
    const rng = new SeededRng(input.seed);
    const turnLimit = input.turnLimit ?? TURN_LIMIT_PVE;
    const units = [
      ...input.playerTeam.map((s, i) => makeUnit(s, "player", i)),
      ...input.enemyTeam.map((s, i) => makeUnit(s, "enemy", i))
    ];
    const events = [];
    let turn = 0;
    while (turn < turnLimit && sideAlive(units, "player") && sideAlive(units, "enemy")) {
      const ready = tickUntilReady(units);
      if (ready.length === 0)
        break;
      for (const actor of ready) {
        if (!isAlive(actor))
          continue;
        if (!sideAlive(units, "player") || !sideAlive(units, "enemy"))
          break;
        turn += 1;
        actor.atbGauge -= ATB_ACT_THRESHOLD;
        actor.energyFromHitsThisTurn = 0;
        const tickEvent = {
          turn,
          actor: actor.uid,
          side: actor.side,
          skill: "skip",
          targets: [],
          rolls: [],
          amounts: []
        };
        tickStatuses(actor, tickEvent);
        if (!isAlive(actor)) {
          tickEvent.note = (tickEvent.note ? tickEvent.note + " " : "") + "died_to_dot";
          events.push(tickEvent);
          continue;
        }
        const cc = isControlled(actor);
        if (cc.skip) {
          tickEvent.note = (tickEvent.note ? tickEvent.note + " " : "") + `skip:${cc.reason}`;
          events.push(tickEvent);
          continue;
        }
        if (tickEvent.note)
          events.push(tickEvent);
        const slot = chooseSlot(actor);
        const actionEvent = executeAction(actor, slot, { units, rng, turn });
        events.push(actionEvent);
        if (turn >= turnLimit)
          break;
      }
    }
    const playerLives = sideAlive(units, "player");
    const enemyLives = sideAlive(units, "enemy");
    let result;
    if (playerLives && !enemyLives) {
      result = "win";
    } else if (!playerLives && enemyLives) {
      result = "lose";
    } else {
      const pPct = hpPercent(units, "player");
      const ePct = hpPercent(units, "enemy");
      result = pPct > ePct ? "win" : pPct < ePct ? "lose" : "draw";
    }
    return {
      result,
      turns: turn,
      replay: {
        seed: input.seed,
        result,
        turns: turn,
        events,
        finalHpPercent: {
          player: Number(hpPercent(units, "player").toFixed(4)),
          enemy: Number(hpPercent(units, "enemy").toFixed(4))
        }
      }
    };
  }

  // prototype/engine-entry.ts
  globalThis.HLT = { simulateBattle };
})();
