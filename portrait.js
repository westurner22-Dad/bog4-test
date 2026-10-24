// portrait.js: one-to-one JS port of /workspace/dnd2/art/portraits/portrait_gen.py (Artist owns the art; no new art here).
// renderPortrait({name, race, class, isWes}) -> SVG string. Same seed byte order as the Python. isWes comes from the private link only.
(function (root) {
  // --- sync SHA-256 (so the seed matches hashlib.sha256 without async crypto.subtle) ---
  function sha256(bytes) {
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const l = bytes.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n); m.set(bytes); m[l] = 0x80;
    const bits = l * 8; for (let i = 0; i < 4; i++) m[n - 1 - i] = (bits >>> (8 * i)) & 255; m[n - 5] = Math.floor(bits / 2 ** 32) & 255;
    const w = new Uint32Array(64), ror = (x, k) => (x >>> k) | (x << (32 - k));
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) { const s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) { const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0, t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0; }
      H = [a, b, c, d, e, f, g, h].map((v, i) => (H[i] + v) | 0);
    }
    const out = []; H.forEach(v => out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255)); return out;
  }
  const utf8 = s => Array.from(unescape(encodeURIComponent(s)), c => c.charCodeAt(0));
  const pyStrip = s => s.replace(/^[\s\x1c-\x1f]+|[\s\x1c-\x1f]+$/g, '');
  class Rng { constructor(name) { this.h = sha256(utf8(pyStrip(name).toLowerCase())); this.i = 0; }
    f() { const v = this.h[this.i % 32] / 255.0; this.i++; return v; }
    pick(seq) { return seq[Math.trunc(this.f() * seq.length) % seq.length]; }
    rng(a, b) { return a + (b - a) * this.f(); } }
  // Python f"{x:.0f}" = round-half-even on the exact binary value
  const f0 = x => { const r = Math.round(x); return String((Math.abs(x % 1) === 0.5 && r % 2 !== 0) ? r - 1 : r); };
  const hex2 = v => v.toString(16).toUpperCase().padStart(2, '0');
  // colorsys port
  function rgbToHls(r, g, b) { const maxc = Math.max(r, g, b), minc = Math.min(r, g, b), sumc = maxc + minc, rangec = maxc - minc, l = sumc / 2;
    if (minc === maxc) return [0, l, 0]; const s = l <= 0.5 ? rangec / sumc : rangec / (2 - maxc - minc);
    const rc = (maxc - r) / rangec, gc = (maxc - g) / rangec, bc = (maxc - b) / rangec;
    let h = r === maxc ? bc - gc : g === maxc ? 2 + rc - bc : 4 + gc - rc; h = ((h / 6) % 1 + 1) % 1; return [h, l, s]; }
  function hlsToRgb(h, l, s) { if (s === 0) return [l, l, l]; const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s, m1 = 2 * l - m2;
    const v = (hh) => { hh = ((hh % 1) + 1) % 1; if (hh < 1 / 6) return m1 + (m2 - m1) * hh * 6; if (hh < 0.5) return m2; if (hh < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - hh) * 6; return m1; };
    return [v(h + 1 / 3), v(h), v(h - 1 / 3)]; }
  const parse = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  function jitter(c, dh) { const [r, g, b] = parse(c).map(v => v / 255); let [h, l, s] = rgbToHls(r, g, b); const out = hlsToRgb(((h + dh) % 1 + 1) % 1, l, s);
    return '#' + out.map(v => hex2(Math.trunc(v * 255))).join(''); }
  const shade = (c, k) => '#' + parse(c).map(v => hex2(Math.max(0, Math.min(255, Math.trunc(v * k))))).join('');

  const OL = '#3A2620', SW = 10, O = `stroke="${OL}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round"`;
  const A = { head: [256, 210], face: [256, 225], hand_r: [392, 420], hand_l: [120, 430], prop: [392, 420], hat: [256, 120], neck: [256, 315] };
  const RACES = {
    'Human': { skin: ['#F2C9A0','#D9A57A','#A9744F','#7A4E33'], hair: ['#5A3A22','#2E2018','#C9822E','#E8C468'], feat: [], h: [0, 1.0] },
    'Elf': { skin: ['#F5D7B8','#E2B98F','#B98A63'], hair: ['#F1E3A6','#C0C8D8','#3B2A4A'], feat: ['ears_long'], h: [-6, 0.97] },
    'Half-Elf': { skin: ['#F2C9A0','#D9A57A','#B07E57'], hair: ['#7A4A2A','#D9B45A','#2E2018'], feat: ['ears_short'], h: [0, 1.0] },
    'Dwarf': { skin: ['#E8B48E','#C98F66','#9C6644'], hair: ['#B5462E','#6B3E22','#9A9A9A'], feat: ['beard','wide'], h: [26, 1.06] },
    'Halfling': { skin: ['#F2C9A0','#D9A57A','#A9744F'], hair: ['#7A4A2A','#C9822E'], feat: ['curly'], h: [40, 1.08] },
    'Gnome': { skin: ['#F5CDA8','#D9A57A'], hair: ['#F2F2F2','#E86A3A','#7AC6E0'], feat: ['ears_short','big_nose'], h: [44, 1.1] },
    'Half-Orc': { skin: ['#8DB36B','#6F9A55','#A3A877'], hair: ['#2E2018','#4A3A2A'], feat: ['tusks','wide','heavy_brow'], h: [-4, 1.02] },
    'Tiefling': { skin: ['#D9566B','#9C4FB0','#5C7BD6'], hair: ['#2A1E3A','#3B2A4A','#E8E0F0'], feat: ['horns','ears_short','tail'], h: [0, 1.0] },
    'Dragonborn': { skin: ['#4FA36B','#C9A227','#C2513A','#3F7FC0'], hair: [null], feat: ['snout','scales','crest'], h: [-8, 1.02] } };
  const CLASSES = {
    Artificer: { c: '#B5713A', t: '#E8C468', prop: 'wrench', hat: 'goggles' }, Barbarian: { c: '#8A5A3A', t: '#D2BC98', prop: 'axe', hat: null },
    Bard: { c: '#3FA0A0', t: '#FFC21A', prop: 'lute', hat: 'feather_cap' }, Cleric: { c: '#F2EEDC', t: '#FFC21A', prop: 'mace', hat: null },
    Druid: { c: '#5E8F4E', t: '#B5D98A', prop: 'leaf_staff', hat: 'leaf_crown' }, Fighter: { c: '#7D8A99', t: '#C9D2DC', prop: 'sword', hat: null },
    Monk: { c: '#E07A2E', t: '#7A3E1E', prop: 'beads', hat: 'headband' }, Paladin: { c: '#D7DCE4', t: '#4A6FD6', prop: 'hammer', hat: null },
    Ranger: { c: '#4E6E3A', t: '#A07A4A', prop: 'bow', hat: null }, Rogue: { c: '#3E4452', t: '#8A93A6', prop: 'dagger', hat: 'hood' },
    Sorcerer: { c: '#C23A4A', t: '#FF9A3A', prop: 'fireball', hat: null }, Warlock: { c: '#4B2E6B', t: '#9BE05A', prop: 'tome', hat: null },
    Wizard: { c: '#3A55B0', t: '#FFC21A', prop: 'star_staff', hat: 'wizard_hat' }, Derp: { c: '#F2A93A', t: '#7AC6E0', prop: 'spoon', hat: 'propeller' } };
  const RAINBOW = ['#E8443A','#F28C28','#FFC21A','#5DBB4A','#3A8FE0','#7A4FD0'];

  function bgSilly(r) { const n = Math.trunc(r.rng(3, 6.99)), out = ['<rect width="512" height="512" fill="#BFE6F5"/>']; const cx = 256 + r.rng(-30, 30), cy = 360;
    for (let i = 0; i < n; i++) { const rad = 300 - i * 34; out.push(`<path d="M${cx - rad},${cy} A${rad},${rad} 0 0 1 ${cx + rad},${cy}" fill="none" stroke="${RAINBOW[i % 6]}" stroke-width="34"/>`); }
    for (const x of [cx - 300 + 17 * n, cx + 300 - 17 * n]) { const y = 372; out.push(`<g fill="#FFFFFF" ${O}><ellipse cx="${x}" cy="${y}" rx="60" ry="30"/><circle cx="${x - 25}" cy="${y - 18}" r="26"/><circle cx="${x + 20}" cy="${y - 24}" r="30"/></g>`); }
    out.push('<rect y="440" width="512" height="72" fill="#94D36B"/>'); return out.join('\n'); }
  function bgEpic() { const rays = Array.from({ length: 12 }, (_, i) => i * 0.52).map(a => `<path d="M256,150 L${256 + 600 * Math.cos(a)},${150 + 600 * Math.sin(a)} L${256 + 600 * Math.cos(a + 0.12)},${150 + 600 * Math.sin(a + 0.12)}Z" fill="#FFE9A8" opacity="0.18"/>`).join('');
    return `<defs><radialGradient id="eg" cx="0.5" cy="0.35" r="0.75"><stop offset="0" stop-color="#F7C948"/><stop offset="0.25" stop-color="#C2513A"/><stop offset="0.6" stop-color="#4B1F5E"/><stop offset="1" stop-color="#14123A"/></radialGradient>
<linearGradient id="sw" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#7FE8FF"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#eg)"/>
${rays}
<path d="M0,470 L90,400 L160,440 L250,380 L340,445 L430,395 L512,450 L512,512 L0,512Z" fill="#1E1840" ${O}/>`; }
  const cape = () => `<path d="M150,330 C60,380 20,470 10,512 L502,512 C490,440 470,360 362,330 Z" fill="#8E1B3A" ${O}/><path d="M60,512 C90,440 120,400 160,360" fill="none" stroke="#B8304F" stroke-width="12"/>`;
  function body(skin, C, epic) { const sh = epic ? 150 : 128, top = epic ? 330 : 340;
    const d = `M${256 - sh},512 C${256 - sh},${top + 40} ${256 - sh + 30},${top} 256,${top} C${256 + sh - 30},${top} ${256 + sh},${top + 40} ${256 + sh},512Z`;
    const out = [`<rect x="226" y="285" width="60" height="60" fill="${skin}" ${O}/>`, `<path d="${d}" fill="${C.c}" ${O}/>`,
      `<path d="M206,${top + 4} L256,${top + 60} L306,${top + 4}" fill="none" stroke="${C.t}" stroke-width="14" stroke-linecap="round"/>`];
    if (epic) { out.push(`<ellipse cx="${256 - sh + 30}" cy="${top + 30}" rx="54" ry="36" fill="#C9D2DC" ${O}/><ellipse cx="${256 + sh - 30}" cy="${top + 30}" rx="54" ry="36" fill="#C9D2DC" ${O}/>`);
      out.push(`<path d="M${256 - sh + 4},500 C${256 - sh + 4},${top + 90} ${256 - sh + 14},${top + 50} ${256 - sh + 40},${top + 28}" stroke-linecap="round" stroke="#7FE8FF" stroke-width="6" fill="none"/>`); }
    return out.join('\n'); }
  function head(race, skin, hair, epic) { const F = RACES[race].feat, rx = F.includes('wide') ? 104 : 92, ry = 102, [cx, cy] = A.head, out = [];
    if (F.includes('horns')) for (const s of [-1, 1]) out.push(`<path d="M${cx + s * 50},${cy - 80} C${cx + s * 70},${cy - 150} ${cx + s * 130},${cy - 150} ${cx + s * 140},${cy - 100} C${cx + s * 110},${cy - 120} ${cx + s * 90},${cy - 100} ${cx + s * 80},${cy - 70}Z" fill="#3B2A4A" ${O}/>`);
    if (F.includes('crest')) out.push(`<path d="M${cx - 60},${cy - 70} L${cx - 40},${cy - 140} L${cx - 10},${cy - 90} L${cx + 10},${cy - 150} L${cx + 35},${cy - 90} L${cx + 60},${cy - 135} L${cx + 70},${cy - 60}Z" fill="${shade(skin, 0.75)}" ${O}/>`);
    for (const s of [-1, 1]) {
      if (F.includes('ears_long')) out.push(`<path d="M${cx + s * 80},${cy - 10} L${cx + s * 165},${cy - 70} L${cx + s * 88},${cy + 30}Z" fill="${skin}" ${O}/>`);
      else if (F.includes('ears_short')) out.push(`<path d="M${cx + s * 82},${cy - 5} L${cx + s * 128},${cy - 40} L${cx + s * 90},${cy + 30}Z" fill="${skin}" ${O}/>`);
      else if (!F.includes('snout')) out.push(`<circle cx="${cx + s * rx}" cy="${cy + 5}" r="22" fill="${skin}" ${O}/>`); }
    if (hair && !epic && F.includes('curly')) for (const dx of [-70, -35, 0, 35, 70]) out.push(`<circle cx="${cx + dx}" cy="${cy - 70 + Math.abs(dx) * 0.3}" r="34" fill="${hair}" ${O}/>`);
    if (F.includes('snout')) {
      out.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${skin}" ${O}/>`);
      out.push(`<ellipse cx="${cx}" cy="${cy + 60}" rx="74" ry="48" fill="${skin}" ${O}/><circle cx="${cx - 22}" cy="${cy + 45}" r="6" fill="${OL}"/><circle cx="${cx + 22}" cy="${cy + 45}" r="6" fill="${OL}"/>`);
      for (const [x, y] of [[-60, -50], [55, -45], [-70, 10], [68, 15], [0, -75]]) out.push(`<path d="M${cx + x - 10},${cy + y} q10,-12 20,0" fill="none" stroke="${shade(skin, 0.7)}" stroke-width="5"/>`);
    } else {
      out.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${skin}" ${O}/>`);
      if (hair && !F.includes('curly')) {
        if (epic) out.push(`<path d="M${cx - 92},${cy - 10} C${cx - 100},${cy - 110} ${cx + 40},${cy - 140} ${cx + 150},${cy - 90} C${cx + 110},${cy - 80} ${cx + 100},${cy - 60} ${cx + 92},${cy - 20} C${cx + 40},${cy - 70} ${cx - 40},${cy - 70} ${cx - 92},${cy - 10}Z" fill="${hair}" ${O}/>`);
        else out.push(`<path d="M${cx - rx},${cy - 5} C${cx - rx},${cy - 130} ${cx + rx},${cy - 130} ${cx + rx},${cy - 5} C${cx + 50},${cy - 60} ${cx - 50},${cy - 60} ${cx - rx},${cy - 5}Z" fill="${hair}" ${O}/>`); } }
    if (F.includes('heavy_brow')) out.push(`<path d="M${cx - 70},${cy - 30} Q${cx},${cy - 55} ${cx + 70},${cy - 30}" fill="none" stroke="${shade(skin, 0.7)}" stroke-width="18" stroke-linecap="round"/>`);
    return out.join('\n'); }
  function beard(race, hair) { if (!RACES[race].feat.includes('beard')) return ''; const [cx, cy] = A.head;
    return `<path d="M${cx - 95},${cy + 10} C${cx - 110},${cy + 150} ${cx - 30},${cy + 190} ${cx},${cy + 200} C${cx + 30},${cy + 190} ${cx + 110},${cy + 150} ${cx + 95},${cy + 10} C${cx + 60},${cy + 60} ${cx - 60},${cy + 60} ${cx - 95},${cy + 10}Z" fill="${hair}" ${O}/>`; }
  function faceSilly(r, race, skin) { const F = RACES[race].feat, [cx, cy] = A.face, out = []; const ey = cy - 30, er = 30 + r.rng(0, 8);
    const style = r.pick(['crossed', 'googly', 'googly', 'wall']);
    for (const s of [-1, 1]) { const ex = cx + s * 40, ers = er * ((s === 1 && style === 'googly') ? 1.15 : 1);
      out.push(`<circle cx="${ex}" cy="${ey}" r="${f0(ers)}" fill="#FFFFFF" ${O}/>`); let px, py;
      if (style === 'crossed') { px = ex - s * 12; py = ey + 6; } else if (style === 'wall') { px = ex + s * 12; py = ey - 4; } else { const a = r.rng(0, 6.28); px = ex + Math.cos(a) * 12; py = ey + Math.sin(a) * 12; }
      out.push(`<circle cx="${f0(px)}" cy="${f0(py)}" r="12" fill="${OL}"/><circle cx="${f0(px - 4)}" cy="${f0(py - 4)}" r="4" fill="#FFF"/>`);
      out.push(`<path d="M${ex - 22},${ey - er - 18} Q${ex},${ey - er - 34 - s * 6} ${ex + 22},${ey - er - 16}" fill="none" ${O}/>`); }
    if (F.includes('big_nose')) out.push(`<ellipse cx="${cx}" cy="${cy + 12}" rx="22" ry="18" fill="${shade(skin, 0.9)}" ${O}/>`);
    const gw = 62 + r.rng(0, 22), my = cy + (F.includes('snout') ? 60 : 30);
    out.push(`<path d="M${cx - gw},${my} Q${cx},${my + 10} ${cx + gw},${my} Q${cx + gw * 0.7},${my + 80} ${cx},${my + 84} Q${cx - gw * 0.7},${my + 80} ${cx - gw},${my}Z" fill="#8E2A2A" ${O}/>`);
    out.push(`<path d="M${cx - gw + 12},${my + 6} Q${cx},${my + 20} ${cx + gw - 12},${my + 6} L${cx + gw - 20},${my + 22} Q${cx},${my + 34} ${cx - gw + 20},${my + 22}Z" fill="#FFFFFF"/>`);
    out.push(`<ellipse cx="${f0(cx + r.rng(-10, 10))}" cy="${my + 60}" rx="24" ry="14" fill="#E86A7A"/>`);
    if (r.f() > 0.5) out.push(`<rect x="${cx - 5}" y="${my + 5}" width="10" height="18" fill="#8E2A2A"/>`);
    for (const s of [-1, 1]) out.push(`<ellipse cx="${cx + s * 72}" cy="${cy + 20}" rx="16" ry="10" fill="#F28C9A" opacity="0.7"/>`);
    if (F.includes('tusks')) for (const s of [-1, 1]) out.push(`<path d="M${cx + s * (gw - 4)},${my + 30} L${cx + s * (gw - 10)},${my - 34} L${cx + s * (gw - 34)},${my + 22}Z" fill="#FFF6DC" ${O}/>`);
    return out.join('\n'); }
  function faceEpic(race, skin) { const [cx, cy] = A.face, out = [];
    for (const s of [-1, 1]) { const ex = cx + s * 38, ey = cy - 26;
      out.push(`<path d="M${ex - 22},${ey} Q${ex},${ey - 14} ${ex + 22},${ey} Q${ex},${ey + 10} ${ex - 22},${ey}Z" fill="#FFFFFF" ${O}/><circle cx="${ex}" cy="${ey}" r="6" fill="#2A5BD7"/>`);
      out.push(`<path d="M${ex - s * -26},${ey - 30} L${ex + s * -24},${ey - 16}" stroke="${OL}" stroke-width="14" stroke-linecap="round"/>`); }
    out.push(`<path d="M${cx - 6},${cy - 10} L${cx - 12},${cy + 20} L${cx + 4},${cy + 22}" fill="none" stroke="${shade(skin, 0.7)}" stroke-width="6"/>`);
    out.push(`<path d="M${cx - 26},${cy + 50} Q${cx},${cy + 44} ${cx + 30},${cy + 46}" fill="none" ${O}/>`);
    out.push(`<path d="M${cx - 86},${cy - 40} C${cx - 96},${cy + 30} ${cx - 60},${cy + 80} ${cx - 20},${cy + 90}" fill="none" stroke="#7FE8FF" stroke-width="7" opacity="0.9"/>`);
    out.push(`<path d="M${cx + 20},${cy + 70} q20,-6 40,-30" fill="none" stroke="${shade(skin, 0.82)}" stroke-width="5"/>`);
    return out.join('\n'); }
  function hat(kind, C) { const [x, y] = A.hat;
    if (kind === 'wizard_hat') return `<path d="M${x - 120},${y + 30} L${x + 120},${y + 30} L${x + 30},${y + 10} L${x + 60},${y - 110} L${x - 40},${y + 10}Z" fill="${C.c}" ${O}/><path d="M${x + 20},${y - 40} l6,12 13,2 -10,9 3,13 -12,-6 -12,6 3,-13 -10,-9 13,-2z" fill="${C.t}"/>`;
    if (kind === 'propeller') return `<path d="M${x - 80},${y + 30} Q${x},${y - 60} ${x + 80},${y + 30}Z" fill="#E8443A" ${O}/><path d="M${x - 40},${y + 20} Q${x},${y - 40} ${x},${y + 30}" fill="#FFC21A"/><line x1="${x}" y1="${y - 15}" x2="${x}" y2="${y - 45}" ${O}/><path d="M${x - 60},${y - 50} L${x + 60},${y - 40} L${x + 60},${y - 52} L${x - 60},${y - 62}Z" fill="#3A8FE0" ${O}/>`;
    if (kind === 'leaf_crown') return [-70, -35, 0, 35, 70].map(dx => `<ellipse cx="${x + dx}" cy="${y + 16}" rx="16" ry="30" transform="rotate(${dx / 3} ${x + dx} ${y + 16})" fill="#5DBB4A" ${O}/>`).join('');
    if (kind === 'headband') return `<rect x="${x - 94}" y="${y + 40}" width="188" height="24" rx="8" fill="${C.t}" ${O}/>`;
    if (kind === 'feather_cap') return `<path d="M${x - 90},${y + 40} Q${x},${y - 30} ${x + 90},${y + 40}Z" fill="${C.c}" ${O}/><path d="M${x + 40},${y + 10} C${x + 120},${y - 40} ${x + 150},${y - 90} ${x + 140},${y - 110} C${x + 110},${y - 60} ${x + 70},${y - 20} ${x + 40},${y + 10}Z" fill="#E8443A" ${O}/>`;
    if (kind === 'goggles') return `<rect x="${x - 96}" y="${y + 42}" width="192" height="16" fill="#5A3A22"/><circle cx="${x - 36}" cy="${y + 50}" r="24" fill="#7FD0E8" ${O}/><circle cx="${x + 36}" cy="${y + 50}" r="24" fill="#7FD0E8" ${O}/>`;
    if (kind === 'hood') return `<path d="M${x - 110},${y + 190} C${x - 130},${y - 10} ${x - 40},${y - 30} ${x},${y - 30} C${x + 40},${y - 30} ${x + 130},${y - 10} ${x + 110},${y + 190} L${x + 86},${y + 100} C${x + 60},${y + 20} ${x - 60},${y + 20} ${x - 86},${y + 100}Z" fill="${C.c}" ${O}/>`;
    return ''; }
  function prop(kind, C, skin, epic) { let [hx, hy] = A.hand_r; const g = [];
    const P = {
      sword: `<g transform="rotate(-30 ${hx} ${hy})"><rect x="${hx - 14}" y="${hy - 250}" width="28" height="250" fill="#DDE6EE" ${O}/><rect x="${hx - 50}" y="${hy - 14}" width="100" height="22" fill="#C9A227" ${O}/></g>`,
      axe: `<g transform="rotate(-20 ${hx} ${hy})"><rect x="${hx - 9}" y="${hy - 220}" width="18" height="260" fill="#8A5A3A" ${O}/><path d="M${hx},${hy - 220} C${hx + 90},${hy - 240} ${hx + 100},${hy - 140} ${hx},${hy - 150}Z" fill="#C9D2DC" ${O}/></g>`,
      lute: `<g transform="rotate(25 ${hx} ${hy})"><rect x="${hx - 8}" y="${hy - 200}" width="16" height="140" fill="#8A5A3A" ${O}/><ellipse cx="${hx}" cy="${hy - 40}" rx="56" ry="66" fill="#C9822E" ${O}/><circle cx="${hx}" cy="${hy - 50}" r="16" fill="${OL}"/></g>`,
      mace: `<rect x="${hx - 9}" y="${hy - 160}" width="18" height="180" fill="#8A5A3A" ${O}/><circle cx="${hx}" cy="${hy - 170}" r="40" fill="#FFC21A" ${O}/>` + Array.from({ length: 8 }, (_, i) => i * 0.785).map(a => `<line x1="${hx}" y1="${hy - 170}" x2="${hx + 62 * Math.cos(a)}" y2="${hy - 170 + 62 * Math.sin(a)}" stroke="#FFC21A" stroke-width="10" stroke-linecap="round"/>`).join(''),
      leaf_staff: `<rect x="${hx - 9}" y="${hy - 230}" width="18" height="300" fill="#8A5A3A" ${O}/><ellipse cx="${hx + 26}" cy="${hy - 230}" rx="18" ry="34" fill="#5DBB4A" ${O}/><ellipse cx="${hx - 26}" cy="${hy - 210}" rx="18" ry="34" fill="#5DBB4A" ${O}/>`,
      beads: Array.from({ length: 10 }, (_, i) => i * 0.628).map(a => `<circle cx="${hx + 50 * Math.cos(a)}" cy="${hy - 60 + 50 * Math.sin(a)}" r="12" fill="#7A3E1E" ${O}/>`).join(''),
      hammer: `<rect x="${hx - 9}" y="${hy - 200}" width="18" height="230" fill="#8A5A3A" ${O}/><rect x="${hx - 60}" y="${hy - 240}" width="120" height="64" rx="10" fill="#C9D2DC" ${O}/><circle cx="${hx}" cy="${hy - 208}" r="14" fill="#FFC21A"/>`,
      bow: `<path d="M${hx},${hy - 220} C${hx + 100},${hy - 120} ${hx + 100},${hy + 20} ${hx},${hy + 60}" fill="none" stroke="#A07A4A" stroke-width="18"/><path d="M${hx},${hy - 220} C${hx + 100},${hy - 120} ${hx + 100},${hy + 20} ${hx},${hy + 60}" fill="none" stroke="${OL}" stroke-width="4"/><line x1="${hx}" y1="${hy - 220}" x2="${hx}" y2="${hy + 60}" stroke="${OL}" stroke-width="4"/>`,
      dagger: `<path d="M${hx - 12},${hy - 10} L${hx},${hy - 130} L${hx + 12},${hy - 10}Z" fill="#DDE6EE" ${O}/><rect x="${hx - 34}" y="${hy - 16}" width="68" height="16" fill="#3E4452" ${O}/>`,
      fireball: `<path d="M${hx},${hy - 190} C${hx + 70},${hy - 120} ${hx + 60},${hy - 60} ${hx},${hy - 50} C${hx - 60},${hy - 60} ${hx - 70},${hy - 120} ${hx},${hy - 190}Z" fill="#FF9A3A" ${O}/><circle cx="${hx}" cy="${hy - 95}" r="26" fill="#FFE27A"/>`,
      tome: `<rect x="${hx - 60}" y="${hy - 130}" width="120" height="100" rx="8" fill="#4B2E6B" ${O}/><ellipse cx="${hx}" cy="${hy - 80}" rx="28" ry="16" fill="#9BE05A" ${O}/><circle cx="${hx}" cy="${hy - 80}" r="8" fill="${OL}"/>`,
      star_staff: `<rect x="${hx - 9}" y="${hy - 230}" width="18" height="300" fill="#8A5A3A" ${O}/><path d="M${hx},${hy - 300} l18,36 40,6 -29,28 7,40 -36,-19 -36,19 7,-40 -29,-28 40,-6z" fill="#FFC21A" ${O}/>`,
      wrench: `<g transform="rotate(-25 ${hx} ${hy})"><rect x="${hx - 12}" y="${hy - 170}" width="24" height="190" fill="#9AA6B2" ${O}/><path d="M${hx - 36},${hy - 200} a36,36 0 1 0 72,0 l-16,0 0,20 -40,0 0,-20z" fill="#9AA6B2" ${O}/></g>`,
      spoon: `<g transform="rotate(-15 ${hx} ${hy})"><rect x="${hx - 8}" y="${hy - 170}" width="16" height="190" fill="#D2A060" ${O}/><ellipse cx="${hx}" cy="${hy - 190}" rx="34" ry="46" fill="#D2A060" ${O}/></g>` };
    if (epic && kind === 'sword') { hx = 420; hy = 450;
      P.sword = `<g transform="rotate(10 ${hx} ${hy})"><rect x="${hx - 50}" y="${hy - 330}" width="100" height="330" rx="20" fill="#7FE8FF" opacity="0.35"/>
<path d="M${hx - 30},${hy - 10} L${hx - 30},${hy - 290} L${hx},${hy - 330} L${hx + 30},${hy - 290} L${hx + 30},${hy - 10}Z" fill="url(#sw)" ${O}/><line x1="${hx}" y1="${hy - 300}" x2="${hx}" y2="${hy - 20}" stroke="#7FE8FF" stroke-width="6"/>
<rect x="${hx - 70}" y="${hy - 16}" width="140" height="28" rx="8" fill="#C9A227" ${O}/><rect x="${hx - 14}" y="${hy + 10}" width="28" height="60" fill="#5A3A22" ${O}/><circle cx="${hx}" cy="${hy + 76}" r="16" fill="#C9A227" ${O}/></g>`; }
    g.push(P[kind] || ''); g.push(`<circle cx="${hx}" cy="${hy}" r="30" fill="${skin}" ${O}/>`); return g.join('\n'); }
  function sparkles(r, n, col = '#FFFFFF') { const out = [];
    for (let k = 0; k < n; k++) { let x, y, s; while (true) { x = r.rng(30, 482); y = r.rng(30, 300); s = r.rng(10, 22); if (!(120 < x && x < 392 && 70 < y && y < 330)) break; }
      out.push(`<path d="M${f0(x)},${f0(y - s)} Q${f0(x)},${f0(y)} ${f0(x + s)},${f0(y)} Q${f0(x)},${f0(y)} ${f0(x)},${f0(y + s)} Q${f0(x)},${f0(y)} ${f0(x - s)},${f0(y)} Q${f0(x)},${f0(y)} ${f0(x)},${f0(y - s)}Z" fill="${col}" stroke="${OL}" stroke-width="3"/>`); }
    return out.join('\n'); }
  function scarf() { const out = RAINBOW.map((c, i) => `<rect x="${180 + i * 26}" y="318" width="26" height="40" fill="${c}"/>`);
    out.push(`<rect x="180" y="318" width="156" height="40" rx="14" fill="none" ${O}/>`); out.push(`<path d="M300,350 L330,440 L290,446 L276,355Z" fill="${RAINBOW[0]}" ${O}/>`); return out.join('\n'); }
  function renderPortrait({ name, race, cls, isWes }) {
    if (!RACES[race]) race = 'Human'; if (!CLASSES[cls]) cls = 'Derp';
    const r = new Rng(name), R = RACES[race], C = { ...CLASSES[cls] };
    const skin = r.pick(R.skin), hair = r.pick(R.hair);
    if (!isWes) C.c = jitter(C.c, r.rng(-0.04, 0.04));
    const [dy, sc] = R.h, epic = !!isWes, L = [epic ? bgEpic(r) : bgSilly(r)];
    if (!epic) L.push(sparkles(r, Math.trunc(r.rng(5, 9))));
    const fig = []; if (epic) fig.push(cape());
    fig.push(body(skin, C, epic));
    if (R.feat.includes('tail')) fig.push(`<path d="M140,500 C60,470 60,400 90,380 L110,370 L100,395" fill="none" ${O}/>`);
    if (!epic) fig.push(scarf());
    if (C.hat === 'hood') fig.push(hat('hood', C));
    fig.push(head(race, skin, hair, epic)); fig.push(beard(race, hair));
    fig.push(epic ? faceEpic(race, skin) : faceSilly(r, race, skin));
    if (C.hat && C.hat !== 'hood') fig.push(hat(C.hat, C));
    fig.push(prop(C.prop, C, skin, epic));
    const tf = `translate(${(256 * (1 - sc)).toFixed(1)},${(dy + 512 * (1 - sc) * 0.4).toFixed(1)}) scale(${sc})`;
    L.push(`<g transform="${tf}">` + fig.join('\n') + '</g>');
    if (epic) L.push(sparkles(r, 4, '#FFE9A8'));
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">\n' + L.join('\n') + '\n</svg>';
  }
  // App race ids (Teacher keys) -> Artist's 9 portrait races. Subraces share a look; no new art.
  const RACE_MAP = { human: 'Human', dwarf_hill: 'Dwarf', dwarf_mountain: 'Dwarf', elf_high: 'Elf', elf_wood: 'Elf', halfling_lightfoot: 'Halfling', halfling_stout: 'Halfling',
    gnome_rock: 'Gnome', gnome_forest: 'Gnome', half_elf: 'Half-Elf', half_orc: 'Half-Orc', dragonborn: 'Dragonborn', tiefling: 'Tiefling' };
  const forSheet = sh => renderPortrait({ name: sh.name, race: RACE_MAP[sh.race] || 'Human', cls: sh.class === 'derp' ? 'Derp' : sh.class[0].toUpperCase() + sh.class.slice(1), isWes: sh.is_wes });
  const api = { renderPortrait, forSheet, RACE_MAP, sha256 };
  if (typeof module !== 'undefined') module.exports = api; else root.Portrait = api;
})(this);
