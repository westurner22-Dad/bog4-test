// engine.js: pure rules for Balls or Gapes IV (no DOM). Browser: window.Engine; Node: require().
// Content comes only from Designer's data (builder/races/store/batches). Teacher's stat math is TBD -> PLACEHOLDER below.
(function (root) {
  const CLASSES = ['artificer','barbarian','bard','cleric','druid','fighter','monk','paladin','ranger','rogue','sorcerer','warlock','wizard'];
  const HIT_DIE = { artificer:8, barbarian:12, bard:8, cleric:8, druid:8, fighter:10, monk:8, paladin:10, ranger:10, rogue:8, sorcerer:6, warlock:8, wizard:6, derp:4 };
  const SAVES = { artificer:['con','int'], barbarian:['str','con'], bard:['dex','cha'], cleric:['wis','cha'], druid:['int','wis'], fighter:['str','con'],
    monk:['str','dex'], paladin:['wis','cha'], ranger:['str','dex'], rogue:['dex','int'], sorcerer:['con','cha'], warlock:['wis','cha'], wizard:['int','wis'], derp:[] };
  const SKILL_STAT = { athletics:'str', acrobatics:'dex', sleight_of_hand:'dex', stealth:'dex', arcana:'int', history:'int', investigation:'int',
    nature:'int', religion:'int', animal_handling:'wis', insight:'wis', medicine:'wis', perception:'wis', survival:'wis',
    deception:'cha', intimidation:'cha', performance:'cha', persuasion:'cha' };
  const AB = ['str','dex','con','int','wis','cha'];
  const mod = s => Math.floor((s - 10) / 2);
  const clone = o => JSON.parse(JSON.stringify(o));
  const d20 = rng => 1 + Math.floor(rng() * 20);

  const Tch = typeof module !== 'undefined' ? require('./teacher.js') : root.Teacher;
  // spec: 10 wins +5, 9 +4, 8 +3, 7 +2, 6 +1, 2-5 0, 1 -1, 0 = Derp
  const winBonus = w => w >= 6 ? w - 5 : w >= 2 ? 0 : w === 1 ? -1 : null;

  // ---- builder ----
  // DC: config.threshold (if set) overrides; else the option's opposition_dc; else builder.threshold; else 13.
  const builderDc = (builder, opt, cfg = {}) => cfg.threshold ?? (opt && opt.opposition_dc) ?? builder.threshold ?? 13;
  function builderRoll(builder, opt, rng = Math.random, cfg = {}) { const die = d20(rng), dc = builderDc(builder, opt, cfg); return { die, dc, ok: die >= dc }; }
  // Scenario order follows `start` + `next` (last one points at "tavern_hook").
  function scenarioOrder(builder) { const byId = Object.fromEntries(builder.scenarios.map(s => [s.id, s])), out = [];
    let id = builder.start ?? builder.scenarios[0].id; while (byId[id] && out.length < 50) { out.push(byId[id]); id = byId[id].next; } return { list: out, end: id }; }
  function tally(builder, picks) {
    const all = builder.scenarios.flatMap(s => s.options), opts = picks.map(id => all.find(o => o.id === id));
    const counts = {}; opts.forEach(o => (o.classes || [o.class]).forEach(c => { counts[c] = (counts[c] || 0) + 1; }));
    const top = Math.max(...Object.values(counts)); const tied = Object.keys(counts).filter(c => counts[c] === top).sort();
    return { opts, counts, tied };
  }
  // free points. 10=5, 9=4, 8=3, 7=2, 6=1, 2-5=0. 1 win = -1 to every stat (no allocation). 0 wins = Derp.
  const freePoints = w => w >= 6 ? Math.min(5, w - 5) : 0;
  const CAP = 20;
  // alloc {stat: n>=0}. Valid if it spends exactly the points, or fewer only when every stat still un-capped... is capped.
  function allocCheck(base, alloc, points) {
    alloc = alloc || {}; let used = 0;
    for (const s of AB) { const n = alloc[s] || 0; if (!Number.isInteger(n) || n < 0) return { ok: false, why: 'bad amount' }; if (base[s] + n > CAP) return { ok: false, why: s + ' over 20' }; used += n; }
    for (const s of Object.keys(alloc)) if (!AB.includes(s)) return { ok: false, why: 'unknown stat ' + s };
    if (used > points) return { ok: false, why: 'too many points' };
    const left = points - used, allCapped = AB.every(s => base[s] + (alloc[s] || 0) >= CAP);
    return { ok: left === 0 || allCapped, left, why: left && !allCapped ? left + ' point(s) left' : null };
  }
  // For the allocation screen: Teacher base scores (race applied, no points yet) + points to spend.
  function baseFor({ builder, races, raceId, picks, rolls, tieChoice, cfg = {} }) {
    const wins = rolls.filter(r => r.ok).length, { opts } = tally(builder, picks), race = races.races.find(r => r.id === raceId) || races.races[0];
    const t = Tch.build(race.id, opts, wins, race.skills || [], tieChoice, { points: true, primarySwap: cfg.primarySwap !== false });
    return { base: t.scores, points: freePoints(wins), cls: t.class };
  }
  // Level-1 sheet from Teacher's build() (exact port, points mode). cfg.primarySwap. alloc = the player's free points.
  function buildSheet({ builder, races, store, p, name, raceId, isWes, picks, rolls, tieChoice, alloc = null, cfg = {} }) {
    const wins = rolls.filter(r => r.ok).length;
    const { opts, tied } = tally(builder, picks);
    if (wins > 0 && tied.length > 1 && !tied.includes(tieChoice)) throw new Error('tie: choose one of ' + tied.join(','));
    const race = races.races.find(r => r.id === raceId) || races.races[0];
    const T = a => Tch.build(race.id, opts, wins, race.skills || [], tieChoice, { points: true, alloc: a, primarySwap: cfg.primarySwap !== false });
    const points = freePoints(wins), base = T(null).scores;
    if (points > 0) { const c = allocCheck(base, alloc, points); if (!c.ok) throw new Error('allocation: ' + c.why); } else alloc = null;
    const t = T(alloc);   // everything (HP, AC, saves, skills, spells) recomputed by Teacher from the final stats
    const derp = t.class === 'derp', cls = t.class, hd = derp ? 4 : +t.hit_die.slice(2);
    const sheet = { p, name, race: race.id, race_name: race.name, is_wes: !!isWes, class: cls, subclass: t.subclass || null, derp, level: 1, xp: 0,
      builder: { picks, rolls: rolls.map(r => r.die), wins, free_points: points, alloc: alloc || {}, base_scores: base, win_penalty: wins === 1 ? -1 : 0, tie_choice: tied.length > 1 ? cls : null },
      abilities: t.scores, proficiency_bonus: derp ? 0 : 2, ac: t.ac, hp: { max: Math.max(1, t.hp), current: Math.max(1, t.hp), temp: 0 },
      hit_dice: { die: 'd' + hd, total: 1, left: 1 }, speed: derp ? (race.speed || 30) : t.speed,
      saves: Object.fromEntries((t.saves || []).map(s => [s, true])), skills: t.skills || [],
      style: t.style || '', fighting_style: t.fighting_style || null, features: [], attacks: [],
      spells: t.spells ? { ...t.spells, slots_left: t.spells.slots } : null,
      equipment: [], coin: { gp: store.starting_gp || 0, sp: 0, cp: 0 },
      background: { base: race.background || '', extra_line: (!isWes && race.applies_to === 'all_except_wes') ? (race.extra_line || null) : null, additions: [] },
      personality: '', portrait: { status: 'pending' }, dead: false, deaths: 0 };
    const tr = (store.starting_treasure || {})[isWes ? 'wes' : 'others'];
    if (tr) addItem(sheet, tr, 1);
    return sheet;
  }
  function addItem(sheet, item, qty = 1) {
    const e = sheet.equipment.find(x => x.id === item.id);
    if (e) e.qty += qty; else sheet.equipment.push({ id: item.id, name: item.name, qty, equipped: false });
    if (item.type === 'weapon' && item.damage && !sheet.attacks.some(a => a.id === item.id)) {
      // Teacher section 4: STR, or DEX for finesse/ranged, +2 proficiency (+0 for Derp), plus the item's own to_hit
      const props = item.properties || [], dexy = props.includes('finesse') || props.includes('ammunition') || props.includes('ranged');
      const ab = dexy ? Math.max(mod(sheet.abilities.dex), props.includes('finesse') ? mod(sheet.abilities.str) : -99) : mod(sheet.abilities.str);
      sheet.attacks.push({ id: item.id, name: item.name, to_hit: ab + sheet.proficiency_bonus + (+item.to_hit || 0), damage: item.damage });
    }
  }
  const derived = sh => ({
    mods: Object.fromEntries(AB.map(a => [a, mod(sh.abilities[a])])), initiative: mod(sh.abilities.dex),
    saves: Object.fromEntries(AB.map(a => [a, mod(sh.abilities[a]) + (sh.saves[a] ? sh.proficiency_bonus : 0)])),
    skills: Object.fromEntries(Object.keys(SKILL_STAT).map(k => [k, mod(sh.abilities[SKILL_STAT[k]]) + (sh.skills.includes(k) ? sh.proficiency_bonus : 0)])) });
  function modFor(sh, skill) {
    if (skill === 'attack') return sh.attacks.length ? Math.max(...sh.attacks.map(a => a.to_hit)) : mod(sh.abilities.str) + sh.proficiency_bonus;
    const d = derived(sh), k = String(skill || '').replace(/ /g, '_'); return d.skills[k] ?? d.mods[k] ?? 0;
  }
  const toCp = c => Math.round((c.gp || 0) * 100 + (c.sp || 0) * 10 + (c.cp || 0));
  const fromCp = n => ({ gp: Math.floor(n / 100), sp: Math.floor(n % 100 / 10), cp: n % 10 });
  // Store dropdown (Wes): every item lands in exactly one of apparel | weapons | adventure_gear | misc.
  const SHOP_CAT_BY_TYPE = { armor: 'apparel', shield: 'apparel', clothing: 'apparel', weapon: 'weapons', gear: 'adventure_gear', kit: 'adventure_gear', food: 'adventure_gear' };
  const SHOP_CATS = ['apparel', 'weapons', 'adventure_gear', 'misc'];
  const shopCategory = it => SHOP_CATS.includes(it && it.shop_category) ? it.shop_category : (SHOP_CAT_BY_TYPE[it && it.type] || 'misc');
  const buyable = it => it && it.available !== false && it.price_gp != null && it.stock !== 0;
  function buy(doc0, p, item, qty = 1) {
    if (!buyable(item)) throw new Error('sold out');
    if (!canShop(doc0.players[p])) throw new Error('the store is in town');
    const doc = clone(doc0), sh = doc.players[p].sheet, cost = Math.round(item.price_gp * 100) * qty, have = toCp(sh.coin);
    if (cost > have) throw new Error('not enough coin');
    sh.coin = fromCp(have - cost); addItem(sh, item, qty);
    logEvent(doc, { ts: Date.now(), p: +p, kind: 'buy', text: `bought ${item.name}${qty > 1 ? ' ×' + qty : ''}`, delta: { [p]: { cp: -cost, gained: [qty > 1 ? `${item.name} ×${qty}` : item.name] } } }); return doc;
  }

  // ---- level 2 (milestone; standard 5e 2014 level-2 features). Spell picks for new half-casters wait on Teacher.
  const L2 = { artificer: ['Infuse Item'], barbarian: ['Reckless Attack', 'Danger Sense'], bard: ['Jack of All Trades', 'Song of Rest (d6)'],
    cleric: ['Channel Divinity (1/rest): Turn Undead, Preserve Life'], druid: ['Wild Shape', 'Druid Circle'], fighter: ['Action Surge (one use)'],
    monk: ['Ki (2 points)', 'Unarmored Movement (+10 ft)'], paladin: ['Fighting Style', 'Spellcasting', 'Divine Smite'], ranger: ['Fighting Style', 'Spellcasting'],
    rogue: ['Cunning Action'], sorcerer: ['Font of Magic (2 sorcery points)'], warlock: ['Eldritch Invocations (2)'], wizard: ['Arcane Recovery', 'Arcane Tradition'] };
  const L2_SLOTS = { artificer: 2, bard: 3, cleric: 3, druid: 3, sorcerer: 3, wizard: 3, warlock: 2, paladin: 2, ranger: 2 };
  function levelUp(sh) {
    if (sh.level >= 2) return;
    sh.level = 2; if (sh.derp) return;   // Derp stays Derp: level number only
    const hd = +sh.hit_dice.die.slice(1), gain = Math.max(1, Math.floor(hd / 2) + 1 + mod(sh.abilities.con) + (sh.race === 'dwarf_hill' ? 1 : 0));
    sh.hp.max += gain; sh.hp.current += gain; sh.hit_dice.total = 2; sh.hit_dice.left = 2;
    sh.features = (sh.features || []).concat(L2[sh.class] || []);
    if (L2_SLOTS[sh.class]) { sh.spells = sh.spells || { cantrips: [], level1: [], slots: 0, todo: 'Teacher: level-2 spell picks' }; sh.spells.slots = L2_SLOTS[sh.class]; sh.spells.slots_left = L2_SLOTS[sh.class]; }
  }

  // ---- batches ----
  function validateBatch(b) {
    const e = []; if (!b || !/^b\d+$/.test(b.batch_id || '')) return ['batch: bad batch_id'];
    (b.turns || []).forEach((t, i) => {
      const w = `${b.batch_id} turn ${t.turn_id || '#' + i}`;
      if (!/^b\d+-p\d+-t\d+$/.test(t.turn_id || '')) e.push(w + ': bad turn_id');
      if (!t.turn_id || !t.turn_id.startsWith(b.batch_id + '-')) e.push(w + ': turn_id must start with batch_id');
      if (!Array.isArray(t.options) || !t.options.length) e.push(w + ': no options');
      (t.options || []).forEach((o, j) => { if (!o.label || !o.success) e.push(`${w} option ${j}: needs label+success`);
        if (o.roll && (o.roll.skill == null || o.roll.dc == null)) e.push(`${w} option ${j}: roll needs skill+dc`); });
    });
    return e;
  }
  // seats: a static template batch (game_id '*', seat-1 turns only, e.g. design/batch1.json) is copied for every other seat
  // as b<N>-p<seat>-t<K>, so a second player has turns before the nightly GM writes seat-specific ones.
  const reseat = (t, s) => { const r = x => typeof x === 'string' ? x.replace(/-p1-/, `-p${s}-`) : x, c = clone(t); c.p = s; c.turn_id = r(c.turn_id);
    (c.options || []).forEach(o => ['success', 'fail'].forEach(k => { if (o[k] && o[k].goto) o[k].goto = r(o[k].goto); })); return c; };
  function mergeBatches(batches, seats = []) {
    const problems = [], seen = new Set(), queues = {};
    [...batches].sort((a, b) => (a.night || 0) - (b.night || 0)).forEach(b => {
      const bad = validateBatch(b); if (bad.length && bad[0].startsWith('batch:')) { problems.push(...bad); return; }
      const tpl = b.game_id === '*' && (b.turns || []).every(t => +t.p === 1);
      const turns = tpl ? [...b.turns, ...seats.map(Number).filter(s => s > 1).flatMap(s => b.turns.map(t => reseat(t, s)))] : (b.turns || []);
      turns.forEach(t => {
        if (validateBatch({ batch_id: b.batch_id, turns: [t] }).length) { problems.push('skipped ' + t.turn_id); return; }
        if (seen.has(t.turn_id)) { problems.push('duplicate ' + t.turn_id + ' ignored'); return; }
        seen.add(t.turn_id); (queues[t.p] = queues[t.p] || []).push({ ...t, night: b.night });
      });
    });
    Object.values(queues).forEach(q => q.sort((a, b) => a.night - b.night || a.seq - b.seq));
    return { queues, problems };
  }
  const truthy = v => typeof v === 'number' ? v > 0 : !!v;
  const flagOf = (doc, p, f) => { const pf = (doc.players[p].flags || {}); return f in pf ? pf[f] : (doc.world.flags || {})[f]; };
  // Next playable turn. cursor = explicit next turn id (a goto, or the next seq). A cursor naming a turn that isn't
  // loaded yet = "wait for the nightly batch" (returns null) until a batch containing it arrives.
  function currentTurn(doc, queues, p) {
    const q = queues[p] || [], pl = doc.players[p], played = new Set((pl.history || []).map(h => h.turn_id));
    let i;
    if (pl.cursor) { i = q.findIndex(t => t.turn_id === pl.cursor); if (i < 0) return null; }
    else { const last = (pl.history || []).at(-1); i = last ? q.findIndex(t => t.turn_id === last.turn_id) + 1 : 0; if (last && i === 0) i = q.findIndex(t => !played.has(t.turn_id)); if (i < 0) return null; }
    for (; i < q.length; i++) {
      const t = q[i]; if (played.has(t.turn_id)) continue;
      if (t.requires && !truthy(flagOf(doc, p, t.requires.flag))) continue;
      return t;
    }
    return null;
  }
  const TOWN = ['town', 'tavern', 'store'];
  // Designer may add builder.respawn_lines (array); app sets cfg.respawnLines from data. Fallback = Studio Lead's example line.
  const RESPAWN_FALLBACK = "You died in a tavern. Impressive. You're back.";
  const cfg = { respawnLines: null, rng: Math.random };
  const respawnLine = () => { const L = cfg.respawnLines; return Array.isArray(L) && L.length ? L[Math.floor(cfg.rng() * L.length)] : RESPAWN_FALLBACK; };
  const isGhost = (doc, p) => !!(doc.players[p] && doc.players[p].sheet && doc.players[p].sheet.dead);
  function applyEffects(doc, p, effects) {
    const pl = doc.players[p];
    for (const f of effects || []) {
      const who = f.target === 'party' ? Object.keys(doc.players).filter(k => doc.players[k].sheet) : [p];
      for (const q of who) { const P2 = doc.players[q], sh = P2.sheet;
        if (f.type === 'flag') { const tgt = f.scope === 'world' ? doc.world.flags : (P2.flags = P2.flags || {});
          tgt[f.key] = typeof f.value === 'number' ? (+tgt[f.key] || 0) + f.value : f.value; }
        else if (f.type === 'hp') { if (sh.dead) continue; sh.hp.current = Math.min(sh.hp.max, Math.max(0, sh.hp.current + f.delta)); if (sh.hp.current === 0) { sh.deaths++;
            if (TOWN.includes(P2.location)) {   // Studio Lead round 4 (a): dying in town = instant respawn, full HP, gear kept
              sh.hp.current = sh.hp.max; P2.respawned = (P2.respawned || 0) + 1; P2.respawn_line = respawnLine(); }
            else sh.dead = true; } }
        else if (f.type === 'coin') sh.coin = fromCp(Math.max(0, toCp(sh.coin) + toCp(f)));
        else if (f.type === 'item_add') addItem(sh, f.item, f.qty || f.item.qty || 1);
        else if (f.type === 'item_remove') { const e = sh.equipment.find(x => x.id === f.id); if (e) { e.qty -= f.qty || 1; if (e.qty <= 0) sh.equipment.splice(sh.equipment.indexOf(e), 1); } }
        else if (f.type === 'xp') sh.xp += f.amount || 0;
        else if (f.type === 'level_up') levelUp(sh);
        else if (f.type === 'respawn') { sh.dead = false; sh.hp.current = sh.hp.max; }
        else if (f.type === 'location') { P2.location = f.value; }
      }
      if (f.type === 'location' && TOWN.includes(f.value)) respawnAll(doc);   // Studio Lead: the moment the party enters town
      if (f.type === 'flag' && f.key === 'dungeon_cleared' && truthy(f.value)) Object.values(doc.players).forEach(x => x.sheet && levelUp(x.sheet));
    }
  }
  // Dead characters reappear with full HP, gear kept, as soon as the party is in town.
  function respawnAll(doc) { Object.values(doc.players).forEach(x => { if (x.sheet && x.sheet.dead) { x.sheet.dead = false; x.sheet.hp.current = x.sheet.hp.max; x.respawned = (x.respawned || 0) + 1; } }); }
  // Resolve option i of p's current turn with a live random roll. Derp: the shown option is ignored, a random real one resolves,
  // and the result text starts with a random derp_prefix (builder.derp.derp_prefixes). Returns new doc.
  // ---- v4 Adventure Log: snapshot -> delta (hp, coin, items, xp, location, death/respawn) for every seat ----
  const snap = doc => Object.fromEntries(Object.entries(doc.players || {}).filter(([, x]) => x && x.sheet).map(([k, x]) => [k, { hp: x.sheet.hp.current, cp: toCp(x.sheet.coin), xp: x.sheet.xp || 0, loc: x.location || 'town', dead: !!x.sheet.dead, deaths: x.sheet.deaths || 0, rsp: x.respawned || 0,
    items: Object.fromEntries((x.sheet.equipment || []).map(e => [e.name || e.id, e.qty || 1])) }]));
  function deltaOf(a, b) {
    const out = {};
    for (const [k, y] of Object.entries(b)) { const x = a[k]; if (!x) continue; const d = {};
      if (y.hp !== x.hp) d.hp = y.hp - x.hp; if (y.cp !== x.cp) d.cp = y.cp - x.cp; if (y.xp !== x.xp) d.xp = y.xp - x.xp;
      if (y.loc !== x.loc) d.loc = [x.loc, y.loc]; if (y.deaths > x.deaths || (y.dead && !x.dead)) d.died = true; if (y.rsp > x.rsp || (!y.dead && x.dead)) d.respawned = true;
      const gain = [], lost = []; for (const n of new Set([...Object.keys(x.items), ...Object.keys(y.items)])) { const q = (y.items[n] || 0) - (x.items[n] || 0); if (q > 0) gain.push(q > 1 ? `${n} ×${q}` : n); if (q < 0) lost.push(-q > 1 ? `${n} ×${-q}` : n); }
      if (gain.length) d.gained = gain; if (lost.length) d.lost = lost; if (Object.keys(d).length) out[k] = d; }
    return out;
  }
  // Non-turn events (purchases, GM rulings with effects, respawns) go to doc.events (append-only, capped).
  function logEvent(doc, ev) { doc.events = arr(doc.events); doc.events.push(ev); if (doc.events.length > 400) doc.events = doc.events.slice(-400); }
  const arr = x => Array.isArray(x) ? x.filter(v => v != null) : x && typeof x === 'object' ? Object.values(x) : [];
  function playTurn(doc0, queues, p, i, rng = Math.random, derpCfg = null, now = Date.now()) {
    const doc = clone(doc0), pl = doc.players[p], t = currentTurn(doc, queues, p);
    if (!t) throw new Error('no turn');
    if (stageOf(pl) !== 'tavern') throw new Error('visit the store first');
    if (isGhost(doc, p)) throw new Error('ghost: wait until the party enters town');   // Studio Lead round 3
    let prefix = '';
    if (pl.sheet.derp) { i = Math.floor(rng() * t.options.length); const px = (derpCfg && derpCfg.derp_prefixes) || []; if (px.length) prefix = px[Math.floor(rng() * px.length)] + ' '; }
    const o = t.options[i]; if (!o) throw new Error('bad option');
    let ok = true, entry = { turn_id: t.turn_id, option: i, ts: now, title: t.title || '', label: o.label || '' }; const before = snap(doc);
    if (o.roll) { const die = d20(rng), m = modFor(pl.sheet, o.roll.skill), total = die + m; ok = total >= o.roll.dc;
      Object.assign(entry, { die, mod: m, total, dc: o.roll.dc, skill: o.roll.skill }); }
    entry.ok = ok; const br = ok ? o.success : (o.fail || o.success); entry.text = prefix + (br.text || ''); if (prefix) entry.derp = true;
    delete pl.respawn_line; applyEffects(doc, p, br.effects);
    if (pl.respawn_line) { entry.respawn_line = pl.respawn_line; entry.text += (entry.text ? ' ' : '') + pl.respawn_line; delete pl.respawn_line; }
    const dl = deltaOf(before, snap(doc)); if (Object.keys(dl).length) entry.delta = dl;
    (pl.history = pl.history || []).push(entry);
    const q = queues[p], idx = q.findIndex(x => x.turn_id === t.turn_id);
    pl.cursor = br.goto || (q[idx + 1] || {}).turn_id || null;
    return doc;
  }
  // ---- stages (Wes round 7): build -> store -> tavern. Build and store are async per player; the store must be visited first.
  const stageOf = pl => !pl || !pl.sheet ? 'build' : (pl.stage || 'tavern')   // no stage = pre-round-7 doc; normalize() migrates those;
  function leaveStore(doc0, p, now = Date.now()) {
    const doc = clone(doc0), pl = doc.players[p];
    if (stageOf(pl) !== 'store') throw new Error('not in the store');
    pl.stage = 'tavern'; pl.location = 'tavern'; pl.ready_at = now; return doc;
  }
  // Shopping is allowed whenever the player is in town (town/store/tavern), regardless of whose turn it is.
  const canShop = pl => !!(pl && pl.sheet) && TOWN.includes(pl.location || 'town');
  // ---- party turns (Wes round 7) ----
  // Before the tavern everything is async. In the tavern and after, ready players (stage tavern) take turns in seat order.
  // Play starts only when every seat that has been opened is ready in the tavern (Wes round 2 #1: the quest never starts
  // until ALL adventurers are present). Players cannot start without the others; only the GM can, via a 'party_start'
  // ruling (gm_write --start-party <gid> [--drop-seat N]), which starts the party and optionally drops absent seats.
  // Late joiners slot into the rotation once they leave the store. A holder who can't act (ghost, no turn loaded, dropped)
  // is skipped automatically; a holder idle for turnTimeoutMs can be skipped by anyone who can act. See test/unit + party_sim.
  const PARTY = { turnTimeoutMs: 24 * 3600e3 };
  const seatsOf = doc => Object.keys(doc.players || {}).map(Number).filter(q => !doc.players[q].dropped).sort((a, b) => a - b);
  function turnInfo(doc, queues, p, now = Date.now()) {
    const pl = doc.players[p], st = stageOf(pl), party = doc.party || {};
    if (st !== 'tavern') return { state: st };
    if (pl.dropped) return { state: 'free', holder: p, dropped: true };
    const seats = seatsOf(doc), ready = seats.filter(q => stageOf(doc.players[q]) === 'tavern');
    const canAct = q => !isGhost(doc, q) && !!currentTurn(doc, queues, q);
    if (!party.started_at) {
      const pending = seats.filter(q => !ready.includes(q));
      if (pending.length) return { state: 'waiting', waitingFor: pending };
      if (ready.length === 1) return { state: 'lobby' };
    }
    if (!canAct(p)) return { state: 'free', holder: p };   // ghost / GM asleep screens; never blocks anyone
    const ord = ready, start = ord.includes(party.turn) ? ord.indexOf(party.turn) : 0;
    let holder = null; for (let k = 0; k < ord.length; k++) { const q = ord[(start + k) % ord.length]; if (canAct(q)) { holder = q; break; } }
    if (holder === p) return { state: 'yours', holder };
    return { state: 'theirs', holder, canSkip: now - (party.last_move_at || party.started_at || Math.max(0, ...ready.map(q => doc.players[q].ready_at || 0))) >= PARTY.turnTimeoutMs };
  }
  // GM-only start (applied from a 'party_start' ruling). drop = seats to remove from the turn order (absent players).
  function gmStartParty(doc0, ru, now = Date.now()) {
    const doc = clone(doc0);
    for (const q of ru.drop || []) if (doc.players[q]) doc.players[q].dropped = true;
    for (const q of ru.add || []) if (doc.players[q]) delete doc.players[q].dropped;
    if (!(doc.party && doc.party.started_at)) doc.party = Object.assign({}, doc.party, { started_at: ru.ruled_at || now, turn: null, last_move_at: ru.ruled_at || now, started_by: 'gm' });
    return doc;
  }
  function takeTurn(doc0, queues, p, i, rng = Math.random, derpCfg = null, now = Date.now()) {
    const info = turnInfo(doc0, queues, p, now);
    if (!(info.state === 'yours' || (info.state === 'theirs' && info.canSkip))) throw new Error(info.state === 'theirs' ? 'not your turn' : 'waiting for the party');
    const doc = playTurn(doc0, queues, p, i, rng, derpCfg, now), ord = seatsOf(doc).filter(q => stageOf(doc.players[q]) === 'tavern');
    doc.party = Object.assign({}, doc.party, { started_at: (doc.party && doc.party.started_at) || now, last_move_at: now,
      turn: ord[(ord.indexOf(p) + 1) % ord.length], last_p: p }); return doc;
  }
  const label = (sh, o, derpCfg) => sh && sh.derp ? ((derpCfg && derpCfg.label) || 'derp') : o.label;

  function newGame(seats = 1, wesHash = null) {
    const players = {}; for (let p = 1; p <= seats; p++) players[p] = { sheet: null, flags: {}, history: [], cursor: null, location: 'town' };
    return { game: 'bog4', seats, players, world: { flags: {} }, applied_rulings: {}, request_rolls: {}, wes_hash: wesHash };
  }
  // Public log: requests joined with rulings and any live player roll, newest first.
  // GM-initiated rulings (no request): {gm:true, p, who, text, ruling:'granted', effects, ruled_at}. They show in the public log as GM rulings.
  const requestLog = (reqs, rulings, rolls = {}) => [
    ...Object.entries(reqs || {}).map(([id, r]) => ({ id, ...r, ruling: (rulings || {})[id] || null, roll: rolls[id] || null })),
    ...Object.entries(rulings || {}).filter(([id, ru]) => ru && ru.gm && !(reqs || {})[id]).map(([id, ru]) => ({ id, p: ru.p, who: ru.who || 'GM', text: ru.text || '', ts: ru.ruled_at || 0, gm: true, ruling: ru, roll: null }))
  ].sort((a, b) => b.ts - a.ts);
  // Nightly GM routine (Studio Lead round 5): every solo game whose only player is a ghost outside town gets a tavern move, once per night.
  const freeGhostId = (night, p) => `gm-free-${night}-p${p}`;
  function freeSoloGhosts(games, rulings, night, now = Date.now()) {
    const out = {};
    for (const [gid, doc] of Object.entries(games || {})) {
      // Round 7: also any party where EVERY seated player is a ghost outside town (nobody left to walk them back).
      const seated = Object.entries((doc && doc.players) || {}).filter(([, x]) => x && x.sheet);
      const ghostOut = ([, pl]) => (pl.sheet.dead || pl.sheet.hp.current <= 0) && !TOWN.includes(pl.location);
      if (!seated.length || !seated.every(ghostOut)) continue;
      for (const [p] of seated) {
        const id = freeGhostId(night, p);
        if (((rulings || {})[gid] || {})[id] || (doc.applied_rulings || {})[id]) continue;   // idempotent per night + player
        (out[gid] = out[gid] || {})[id] = { gm: true, p: +p, who: 'GM', text: 'Nightly ghost pickup', ruling: 'granted', size: 'small', dc: null, roll: null,
          reason: seated.length === 1 ? 'Solo ghost: the GM brings you back to the tavern.' : 'The whole party fell: the GM brings everyone back to the tavern.', effects: [{ type: 'location', value: 'tavern' }], ruled_at: now }; }
    }
    return out;
  }
  // granted -> effects now. roll -> waits until the requester rolls live (rollRequest). denied -> nothing.
  function applyRulings(doc0, reqs, rulings) {
    const doc = clone(doc0);
    for (const [id, ru] of Object.entries(rulings || {})) {
      const rq = (reqs || {})[id] || (ru && ru.gm && Number.isInteger(ru.p) ? { p: ru.p } : null);
      if (doc.applied_rulings[id] || !rq) continue;
      if (ru.ruling === 'roll') continue;
      if (ru.ruling === 'party_start') { if (ru.gm) Object.assign(doc, gmStartParty(doc, ru)); doc.applied_rulings[id] = true; continue; }
      const pl = doc.players[rq.p];
      if (ru.ruling === 'granted' && pl && pl.sheet) { const b0 = snap(doc); applyEffects(doc, rq.p, ru.effects); const dl = deltaOf(b0, snap(doc));
        if (Object.keys(dl).length) logEvent(doc, { ts: ru.ruled_at || Date.now(), p: rq.p, kind: 'ruling', ruling_id: id, text: ru.reason || 'GM ruling', delta: dl }); }
      doc.applied_rulings[id] = true;
    }
    return doc;
  }
  // The requesting player rolls live: d20 (+ ruling.skill modifier if the GM named one) vs the GM's DC.
  function rollRequest(doc0, reqs, rulings, id, p, rng = Math.random) {
    const doc = clone(doc0), r = reqs[id], ru = rulings[id];
    if (!r || !ru || ru.ruling !== 'roll' || r.p !== p || doc.applied_rulings[id]) throw new Error('nothing to roll');
    const die = d20(rng), m = ru.skill ? modFor(doc.players[p].sheet, ru.skill) : 0, total = die + m, ok = total >= ru.dc;
    const b0 = snap(doc); if (ok) applyEffects(doc, p, ru.effects);
    doc.request_rolls[id] = { die, mod: m, total, dc: ru.dc, ok, ts: Date.now() }; const dl = deltaOf(b0, snap(doc)); if (Object.keys(dl).length) doc.request_rolls[id].delta = dl;
    doc.applied_rulings[id] = true; return doc;
  }

  // ---- v4 Adventure Log ----
  // One chronological list per game, derived from data every seat can already read: players[].history (turns: choice,
  // roll, result, delta), doc.events (purchases, GM effects), chat (speech, 🎭 actions, 💬 dialogue), requests + rulings
  // + request_rolls, builder rolls. Old history entries (before v4) have no ts/delta: their effects are re-derived from
  // the batch option, and they sort before timestamped entries in seat/turn order.
  const fmtCp = cp => { const a = Math.abs(cp), g = Math.floor(a / 100), sp = Math.floor(a % 100 / 10), c = a % 10; return (cp < 0 ? '−' : '+') + [g && g + ' gp', sp && sp + ' sp', c && c + ' cp'].filter(Boolean).join(' '); };
  function describeDelta(d, nameOf) {
    const out = [];
    for (const [k, x] of Object.entries(d || {})) { if (!x) continue; const bits = [];
      if (x.hp) bits.push(`${x.hp > 0 ? '+' : '−'}${Math.abs(x.hp)} HP`); if (x.cp) bits.push(fmtCp(x.cp)); if (x.xp) bits.push(`+${x.xp} XP`);
      if (x.gained) bits.push('gained ' + x.gained.join(', ')); if (x.lost) bits.push('lost ' + x.lost.join(', '));
      if (x.loc) bits.push(`moved to the ${x.loc[1]}`); if (x.died) bits.push('💀 fell and became a ghost'); if (x.respawned) bits.push('✨ respawned');
      if (bits.length) out.push((Object.keys(d).length > 1 ? nameOf(k) + ': ' : '') + bits.join(', ')); }
    return out.join('; ');
  }
  function describeEffects(effects, sh) {
    const bits = [];
    for (const f of effects || []) {
      if (f.type === 'hp' && f.delta) bits.push(`${f.delta > 0 ? '+' : '−'}${Math.abs(f.delta)} HP${f.target === 'party' ? ' (party)' : ''}`);
      else if (f.type === 'coin') { const cp = toCp(f); if (cp) bits.push(fmtCp(cp)); }
      else if (f.type === 'xp' && f.amount) bits.push(`+${f.amount} XP`);
      else if (f.type === 'item_add' && f.item) bits.push('gained ' + (f.item.name || f.item.id));
      else if (f.type === 'item_remove') bits.push('lost ' + f.id);
      else if (f.type === 'location' && f.value) bits.push(`moved to the ${f.value}`);
      else if (f.type === 'respawn') bits.push('✨ respawned'); }
    return [...new Set(bits)].join(', ');
  }
  function adventureLog(doc, queues = {}, chat = [], reqs = {}, rulings = {}, rolls = null) {
    const out = [], players = doc.players || {}, nameOf = k => { const x = players[k]; return x && x.sheet ? x.sheet.name : 'Player ' + k; };
    rolls = rolls || doc.request_rolls || {};
    const turnOf = id => { for (const q of Object.values(queues || {})) { const t = (q || []).find(x => x.turn_id === id); if (t) return t; } return null; };
    for (const [k, x] of Object.entries(players)) {
      if (!x || !x.sheet) continue; const sh = x.sheet, br = arr((sh.builder || {}).rolls);
      if (br.length) out.push({ ts: 0, ord: [0, +k, 0], p: +k, kind: 'build', text: `${sh.name} the ${sh.class} joins the party`, detail: `builder rolls: ${br.filter(r => r && r.ok).length}/${br.length} won (${br.map(r => r ? r.die : '?').join(', ')})` });
      arr(x.history).forEach((h, i) => {
        const t = turnOf(h.turn_id), o = t && t.options[h.option], d = h.delta ? describeDelta(h.delta, nameOf) : o ? describeEffects((h.ok === false && o.fail ? o.fail : o.success).effects, sh) : '';
        out.push({ ts: h.ts || 0, ord: [1, i, +k], p: +k, kind: 'turn', title: h.title || (t && t.title) || h.turn_id, choice: h.label || (o && o.label) || '', roll: h.die ? { skill: h.skill || (o && o.roll && o.roll.skill) || '', die: h.die, mod: h.mod, total: h.total, dc: h.dc, ok: h.ok } : null, text: h.text || '', detail: d, died: !!(h.delta && Object.values(h.delta).some(z => z && z.died)) }); }); }
    for (const e of arr(doc.events)) out.push({ ts: e.ts || 0, ord: [2, 0, e.p || 0], p: e.p, kind: e.kind, text: e.text, detail: describeDelta(e.delta, nameOf) });
    for (const m of chat || []) { const t = String(m.text || ''), kind = t.startsWith('🎭 ') ? 'action' : t.startsWith('💬 ') ? 'say' : 'chat';
      out.push({ ts: m.ts || 0, ord: [3, 0, m.p], p: m.p, kind, text: kind === 'chat' ? `“${t}”` : t.slice(2).trim(), ghost: !!m.ghost }); }
    for (const r of requestLog(reqs, rulings, rolls)) { if (r.kind) continue;   // actions/dialogue already come from chat
      const ru = r.ruling, ro = r.roll;
      out.push({ ts: r.ts || 0, ord: [4, 0, r.p || 0], p: r.p, kind: r.gm ? 'gm' : 'request', text: r.gm ? (ru && ru.reason) || r.text : `asked the GM: ${r.text}`,
        detail: !r.gm && ru ? `GM: ${ru.ruling}${ru.dc ? ' (DC ' + ru.dc + ')' : ''}${ru.reason ? ', ' + ru.reason : ''}` : '', roll: ro ? { skill: ru && ru.skill || '', die: ro.die, mod: ro.mod, total: ro.total, dc: ro.dc, ok: ro.ok } : null });
      if (ro && ro.delta) out.push({ ts: (ro.ts || r.ts || 0) + 1, ord: [4, 1, r.p], p: r.p, kind: 'ruling', text: 'request result', detail: describeDelta(ro.delta, nameOf) }); }
    const cmp = (a, b) => (a.ts - b.ts) || a.ord.reduce((z, v, i) => z || v - b.ord[i], 0);
    return out.sort(cmp).map(e => ({ ...e, who: e.p ? nameOf(e.p) : 'GM' }));
  }

  // Firebase RTDB drops empty arrays/objects and turns {1:..,2:..} into [null,..]. Restore the shape the engine expects.
  function normalize(d) {
    if (!d || typeof d !== 'object') return d;
    const toObj = x => Array.isArray(x) ? Object.fromEntries(x.map((v, i) => [String(i), v]).filter(([, v]) => v != null)) : (x || {});
    const arr = x => Array.isArray(x) ? x.filter(v => v != null) : x && typeof x === 'object' ? Object.values(x) : [];
    d.players = toObj(d.players); d.world = d.world || {}; d.world.flags = d.world.flags || {};
    d.applied_rulings = d.applied_rulings || {}; d.events = arr(d.events); d.request_rolls = d.request_rolls || {};
    if (!d.party && Object.values(d.players).some(pl => pl && arr(pl.history).length)) d.party = { started_at: 1, turn: null, last_move_at: 0, legacy: true };   // games already in play before v0.7 count as started
    for (const pl of Object.values(d.players)) {
      pl.flags = pl.flags || {}; pl.history = arr(pl.history); if (pl.cursor === undefined) pl.cursor = null; pl.location = pl.location || 'town'; if (pl.sheet && !pl.stage) pl.stage = (pl.history || []).length ? 'tavern' : 'store';
      const s = pl.sheet; if (!s) { pl.sheet = null; continue; }
      for (const k of ['equipment', 'attacks', 'features', 'skills']) s[k] = arr(s[k]);
      s.saves = s.saves || {}; s.coin = Object.assign({ gp: 0, sp: 0, cp: 0 }, s.coin); s.hp = Object.assign({ max: 1, current: 0, temp: 0 }, s.hp);
      s.background = Object.assign({ base: '', extra_line: null }, s.background); s.background.additions = arr(s.background.additions);
      s.builder = s.builder || {}; s.builder.alloc = s.builder.alloc || {}; s.builder.picks = arr(s.builder.picks); s.builder.rolls = arr(s.builder.rolls);
      s.portrait = s.portrait || { status: 'pending' }; s.dead = !!s.dead; s.deaths = s.deaths || 0; s.derp = !!s.derp; s.is_wes = !!s.is_wes;
      s.xp = s.xp || 0; s.personality = s.personality || ''; s.subclass = s.subclass || null; s.fighting_style = s.fighting_style || null;
      if (s.spells) for (const k of ['cantrips', 'level1', 'spellbook', 'prepared']) if (k in s.spells || k === 'cantrips') s.spells[k] = arr(s.spells[k]);
      if (s.spells === undefined) s.spells = null;
      s.hit_dice = s.hit_dice || { die: 'd8', total: 1, left: 1 };
    }
    return d;
  }
  const api = { adventureLog, describeDelta, deltaOf, PARTY, turnInfo, gmStartParty, takeTurn, stageOf, leaveStore, canShop, normalize, CLASSES, winBonus, freePoints, allocCheck, baseFor, CAP, builderDc, builderRoll, scenarioOrder, tally, buildSheet, derived, modFor, buyable, buy, shopCategory, SHOP_CATS, levelUp, validateBatch, mergeBatches,
    cfg, RESPAWN_FALLBACK, currentTurn, isGhost, playTurn, applyEffects, respawnAll, label, newGame, requestLog, applyRulings, rollRequest, freeSoloGhosts, freeGhostId, toCp };
  if (typeof module !== 'undefined') module.exports = api; else root.Engine = api;
})(this);
