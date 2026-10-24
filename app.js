// app.js: UI. URL: #g=<gameId>&p=<seat>[&w=<host token>].
const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const H = new URLSearchParams(location.hash.slice(1));
const rndHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const hashHex = s => Portrait.sha256(Array.from(new TextEncoder().encode(s))).map(b => b.toString(16).padStart(2, '0')).join('');
// Opening the plain address creates a game; that first link is the host's private link and carries a secret w=<token>.
// Only sha256(token) is stored (doc.wes_hash), so other seats can't fake it by adding w=1 or typing the host's name.
let NEW_WES_HASH = null;
if (!H.get('g')) { const g = rndHex(16), w = rndHex(16); NEW_WES_HASH = hashHex(w); history.replaceState(null, '', `#g=${g}&p=1&w=${w}`); H.set('g', g); H.set('p', '1'); H.set('w', w); }
const GID = H.get('g'), P = +H.get('p') || 1, W = H.get('w');
let IS_WES = false;
const C = window.GAME_CONFIG, store0 = makeStore(GID, C);
const store = Object.assign(Object.create(store0), { get: async () => Engine.normalize(await store0.get()), subscribe: cb => store0.subscribe(d => cb(Engine.normalize(d))) });
const portraitCache = {};
// respawn_lines: read from Designer data if present (builder.json or campaign data), else Engine fallback
const setRespawnLines = () => { Engine.cfg.respawnLines = (D.builder && D.builder.respawn_lines) || (D.campaign && D.campaign.respawn_lines) || null; };
let D = {}, doc = null, tab = 'turn', queues = {}, batchProblems = [], reqs = {}, rulings = {}, chat = [], bstate = null, lastResult = '', skipOk = false;
const fetchJ = f => fetch(C.dataBase + f).then(r => r.ok ? r.json() : null).catch(() => null);

async function save(next) {           // CAS write; on conflict reload and let the player retry
  const ok = await store.cas(doc ? doc.v : 0, next);
  doc = await store.get(); render(); return ok;
}
// Async actions (shopping, leaving the store, building) must not lose to another player's write: retry on CAS conflict
// against the fresh doc. fn(doc) -> next doc (may throw). Turns use save() so a stale turn is never replayed.
async function saveWith(fn, tries = 5) {
  for (let k = 0; k < tries; k++) { const cur = await store.get(); const next = fn(cur);
    if (await store.cas(cur ? cur.v : 0, next)) { doc = await store.get(); render(); return true; }
    await new Promise(r => setTimeout(r, 60 + Math.random() * 120)); }
  doc = await store.get(); render(); throw new Error('busy, try again');
}
function placeholderNote() { return Object.values(D).some(x => x && x._placeholder) ? '<p class="ph">PLACEHOLDER data: Designer files not delivered yet.</p>' : ''; }

// ---------- builder ----------
const order = () => Engine.scenarioOrder(D.builder).list;
const findOpt = id => D.builder.scenarios.flatMap(s => s.options).find(o => o.id === id);
function renderBuilder() {
  const B = D.builder;
  if (!bstate) bstate = JSON.parse(sessionStorage.getItem('bog4b:' + GID + P) || 'null') || { step: 'who', picks: [], rolls: [] };
  sessionStorage.setItem('bog4b:' + GID + P, JSON.stringify(bstate));
  if (bstate.step === 'who') return `<div class="card"><h2>Who are you?</h2>
    <label>Race<select id="race">${D.races.races.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></label>
    <label>Name<input id="name" maxlength="40" autocomplete="off" value="${esc(bstate.draft || '')}"></label><button id="go">Start in ${esc(B.homeland || '')} (barefoot)</button></div>`;
  const L = order(), i = bstate.picks.length;
  if (i < L.length) { const s = L[i];
    return `<div class="card"><h2>${i + 1}/${L.length}: ${esc(s.title || '')}</h2><p>${esc(s.text)}</p>
      ${lastResult}${s.options.map((o, j) => `<button data-b="${j}">${esc(o.text)}</button>`).join('')}</div>`; }   // class never rendered
  const t = Engine.tally(B, bstate.picks), wins = bstate.rolls.filter(r => r.ok).length;
  if (wins > 0 && t.tied.length > 1 && !bstate.tie)   // ~52% of builds: ONE tap, no paragraph
    return `<div class="card" id="tie"><h2>Pick one</h2>${t.tied.map(c => `<button data-tie="${esc(c)}">${esc(c[0].toUpperCase() + c.slice(1))}</button>`).join('')}</div>`;
  const bf = Engine.baseFor({ builder: B, races: D.races, raceId: bstate.race, picks: bstate.picks, rolls: bstate.rolls, tieChoice: bstate.tie, cfg: C });
  if (bf.points > 0 && !bstate.allocDone) {   // one-screen free-point allocation
    const al = bstate.alloc = bstate.alloc || {}, chk = Engine.allocCheck(bf.base, al, bf.points), used = Object.values(al).reduce((x, y) => x + y, 0), left = bf.points - used;
    const m = v => Math.floor((v - 10) / 2), sg = n => (n >= 0 ? '+' : '') + n;
    return `<div class="card" id="alloc"><h2>Points left: <span id="left">${left}</span></h2>${['str', 'dex', 'con', 'int', 'wis', 'cha'].map(s => { const b0 = bf.base[s], v = b0 + (al[s] || 0);
      return `<div class="arow" data-stat="${s}"><b>${s.toUpperCase()}</b><span class="val">${v}</span><span class="mod">${sg(m(v))}${v !== b0 ? ` <span class="dim">(was ${sg(m(b0))})</span>` : ''}</span>
        <button data-minus="${s}" ${al[s] ? '' : 'disabled'}>−</button><button data-plus="${s}" ${left > 0 && v < Engine.CAP ? '' : 'disabled'}>+</button></div>`; }).join('')}
      <button id="allocdone" ${chk.ok ? '' : 'disabled'}>Done</button></div>`;
  }
  const hook = B.tavern_hook || {}, h = (doc.seats || 1) === 1 ? (hook.solo || hook.group) : (hook.group || hook.solo);
  return `<div class="card">${lastResult}<p id="hook">${esc(h ? h.text : '')}</p><button id="finish">See my character</button></div>`;
}
function bindBuilder() {
  $('#name') && ($('#name').oninput = () => { bstate.draft = $('#name').value; sessionStorage.setItem('bog4b:' + GID + P, JSON.stringify(bstate)); });
  $('#race') && bstate.draftRace && ($('#race').value = bstate.draftRace); $('#race') && ($('#race').onchange = () => { bstate.draftRace = $('#race').value; });
  $('#go') && ($('#go').onclick = () => { const n = $('#name').value.trim(); if (!n) return $('#name').focus();
    Object.assign(bstate, { step: 'pick', name: n, race: $('#race').value }); render(); });
  document.querySelectorAll('[data-b]').forEach(b => b.onclick = () => {
    const s = order()[bstate.picks.length], o = s.options[+b.dataset.b], r = Engine.builderRoll(D.builder, o, Math.random, C);
    bstate.picks.push(o.id); bstate.rolls.push(r);
    const txt = r.ok ? (o.success_text || s.success_text) : (o.fail_text || s.fail_text);
    lastResult = `<p id="broll" class="${r.ok ? 'ok' : 'bad'}">🎲 ${r.die} (need ${r.dc}+): ${esc(txt)}</p>`; render(); });
  document.querySelectorAll('[data-plus]').forEach(b => b.onclick = () => { const s = b.dataset.plus; bstate.alloc[s] = (bstate.alloc[s] || 0) + 1; render(); });
  document.querySelectorAll('[data-minus]').forEach(b => b.onclick = () => { const s = b.dataset.minus; bstate.alloc[s] = Math.max(0, (bstate.alloc[s] || 0) - 1); if (!bstate.alloc[s]) delete bstate.alloc[s]; render(); });
  $('#allocdone') && ($('#allocdone').onclick = () => { bstate.allocDone = true; render(); });
  document.querySelectorAll('[data-tie]').forEach(b => b.onclick = () => { bstate.tie = b.dataset.tie; render(); });
  $('#finish') && ($('#finish').onclick = async () => {
    const sheet = Engine.buildSheet({ builder: D.builder, races: D.races, store: D.store, p: P, name: bstate.name, raceId: bstate.race,
      isWes: IS_WES, picks: bstate.picks, rolls: bstate.rolls, tieChoice: bstate.tie, alloc: bstate.alloc || null, cfg: C });
    sheet.portrait = { status: 'generated', generator: 'portrait_gen.py port', race: Portrait.RACE_MAP[sheet.race] };   // SVG is re-rendered from name/race/class, not stored
    lastResult = ''; tab = 'store';
    await saveWith(d => { const next = JSON.parse(JSON.stringify(d)); next.players[P] = next.players[P] || Engine.newGame(P).players[P];
      Object.assign(next.players[P], { sheet, stage: 'store', location: 'store' }); return next; });
    sessionStorage.removeItem('bog4b:' + GID + P); tab = 'store'; render(); });
}

// ---------- play ----------
const me = () => doc.players[P];
function renderTurn() {
  const t = Engine.currentTurn(doc, queues, P), sh = me().sheet;
  if (Engine.stageOf(me()) === 'store') return `<div class="card" id="turn"><h2 id="storefirst">🛒 Visit the store first</h2><p>Mags won't send anyone into the Gullet without supplies. Shop, then head into the tavern.</p><button id="gostore">Go to the store</button></div>`;
  const nm = q => { const x = doc.players[q]; return x && x.sheet ? x.sheet.name : 'Player ' + q; };
  const doing = q => ({ build: 'building their character', store: 'shopping' })[Engine.stageOf(doc.players[q])] || 'getting ready';
  const info = Engine.turnInfo(doc, queues, P, Date.now()), reqBox = renderReqBox();
  if (info.state === 'lobby') return `<div class="card" id="turn"><h2 id="waitp">⏳ Waiting for your party</h2><p>Nobody else has opened this game yet. Send your friend the seat-2 link:</p>
    <p><code id="p2link">${esc(location.origin + location.pathname + '#g=' + GID + '&p=2')}</code></p><p class="dim">The quest starts when every adventurer is here in the tavern; then you take turns. If someone can't make it, ask the GM to start without them.</p></div>` + reqBox;
  if (info.state === 'waiting') return `<div class="card" id="turn"><h2 id="waitp">⏳ Waiting for ${esc(info.waitingFor.map(nm).join(' and '))}</h2>
    <p>${esc(info.waitingFor.map(q => nm(q) + ' is ' + doing(q)).join('; '))}. The quest starts when every adventurer is here in the tavern. Until then you can still shop and chat.</p>
    <p class="dim">If someone can't make it, ask the GM (System request below) to start without them.</p></div>` + reqBox;
  if (info.state === 'theirs' && !(info.canSkip && skipOk)) return `<div class="card" id="turn">${lastResult}<h2 id="waitturn">⏳ Waiting for ${esc(nm(info.holder))} to take their turn</h2>
    <p>You can shop${Engine.canShop(me()) ? '' : ' (in town)'}, read the sheets and chat in the meantime.</p>
    ${info.canSkip ? `<button id="skipturn">${esc(nm(info.holder))} has been away a while: take the turn</button>` : ''}</div>` + watchBox(info.holder) + reqBox;
  if (info.dropped) return `<div class="card" id="turn"><h2 id="dropped">The party went on without you</h2><p>The GM started the quest while you were away. Ask the GM (System request below) to add you back into the turn order.</p></div>` + reqBox;
  const banner = info.state === 'yours' && Object.keys(doc.players).length > 1 ? '<p id="yourturn" class="ok">🎯 Your turn</p>' : '';
  const turn = Engine.isGhost(doc, P) ? `<div class="card" id="turn">${lastResult}<h2 id="ghost">👻 You're a ghost, heckle away</h2><p id="ghostwait">${esc((D.builder && D.builder.ghost_wait_line) || 'The GM will bring you back tonight.')}</p></div>`
    : !t ? `<div class="card" id="turn">${lastResult}<h2>The GM is asleep.</h2><p>New turns arrive tonight.</p></div>`
    : `<div class="card" id="turn">${banner}<h2>${esc(t.title)}</h2><p>${esc(t.text)}</p>${lastResult}
      ${t.options.map((o, i) => `<button data-o="${i}">${esc(Engine.label(sh, o, D.builder.derp))}${o.roll && !sh.derp ? ` <span class="dim">(${esc(o.roll.skill)} DC ${o.roll.dc})</span>` : ''}</button>`).join('')}</div>`;
  const other = (Engine.isGhost(doc, P) || !t) ? Object.keys(doc.players).map(Number).find(q => q !== P && doc.players[q].sheet && (() => { try { return Engine.turnInfo(doc, queues, q, Date.now()).state === 'yours'; } catch { return false; } })()) : null;
  return turn + (other ? watchBox(other) : '') + reqBox;
}
// Round 2 #3: view-only, live view of what the GM narration is showing the current turn holder (and their last result).
function watchBox(q) {
  const x = doc.players[q]; if (!x || !x.sheet || q === P) return '';
  const t = Engine.currentTurn(doc, queues, q), last = (x.history || []).at(-1), who = esc(x.sheet.name);
  return `<div class="card watch" id="watch"><h2>👀 Following ${who}</h2>
    ${last ? `<p class="dim" id="watchlast">Last: ${last.die ? `🎲 ${last.die} ${last.mod >= 0 ? '+' : ''}${last.mod} = ${last.total} vs DC ${last.dc}: ` : ''}${esc(last.text || '')}</p>` : ''}
    ${t ? `<h3 id="watchtitle">${esc(t.title)}</h3><p id="watchtext">${esc(t.text)}</p><ol id="watchopts">${t.options.map(o => `<li>${esc(Engine.label(x.sheet, o, D.builder.derp))}${o.roll && !x.sheet.derp ? ` <span class="dim">(${esc(o.roll.skill)} DC ${o.roll.dc})</span>` : ''}</li>`).join('')}</ol>
      <p class="dim">View only: ${who} is choosing.</p>` : `<p class="dim">${who} has no turn right now.</p>`}</div>`;
}
function renderReqBox() {
  return `<div class="card"><h2>⚖️ System request</h2><div class="row"><input id="reqin" maxlength="300" placeholder="Ask the GM for something…"><button id="reqgo">Ask</button></div>
    <p class="dim">The GM rules nightly. Small asks granted, big ones need a roll, story-breaking ones denied.</p></div>`;
}
function bindTurn() {
  $('#skipturn') && ($('#skipturn').onclick = () => { const i = Engine.turnInfo(doc, queues, P, Date.now()); if (i.canSkip) { skipOk = true; lastResult = ''; render(); } });
  $('#gostore') && ($('#gostore').onclick = () => { tab = 'store'; render(); });
  document.querySelectorAll('[data-o]').forEach(b => b.onclick = async () => {
    let next; try { next = Engine.takeTurn(doc, queues, P, +b.dataset.o, Math.random, D.builder.derp, Date.now()); } catch (e) { lastResult = `<p class="bad">${esc(e.message)}</p>`; return render(); }
    const h = next.players[P].history.at(-1);
    lastResult = `<p id="tres" class="${h.ok ? 'ok' : 'bad'}">${h.die ? `🎲 ${h.die} ${h.mod >= 0 ? '+' : ''}${h.mod} = ${h.total} vs DC ${h.dc}: ` : ''}${esc(h.text)}</p>`;
    skipOk = false; if (!(await save(next))) lastResult = '<p class="bad">Someone else moved first; try again.</p>'; render(); });
  $('#reqgo') && ($('#reqgo').onclick = async () => { const v = $('#reqin').value.trim(); if (!v) return;
    const t = Engine.currentTurn(doc, queues, P), sh = me().sheet;
    await store.requestSend({ p: P, who: `${sh.name} the ${sh.class}`, text: v.slice(0, 300), turn_id: t ? t.turn_id : null }); $('#reqin').value = ''; });
}
const sign = n => (n >= 0 ? '+' : '') + n;
function sheetHtml(sh) {
  const d = Engine.derived(sh);
  return `<div class="card sheet" data-p="${sh.p}"><h2>${esc(sh.name)}: ${esc((D.races.races.find(r => r.id === sh.race) || {}).name || sh.race)} ${esc(sh.class)}${sh.derp ? ' (DERP, permanent)' : ''}${sh.dead ? ' <span class="ghost">👻 ghost</span>' : ''}</h2>
   <div class="portrait">${portraitCache[sh.p + sh.name + sh.class] = portraitCache[sh.p + sh.name + sh.class] || Portrait.forSheet(sh)}</div>
   <table><tr>${['str','dex','con','int','wis','cha'].map(a => `<td><b>${a.toUpperCase()}</b><br>${sh.abilities[a]} (${sign(d.mods[a])})</td>`).join('')}</tr></table>
   <p>HP ${sh.hp.current}/${sh.hp.max} · AC ${sh.ac} · Init ${sign(d.initiative)} · Speed ${sh.speed} · Prof ${sign(sh.proficiency_bonus)} · HD ${sh.hit_dice.left}/${sh.hit_dice.total}${sh.hit_dice.die}</p>
   <p>Saves: ${Object.entries(d.saves).map(([a, v]) => `${a.toUpperCase()} ${sign(v)}${sh.saves[a] ? '•' : ''}`).join(', ')}</p>
   <p>Skills: ${Object.entries(d.skills).filter(([k]) => sh.skills.includes(k)).map(([k, v]) => `${esc(k)} ${sign(v)}`).join(', ') || 'none'}</p>
   <p>Attacks: ${sh.attacks.map(a => `${esc(a.name)} ${sign(a.to_hit)} (${esc(a.damage)})`).join(', ') || 'none'}</p>
   <p>Spells: ${sh.spells ? [...(sh.spells.cantrips || []), ...(sh.spells.level1 || sh.spells.prepared || [])].map(esc).join(', ') + ` · slots ${sh.spells.slots_left ?? sh.spells.slots}/${sh.spells.slots} · DC ${sh.spells.save_dc ?? '?'}` : 'none'}</p>
   ${sh.features && sh.features.length ? `<p>Features: ${sh.features.map(esc).join(', ')}</p>` : ''}${sh.subclass ? `<p>Subclass: ${esc(sh.subclass)}</p>` : ''}
   <p>Gear: <span class="gear">${sh.equipment.map(e => `${esc(e.name)}${e.qty > 1 ? ' ×' + e.qty : ''}`).join(', ') || 'nothing (barefoot)'}</span></p>
   <p>Coin: <span class="coin">${sh.coin.gp} gp ${sh.coin.sp} sp ${sh.coin.cp} cp</span> · XP ${sh.xp} · Level ${sh.level}</p>
   <p class="dim">Background: ${esc(sh.background.base)} ${esc(sh.background.extra_line || '')} ${sh.background.additions.map(esc).join(' ')}</p>
   ${sh.p === P ? `<div class="row"><input class="bgadd" maxlength="200" placeholder="Add to your background"><button class="bggo">Add</button></div>` : ''}</div>`;
}
function renderSheets() { return Object.values(doc.players).filter(x => x.sheet).map(x => sheetHtml(x.sheet)).join(''); }
function bindSheets() { const b = document.querySelector('.bggo'); if (b) b.onclick = async () => { const v = document.querySelector('.bgadd').value.trim(); if (!v) return;
  const next = JSON.parse(JSON.stringify(doc)); next.players[P].sheet.background.additions.push(v); await save(next); }; }
const SHOP_CATS = () => (D.store.shop_categories || [{ id: 'apparel', name: 'Apparel' }, { id: 'weapons', name: 'Weapons' }, { id: 'adventure_gear', name: 'Adventure Gear' }, { id: 'misc', name: 'Miscellaneous' }]);
let shopCat = sessionStorage.getItem('bog4cat') || 'apparel';
const catOf = it => Engine.shopCategory(it);
function renderStore() { const cats = SHOP_CATS(); if (!cats.some(c => c.id === shopCat)) shopCat = cats[0].id;
  return `<div class="card"><h2>🛒 Store</h2><p>You have <b class="coin">${me().sheet.coin.gp} gp ${me().sheet.coin.sp} sp ${me().sheet.coin.cp} cp</b></p>${lastResult}
  <label>Category <select id="shopcat">${cats.map(c => `<option value="${esc(c.id)}"${c.id === shopCat ? ' selected' : ''}>${esc(c.name)} (${D.store.items.filter(i => catOf(i) === c.id).length})</option>`).join('')}</select></label>
  <div id="shopitems">${D.store.items.filter(it => catOf(it) === shopCat).map(it => `<button data-buy="${esc(it.id)}" ${Engine.buyable(it) ? '' : 'disabled'}>${esc(it.name)} <span class="dim">${Engine.buyable(it) ? it.price_gp + ' gp' : 'SOLD OUT'} · ${esc(it.type)}${it.notes ? ' · ' + esc(it.notes) : ''}</span></button>`).join('')}</div>${storeFooter()}</div>`; }
const storeFooter = () => Engine.stageOf(me()) === 'store' ? `<p class="dim">Shop as long as you like. When you're ready, head into the tavern.</p><button id="leavestore">Done shopping: go to the tavern</button>` : '';
function bindStore() { $('#leavestore') && ($('#leavestore').onclick = async () => { lastResult = ''; await saveWith(d => Engine.leaveStore(d, P, Date.now())); tab = 'turn'; render(); }); $('#shopcat') && ($('#shopcat').onchange = () => { shopCat = $('#shopcat').value; sessionStorage.setItem('bog4cat', shopCat); lastResult = ''; render(); });
  document.querySelectorAll('[data-buy]').forEach(b => b.onclick = async () => {
  try { const it = D.store.items.find(i => i.id === b.dataset.buy); await saveWith(d => Engine.buy(d, P, it)); lastResult = `<p class="ok">Bought ${esc(it.name)}.</p>`; render(); }
  catch (e) { lastResult = `<p class="bad">${esc(e.message)}</p>`; render(); } }); }
// v4 Adventure Log: everything said, done, rolled, gained and lost, newest first.
let advFilter = 'all';
function renderAdventure() {
  const all = Engine.adventureLog(doc, queues, chat, reqs, rulings), keep = { all: () => true, rolls: e => !!e.roll, talk: e => ['say', 'action', 'chat'].includes(e.kind), loot: e => /gained|lost|gp|sp|cp|HP/.test(e.detail || '') };
  const L = all.filter(keep[advFilter] || keep.all).reverse(), icon = { turn: '🗺️', say: '💬', action: '🎭', chat: '🗨️', buy: '🛒', ruling: '⚖️', gm: '⚖️', request: '⚖️', build: '🧙' };
  const when = ts => ts ? new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const roll = r => `<span class="${r.ok ? 'ok' : 'bad'}">🎲 ${r.die}${r.mod ? (r.mod > 0 ? ' +' : ' −') + Math.abs(r.mod) : ''} = ${r.total} vs DC ${r.dc}${r.skill ? ' (' + esc(r.skill) + ')' : ''}: ${r.ok ? 'success' : 'fail'}</span>`;
  return `<div class="card" id="advlog"><h2>📖 Adventure Log</h2><div class="row" id="advf">${[['all', 'All'], ['rolls', 'Rolls'], ['talk', 'Said & done'], ['loot', 'Gains & losses']].map(([k, l]) => `<button data-advf="${k}" class="${advFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <p class="dim">${all.length} entries, newest first.</p>
    ${L.map(e => `<div class="adv" data-kind="${e.kind}"><p><span class="dim">${when(e.ts)}</span> ${icon[e.kind] || '•'} <b>${esc(e.who)}</b>${e.ghost ? ' <span class="ghost">👻</span>' : ''}
      ${e.kind === 'turn' ? `· ${esc(e.title)}<br>chose <i>${esc(e.choice)}</i>${e.roll ? '<br>' + roll(e.roll) : ''}<br>${esc(e.text)}`
        : e.kind === 'say' ? esc(e.text) : e.kind === 'action' ? esc(e.text) : `${esc(e.text)}${e.roll ? '<br>' + roll(e.roll) : ''}`}
      ${e.detail ? `<br><span class="delta">${esc(e.detail)}</span>` : ''}${e.died ? ' <span class="bad">💀</span>' : ''}</p></div>`).join('') || '<p class="dim">Nothing yet. Your story starts in the tavern.</p>'}</div>`;
}
function bindAdventure() { document.querySelectorAll('[data-advf]').forEach(b => b.onclick = () => { advFilter = b.dataset.advf; render(); }); }
function renderLog() {
  const L = Engine.requestLog(reqs, rulings, doc.request_rolls || {});
  return `<div class="card"><h2>📜 Requests, actions &amp; dialogue</h2><div id="reqlog">${L.map(r => `<p${r.kind ? ` class="act" data-kind="${esc(r.kind)}"` : ''}>${r.kind === 'say' ? '💬 ' : r.kind === 'action' ? '🎭 ' : ''}<b>${esc(r.who)}</b>${r.gm ? ' <span class="dim">(GM ruling)</span>' : ''}: ${esc(r.text)}<br>
    ${r.ruling && r.ruling.ruling === 'roll' && !r.roll ? (r.p === P ? `GM: roll DC ${r.ruling.dc}. ${esc(r.ruling.reason)} <button data-rr="${esc(r.id)}">🎲 Roll for it</button>` : `<span class="dim">waiting for ${esc(r.who)} to roll (DC ${r.ruling.dc})</span>`) : r.roll ? `<span class="${r.roll.ok ? 'ok' : 'bad'}">rolled ${r.roll.die}${r.roll.mod ? (r.roll.mod > 0 ? '+' : '') + r.roll.mod : ''} = ${r.roll.total} vs DC ${r.roll.dc}: ${r.roll.ok ? 'success' : 'fail'}</span>: ${esc(r.ruling.reason)}` : r.ruling ? `<span class="${r.ruling.ruling === 'denied' || r.ruling.result === 'fail' ? 'bad' : 'ok'}">${esc(r.ruling.ruling)}${r.ruling.roll ? ` (🎲 ${r.ruling.roll.total} vs DC ${r.ruling.dc})` : ''}</span>: ${esc(r.ruling.reason)}` : (r.kind ? '<span class="dim">the GM reads this tonight</span>' : '<span class="dim">pending, the GM rules tonight</span>')}</p>`).join('') || '<p class="dim">No requests yet.</p>'}</div></div>`;
}
function bindLog() { document.querySelectorAll('[data-rr]').forEach(b => b.onclick = async () => { await save(Engine.rollRequest(doc, reqs, rulings, b.dataset.rr, P)); }); }
function renderChat() { return `<div class="card" id="chat"><h2>💬 Chat</h2><div id="chatlog">${chat.map(m => { const s = (doc.players[m.p] || {}).sheet;
  return `<p><b>${esc(s ? s.name : 'Player ' + m.p)}${m.ghost ? ' <span class="ghost">👻 ghost</span>' : ''}</b> <span class="dim">${new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>: ${esc(m.text)}</p>`; }).join('')}</div></div>`; }
// v4 typing fix: the chat input and the Action & dialogue box live in #dock, OUTSIDE #app, built once and never
// re-rendered, so live updates (doc, chat, polls, 60 s timer) can't recreate the inputs, drop focus or close the iOS keyboard.
function ensureDock() {
  const dk = $('#dock'); if (dk.dataset.built) return; dk.dataset.built = '1'; dk.hidden = false;
  dk.innerHTML = `<form class="row card dockchat" id="chatform"><input id="chatin" maxlength="300" autocomplete="off" enterkeyhint="send" placeholder="Message everyone…"><button>Send</button></form>
  <div class="card" id="act"><h2>🎭 Action &amp; dialogue</h2><form id="actform"><select id="actkind" aria-label="Action or dialogue"><option value="action">I do…</option><option value="say">I say…</option></select>
    <textarea id="actin" rows="2" maxlength="280" autocomplete="off" enterkeyhint="send" placeholder="Describe what your character does or says"></textarea><button id="actgo">Submit</button></form>
    <p class="dim">Your party sees it in chat and in the Adventure Log; the GM reads it with tonight's requests and weaves it into the story.</p></div>`;
  $('#chatform').onsubmit = async e => { e.preventDefault(); const v = $('#chatin').value.trim(); if (!v) return; $('#chatin').value = ''; await store.chatSend(P, v.slice(0, 300), Engine.isGhost(doc, P)); };
  $('#actform').onsubmit = async e => { e.preventDefault(); const v = $('#actin').value.trim(); if (!v) return; $('#actin').value = ''; await sendAct($('#actkind').value, v.slice(0, 280)); };
  $('#actin').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#actform').requestSubmit(); } });
}
// Round 2 #2: in-character action / dialogue -> chat (party sees it now) + requests with kind (GM sees it, Requests log).
async function sendAct(kind, v) {
  const sh = me().sheet, t = Engine.currentTurn(doc, queues, P), txt = kind === 'say' ? `says: “${v}”` : `does: ${v}`;
  await store.chatSend(P, (kind === 'say' ? '💬 ' : '🎭 ') + txt, Engine.isGhost(doc, P));
  await store.requestSend({ p: P, who: `${sh.name} the ${sh.class}`, text: (kind === 'say' ? 'Says: “' + v + '”' : 'Does: ' + v).slice(0, 300), kind, turn_id: t ? t.turn_id : null });
}

function render() {
  if (!doc) return;
  const pl = doc.players[P];
  let html = placeholderNote();
  if (!pl || !pl.sheet) { html += renderBuilder(); $('#app').innerHTML = html; return bindBuilder(); }
  const inTown = Engine.canShop(pl);
  const hold = (() => { try { const i = Engine.turnInfo(doc, queues, P, Date.now()); return i.state === 'yours' ? P : i.state === 'theirs' ? i.holder : 0; } catch { return 0; } })();
  html += `<div id="party">${Object.entries(doc.players).filter(([, x]) => x.sheet).map(([k, x]) => `<span class="pm${+k === P ? ' me' : ''}">${esc(x.sheet.name)}${x.sheet.dead ? ' <span class="ghost">👻 ghost</span>' : ''}${+k === hold && Object.keys(doc.players).length > 1 ? ' <span class="turnmark">🎯 turn</span>' : ''}</span>`).join('')}</div>`;
  html += `<nav>${[['turn', 'Turn'], ['sheet', 'Sheets'], inTown && ['store', 'Store'], ['adv', 'Log'], ['log', 'Requests']].filter(Boolean).map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>`;
  html += ({ turn: renderTurn, sheet: renderSheets, store: renderStore, adv: renderAdventure, log: renderLog })[tab]() + renderChat();
  const ae = document.activeElement, keepR = $('#reqin') ? $('#reqin').value : '', fR = ae && ae.id === 'reqin' ? [ae.selectionStart, ae.selectionEnd] : null;
  $('#app').innerHTML = html; ensureDock(); if ($('#reqin')) { $('#reqin').value = keepR; if (fR) { $('#reqin').focus(); $('#reqin').setSelectionRange(...fR); } }
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; lastResult = ''; render(); });
  ({ turn: bindTurn, sheet: bindSheets, store: bindStore, adv: bindAdventure, log: bindLog })[tab]();
  const cl = $('#chatlog'); cl.scrollTop = cl.scrollHeight;
}

(async () => {
  const [builder, races, storeData, batch1] = await Promise.all(['builder.json', 'races.json', 'store.json', 'batch1.json'].map(fetchJ));
  D = { builder, races, store: storeData, batch1 }; setRespawnLines();
  let staticBatches = batch1 ? [batch1] : [], lastRemote = {}, seatKey = '';
  let lastKey = ''; const remerge = remote => { const key = JSON.stringify(remote || {}) + '|' + Object.keys((doc && doc.players) || {}).join(); if (key === lastKey) return; lastKey = key; lastRemote = remote || {}; const seats = Object.keys((doc && doc.players) || {}).map(Number); seatKey = seats.join();
    const r = Engine.mergeBatches([...staticBatches, ...Object.values(lastRemote)], seats); queues = r.queues; batchProblems = r.problems;
    r.problems.forEach(p => console.warn('batch:', p)); render(); };
  doc = await store.get();
  if (!doc) { await store.cas(0, Engine.newGame(1, NEW_WES_HASH)); doc = await store.get(); }
  IS_WES = !!(W && doc.wes_hash && hashHex(W) === doc.wes_hash);
  if (!doc.players[P]) { const n = JSON.parse(JSON.stringify(doc)); n.players[P] = Engine.newGame(P).players[P]; await store.cas(doc.v, n); doc = await store.get(); }
  store.subscribe(d => { doc = d; if (Object.keys(d.players).join() !== seatKey) remerge(lastRemote); else render(); });
  store.chatSubscribe(m => { chat = m; render(); });
  let lastReq = ''; store.watchMap('requests', m => { const k = JSON.stringify(m); if (k === lastReq) return; lastReq = k; reqs = m; (tab === 'log' || tab === 'adv') && render(); });
  setInterval(() => { if (doc && (Engine.currentTurn(doc, queues, P) === null || Engine.turnInfo(doc, queues, P, Date.now()).state !== 'yours')) render(); }, 60000);
  let lastRul = ''; store.watchMap('rulings', async m => { const k = JSON.stringify(m); if (k === lastRul) return; lastRul = k; rulings = m; const n = Engine.applyRulings(doc, reqs, rulings);
    if (JSON.stringify(n.applied_rulings) !== JSON.stringify(doc.applied_rulings)) await save(n); else render(); });
  store.watchMap('batches', remerge);
  render();
})();
