// teacher.js: one-to-one port of build() in /workspace/dnd2/teacher_math_ref.py (Teacher owns the math).
// Extras, both OFF in the exact port and covered by tests: opts.primarySwap (teacher_math.md section 2 safety net)
// opts.points (round 6): no flat bonus; opts.alloc {stat:+n} applied after race, cap 20. Without opts = Teacher ref exactly.
(function (root) {
  const T = typeof module !== 'undefined' ? require('./teacher_tables.js') : root.TEACHER_TABLES;
  const { STATS, ARRAY, C, RACE, WIN, SKILLS, SP, DOMAIN } = T;
  const mod = x => Math.floor((x - 10) / 2);
  const cmp = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };
  const rank = (pool, tally, n) => pool.map(([name, tags], i) => [-tags.reduce((s, t) => s + (tally[t] || 0), 0), i, name]).sort(cmp).slice(0, n).map(x => x[2]);

  function build(race, picks, wins, bgSkills, tieChoice = null, opts = {}) {
    if (wins === 0) return { class: 'derp', scores: Object.fromEntries(STATS.map(s => [s, 1])), hp: 1, ac: 5, note: "Derp is permanent; every option is 'derp'." };
    const cnt = {}; picks.forEach(p => { cnt[p.class] = (cnt[p.class] || 0) + 1; });
    const top = Math.max(...Object.values(cnt)), tied = Object.keys(cnt).filter(c => cnt[c] === top).sort();
    const cls = tied.length === 1 ? tied[0] : (tied.includes(tieChoice) ? tieChoice : tied[0]);
    const [prio, hd, saves, nsk, clsk] = C[cls];
    const w = Object.fromEntries(STATS.map(s => [s, picks.reduce((a, p) => a + ((p.stat_weights || {})[s] || 0), 0)]));
    let order = [...STATS].sort((a, b) => (w[b] - w[a]) || (prio.indexOf(a) - prio.indexOf(b)));
    if (opts.primarySwap) {   // section 2: primary gets 15 (Paladin/Monk second stat gets 14)
      const want = cls === 'paladin' ? [prio[0], 'cha'] : cls === 'monk' ? [prio[0], 'wis'] : [prio[0]];
      want.forEach((s, i) => { const j = order.indexOf(s); if (j !== i) { order.splice(j, 1); order.splice(i, 0, s); } });
    }
    const base = Object.fromEntries(order.map((s, i) => [s, ARRAY[i]]));
    const [rb, speed, rsk, hpx] = RACE[race];
    let sc = { ...base };
    for (const [s, v] of Object.entries(rb)) if (STATS.includes(s)) sc[s] += v;
    if ('+1x2' in rb) order.filter(x => x !== 'cha').slice(0, 2).forEach(s => { sc[s] += 1; });
    const b = WIN[wins];
    if (opts.points) {   // wins 6-10 become free points the player allocates (opts.alloc); 1 win stays flat -1
      sc = Object.fromEntries(STATS.map(s => [s, Math.max(1, Math.min(20, sc[s] + (b < 0 ? b : 0) + ((opts.alloc || {})[s] || 0)))]));
    } else sc = Object.fromEntries(Object.entries(sc).map(([s, v]) => [s, Math.max(1, Math.min(20, v + b))]));   // Teacher ref (flat), used by the Python cross-check
    const M = Object.fromEntries(Object.entries(sc).map(([s, v]) => [s, mod(v)]));
    const tally = {}; picks.forEach(p => (p.skills || []).forEach(t => { tally[t] = (tally[t] || 0) + 1; }));
    const best = (cands, taken, n) => { const out = [];
      for (const t of [...cands].sort((a, b2) => ((tally[b2] || 0) - (tally[a] || 0)) || (cands.indexOf(a) - cands.indexOf(b2)))) {
        if (!taken.includes(t) && !out.includes(t)) out.push(t); if (out.length === n) break; }
      return out; };
    let taken = rsk.filter(x => SKILLS.includes(x));
    if (rsk.includes('+2any')) taken = taken.concat(best(SKILLS.slice(), taken, 2));
    const bg = bgSkills.filter(s => !taken.includes(s)).slice(0, 2);
    taken = taken.concat(bg);
    if (bg.length < 2) taken = taken.concat(best(SKILLS.slice(), taken, 2 - bg.length));
    taken = taken.concat(best(clsk, taken, nsk));
    const styles = {}; picks.forEach(p => { styles[p.style] = (styles[p.style] || 0) + 1; });
    const SO = ['melee', 'ranged', 'sneaky', 'magic', 'support'];
    const style = SO.reduce((m, s) => (styles[s] || 0) > (styles[m] || 0) ? s : m, SO[0]);   // Python max(): first max wins
    const hp = Math.max(1, hd + M.con + hpx + (cls === 'sorcerer' ? 1 : 0));
    const d = M.dex, c = M.con, wi = M.wis;
    const fs = cls === 'fighter' ? (style === 'ranged' ? 'Archery' : 'Defense') : null;
    let ac = { barbarian: 10 + d + c, monk: 10 + d + wi, fighter: (sc.str >= 13 ? 16 : 11 + d) + 2 + (fs === 'Defense' ? 1 : 0),
      paladin: 18, cleric: 14 + Math.min(d, 2) + 2, druid: 11 + d + 2, artificer: 14 + Math.min(d, 2), ranger: 11 + d, rogue: 11 + d, bard: 11 + d, warlock: 11 + d,
      sorcerer: 10 + d, wizard: 10 + d }[cls];
    if (cls === 'sorcerer') ac = 13 + d;
    if (cls === 'fighter' && fs === 'Archery') ac = 11 + d;
    let spells = null;
    if (SP[cls]) {
      let [nc, nl, slots, ab, cp, lp] = SP[cls]; const st = {};
      picks.forEach(p => (p.spell_tags || []).forEach(t => { st[t] = (st[t] || 0) + 1; }));
      if (nl === 'prep') nl = Math.max(1, M[ab] + (['cleric', 'druid', 'wizard'].includes(cls) ? 1 : 0));
      if (cls === 'wizard') { const book = rank(lp, st, 6); spells = { cantrips: rank(cp, st, nc), spellbook: book, prepared: book.slice(0, nl) }; }
      else spells = { cantrips: rank(cp, st, nc), level1: rank(lp, st, nl).concat(DOMAIN[cls] || []) };
      Object.assign(spells, { slots, save_dc: 8 + 2 + M[ab], attack: 2 + M[ab] });
    }
    return { class: cls, subclass: { cleric: 'Life Domain', sorcerer: 'Draconic Bloodline (red, fire)', warlock: 'The Fiend' }[cls] ?? null,
      scores: sc, mods: M, prof: 2, saves, skills: taken, style, fighting_style: fs, hp, hit_die: `1d${hd}`, ac, speed, init: d,
      passive_perception: 10 + wi + (taken.includes('perception') ? 2 : 0), spells };
  }
  const api = { build, tables: T };
  if (typeof module !== 'undefined') module.exports = api; else root.Teacher = api;
})(this);
