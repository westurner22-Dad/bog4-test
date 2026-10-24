// store.js — one tiny adapter around a shared "game document".
// API (both backends):
//   get()                -> Promise<doc|null>          doc always has a numeric .v (version)
//   cas(expectedV, doc)  -> Promise<boolean>           writes doc with v = expectedV+1 only if current v === expectedV
//   subscribe(cb)        -> unsubscribe fn             cb(doc) on every change (including from other tabs/devices)
//   chatSend(p, text, ghost?)    -> Promise<boolean>           append {p, text, ts}; chat lives OUTSIDE the game doc
//   chatSubscribe(cb)    -> unsubscribe fn             cb([msgs sorted by ts]) now and on every new message
// Chat is a separate path/key on purpose: it never touches doc.v, the ETag, or the turn, so chatting can't block a move.
// Compare-and-set on v is what makes turns conflict-safe: two writes based on the same version -> only one wins.

function localStore(gameId) {
  const key = 'bog4:games:' + gameId;
  const ch = new BroadcastChannel(key);
  const read = () => JSON.parse(localStorage.getItem(key) || 'null');
  // navigator.locks serialises the read-compare-write across all tabs of this origin.
  const locked = fn => navigator.locks ? navigator.locks.request(key, fn) : Promise.resolve(fn());
  return {
    async get() { return read(); },
    cas(expectedV, doc) {
      return locked(async () => {
        // Chrome syncs localStorage between tabs asynchronously, so a tab can read a stale copy right after another
        // tab's write. A short settle inside the lock lets it catch up. (Local backend is test-only; Firebase CAS is server-side.)
        await new Promise(r => setTimeout(r, 40));
        const cur = read();
        if ((cur ? cur.v : 0) !== expectedV) return false;
        const next = { ...doc, v: expectedV + 1 };
        localStorage.setItem(key, JSON.stringify(next));
        ch.postMessage(next);
        return true;
      });
    },
    subscribe(cb) {
      const h = e => cb(e.data);
      ch.addEventListener('message', h);
      return () => ch.removeEventListener('message', h);
    },
    ...localChat(gameId),
    requestSend(r) { return localAppend('bog4:requests:' + gameId, r); },
    watchMap(kind, cb) { return localMap('bog4:' + kind + ':' + gameId, cb); }
  };
}

// Append-only log as {id: entry} in localStorage (requests). Same lock + broadcast pattern as chat.
function localAppend(key, entry) {
  const locked = fn => navigator.locks ? navigator.locks.request(key, fn) : Promise.resolve(fn());
  return locked(() => { const all = JSON.parse(localStorage.getItem(key) || '{}');
    all['r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)] = { ...entry, ts: Date.now() };
    localStorage.setItem(key, JSON.stringify(all)); new BroadcastChannel(key).postMessage(1); return true; });
}
// Read-only map watch (requests / rulings / batches). The GM side (or a test) writes the key directly.
function localMap(key, cb) {
  const ch = new BroadcastChannel(key), h = () => cb(JSON.parse(localStorage.getItem(key) || '{}')), hs = e => { if (e.key === key) h(); };
  ch.addEventListener('message', h); addEventListener('storage', hs); h();
  const t = setInterval(h, 1500);   // own-tab writes don't fire 'storage'; cheap poll for the test backend
  return () => { ch.removeEventListener('message', h); removeEventListener('storage', hs); clearInterval(t); };
}

function localChat(gameId) {
  const key = 'bog4:chat:' + gameId, ch = new BroadcastChannel(key), mine = new Set(); // BroadcastChannel skips the sender, so notify own tab too
  const read = () => JSON.parse(localStorage.getItem(key) || '[]');
  const locked = fn => navigator.locks ? navigator.locks.request(key, fn) : Promise.resolve(fn());
  return {
    chatSend(p, text, ghost = false) {
      return locked(() => {
        const all = read(); all.push({ p, text, ts: Date.now(), ...(ghost ? { ghost: true } : {}) });
        localStorage.setItem(key, JSON.stringify(all)); ch.postMessage(1); mine.forEach(f => f()); return true;
      });
    },
    chatSubscribe(cb) {
      const h = () => cb(read()), hs = e => { if (e.key === key) h(); };
      // BroadcastChannel occasionally drops a message to a background tab; the 'storage' event is a second path.
      ch.addEventListener('message', h); addEventListener('storage', hs); mine.add(h); h();
      return () => { ch.removeEventListener('message', h); removeEventListener('storage', hs); mine.delete(h); };
    }
  };
}

function firebaseStore(gameId, cfg) {
  // Realtime Database REST: ETag + if-match gives server-side compare-and-set; SSE gives live updates.
  const base = `${cfg.databaseURL.replace(/\/$/, '')}/${cfg.prefix || 'bog4'}`;
  const url = `${base}/games/${encodeURIComponent(gameId)}.json`;
  const chatUrl = `${base}/chat/${encodeURIComponent(gameId)}.json`;
  return {
    async get() { const r = await fetch(url); return r.ok ? r.json() : null; },
    async cas(expectedV, doc) {
      const r = await fetch(url, { headers: { 'X-Firebase-ETag': 'true' } });
      const cur = await r.json();
      if ((cur ? cur.v : 0) !== expectedV) return false;
      const w = await fetch(url, { method: 'PUT', headers: { 'if-match': r.headers.get('ETag') },
        body: JSON.stringify({ ...doc, v: expectedV + 1 }) });
      return w.ok;                       // 412 Precondition Failed = someone else wrote first
    },
    subscribe(cb) {
      const es = new EventSource(url);
      const h = () => this.get().then(d => d && cb(d)); // simplest: refetch whole doc on any change
      es.addEventListener('put', h); es.addEventListener('patch', h);
      return () => es.close();
    },
    // Chat at /chat/<gid>/<pushId> (sibling tree, not under /games/<gid>, so a game PUT never wipes it and
    // chat writes never change the game's ETag). ts is the server clock; each player shows it in local time.
    async chatSend(p, text, ghost = false) {
      const r = await fetch(chatUrl, { method: 'POST', body: JSON.stringify({ p, text, ts: { '.sv': 'timestamp' }, ...(ghost ? { ghost: true } : {}) }) });
      return r.ok;
    },
    chatSubscribe(cb) {
      const pull = () => fetch(chatUrl).then(r => r.ok ? r.json() : null)
        .then(o => cb(Object.values(o || {}).sort((a, b) => a.ts - b.ts))).catch(() => {});
      const es = new EventSource(chatUrl);
      es.addEventListener('put', pull); es.addEventListener('patch', pull);
      return () => es.close();
    },
    async requestSend(r) {
      const x = await fetch(`${base}/requests/${encodeURIComponent(gameId)}.json`, { method: 'POST', body: JSON.stringify({ ...r, ts: { '.sv': 'timestamp' } }) });
      return x.ok;
    },
    watchMap(kind, cb) {   // kind: requests | rulings | batches
      const u = `${base}/${kind}/${encodeURIComponent(gameId)}.json`;
      const pull = () => fetch(u).then(r => r.ok ? r.json() : null).then(o => cb(o || {})).catch(() => {});
      const es = new EventSource(u); es.addEventListener('put', pull); es.addEventListener('patch', pull);
      return () => es.close();
    }
  };
}

window.makeStore = (gameId, config) =>
  config.backend === 'firebase' ? firebaseStore(gameId, config.firebase) : localStore(gameId);
