// Seeds demo users, visits and synthetic photos through the public API (what a mobile app would do).
import { randomUUID } from 'node:crypto';
import { USERS } from './config.mjs';
import { apiRequire } from './stack.mjs';

export async function api(apiUrl, token, method, path, body) {
  const res = await fetch(`${apiUrl}/api/v1${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status} ${text}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export async function login(apiUrl, user) {
  const r = await api(apiUrl, null, 'POST', '/auth/login', { email: user.email, password: user.password });
  return r.accessToken;
}

const PALETTE = ['#1f6feb', '#2da44e', '#d29922', '#cf222e', '#8957e5', '#0b7285'];

/** Synthetic "equipment photo": rack, shelves and cables. Enough variation to tell photos apart. */
export async function makePhoto(label, seed) {
  const sharp = apiRequire('sharp');
  const w = 1600;
  const h = 1200;
  const rnd = (i) => (((Math.sin(seed * 97.13 + i * 12.9898) * 43758.5453) % 1) + 1) % 1;
  let shapes = '';
  for (let i = 0; i < 6; i++) {
    const y = 120 + i * 150;
    shapes += `<rect x="260" y="${y}" width="1080" height="110" rx="6" fill="#2b3138" stroke="#59636e" stroke-width="3"/>`;
    for (let p = 0; p < 24; p++) {
      shapes += `<rect x="${290 + p * 42}" y="${y + 20}" width="28" height="22" fill="${rnd(i * 31 + p) > 0.5 ? '#3fb950' : '#161b22'}"/>`;
    }
  }
  let cables = '';
  for (let c = 0; c < 14; c++) {
    const x1 = 300 + rnd(c) * 1000;
    const y1 = 140 + rnd(c + 50) * 800;
    const x2 = 300 + rnd(c + 100) * 1000;
    const y2 = 200 + rnd(c + 150) * 850;
    cables += `<path d="M${x1} ${y1} C ${x1 + 150} ${y1 + 200}, ${x2 - 150} ${y2 - 200}, ${x2} ${y2}" stroke="${PALETTE[c % PALETTE.length]}" stroke-width="9" fill="none" opacity="0.9"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d0d7de"/><stop offset="1" stop-color="#8c959f"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <rect x="200" y="60" width="1200" height="1040" fill="#0d1117" stroke="#30363d" stroke-width="10"/>
    ${shapes}${cables}
    <text x="800" y="1160" font-family="sans-serif" font-size="44" text-anchor="middle" fill="#0d1117">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

export async function uploadPhoto(apiUrl, token, { visitId, category, label, seed, capturedAt }) {
  const buf = await makePhoto(label, seed);
  const fd = new FormData();
  fd.set(
    'metadata',
    JSON.stringify({
      clientUuid: randomUUID(),
      visitId,
      category,
      capturedAt: capturedAt ?? new Date().toISOString(),
      gps: { lat: 30.0444 + seed * 0.0007, lng: 31.2357 + seed * 0.0005, accuracy: 6 },
      deviceInfo: { model: 'Pixel 7', os: 'Android 14', app: '0.1.0' },
    }),
  );
  fd.set('file', new Blob([buf], { type: 'image/jpeg' }), `${label}.jpg`);
  const res = await fetch(`${apiUrl}/api/v1/photos`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd });
  const text = await res.text();
  if (!res.ok) throw new Error(`upload ${label} -> ${res.status} ${text}`);
  return JSON.parse(text);
}

async function ensureUser(apiUrl, adminToken, u) {
  try {
    return await api(apiUrl, adminToken, 'POST', '/users', { email: u.email, name: u.name, password: u.password, role: u.role });
  } catch (e) {
    if (e.status === 409) return null;
    throw e;
  }
}

async function waitFor(fn, ms = 60000, every = 400) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, every));
  }
}

/**
 * Demo content: reviewer/pm/technician users, visits on the first seeded sites and ~15 photos.
 * After AI analysis: two are approved, one is rejected (open snags). The rest wait in the queue.
 */
export async function seedDemoData({ apiUrl, log = () => undefined }) {
  const adminToken = await login(apiUrl, USERS.admin);
  for (const u of [USERS.reviewer, USERS.pm, USERS.technician]) await ensureUser(apiUrl, adminToken, u);
  const users = await api(apiUrl, adminToken, 'GET', '/users?pageSize=100');
  const tech = users.items.find((u) => u.email === USERS.technician.email);
  const sites = await api(apiUrl, adminToken, 'GET', '/sites?pageSize=50');
  const site = sites.items[0];
  const site2 = sites.items[1] ?? site;
  const mkVisit = async (s, title) =>
    api(apiUrl, adminToken, 'POST', '/visits', { siteId: s.id, title, type: 'installation', technicianIds: [tech.id] });
  const visit = await mkVisit(site, 'Installation acceptance - round 1');
  const visit2 = site2.id === site.id ? visit : await mkVisit(site2, 'Installation acceptance');
  const techToken = await login(apiUrl, USERS.technician);

  const plan = [
    ['patch_cords', 3, visit],
    ['patch_cords', 2, visit2],
    ['odf_tie_labels', 2, visit],
    ['pdu', 1, visit],
    ['router', 3, visit],
    ['rack', 2, visit],
    ['duct', 1, visit],
    ['uplink', 1, visit],
  ];
  let seed = 1;
  let n = 0;
  const base = Date.now() - 3 * 3600_000;
  let total = 0;
  for (const [category, count, v] of plan) {
    for (let i = 0; i < count; i++) {
      await uploadPhoto(apiUrl, techToken, {
        visitId: v.id,
        category,
        label: `${category} ${i + 1}`,
        seed: seed++,
        capturedAt: new Date(base + n++ * 60_000).toISOString(),
      });
      total++;
    }
  }
  log(`[demo] uploaded ${total} photos`);
  await waitFor(async () => {
    const q = await api(apiUrl, adminToken, 'GET', '/reviews/queue?pageSize=200');
    return q.total >= total;
  });
  log('[demo] AI analysis done');

  const revToken = await login(apiUrl, USERS.reviewer);
  const queue = await api(apiUrl, revToken, 'GET', '/reviews/queue?pageSize=200');
  for (const p of queue.items.filter((i) => i.category === 'router').slice(0, 2)) {
    await api(apiUrl, revToken, 'POST', `/photos/${p.id}/reviews`, { decision: 'agree' });
    await api(apiUrl, revToken, 'POST', `/photos/${p.id}/approve`);
  }
  const rej = queue.items.find((i) => i.category === 'patch_cords');
  if (rej) {
    await api(apiUrl, revToken, 'POST', `/photos/${rej.id}/reviews`, { decision: 'agree' });
    await api(apiUrl, revToken, 'POST', `/photos/${rej.id}/reject`, { reason: 'Patch cords crossing, no velcro' });
  }
  log('[demo] demo history created');
  return { visit, visit2, site, site2 };
}
