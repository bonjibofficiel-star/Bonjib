// Bonjib - serveur de livraison (Node.js, sans dépendances)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PIN = String(process.env.DRIVER_PIN || '1234'); // CHANGE-LE avec la variable DRIVER_PIN
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_FILE = path.join(DATA_DIR, 'data.json');
// Fichiers publics (tous à la racine, seuls ceux-ci sont servis)
const ALLOWED = new Set(['index.html', 'driver.html', 'manifest.webmanifest', 'driver.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png', 'icon-driver-192.png', 'icon-driver-512.png']);

let db = { orders: {}, driver: null };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch {}
const save = () => { try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch (e) { console.error('save error', e.message); } };

const STATUSES = ['nouvelle', 'acceptee', 'recuperee', 'en_route', 'livree', 'annulee'];
const ACTIVE = ['acceptee', 'recuperee', 'en_route'];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json'
};

const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};

const readBody = (req) => new Promise((resolve) => {
  let d = '';
  req.on('data', (c) => { d += c; if (d.length > 1e5) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  req.on('error', () => resolve({}));
});

const clean = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

// Ce que le client a le droit de voir
const publicOrder = (o) => ({
  id: o.id, status: o.status, pickup: o.pickup, dropoff: o.dropoff, desc: o.desc,
  createdAt: o.createdAt, updatedAt: o.updatedAt,
  driver: ACTIVE.includes(o.status) && db.driver ? { lat: db.driver.lat, lng: db.driver.lng, at: db.driver.at } : null
});

const isDriver = (req) => {
  const a = Buffer.from(String(req.headers['x-pin'] || ''));
  const b = Buffer.from(PIN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// anti-spam simple: 10 commandes / 10 min par IP
const hits = new Map();
const tooMany = (ip) => {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 600000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 10;
};

async function api(req, res, url) {
  const p = url.pathname;

  if (req.method === 'POST' && p === '/api/orders') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    if (tooMany(ip)) return send(res, 429, { error: 'Trop de commandes, réessaie plus tard.' });
    const b = await readBody(req);
    const name = clean(b.name, 80), phone = clean(b.phone, 30);
    const pickup = { address: clean(b.pickup && b.pickup.address), lat: num(b.pickup && b.pickup.lat), lng: num(b.pickup && b.pickup.lng) };
    const dropoff = { address: clean(b.dropoff && b.dropoff.address), lat: num(b.dropoff && b.dropoff.lat), lng: num(b.dropoff && b.dropoff.lng) };
    if (!name || !phone || !pickup.address || !dropoff.address) return send(res, 400, { error: 'Remplis le nom, le téléphone et les deux adresses.' });
    const id = crypto.randomBytes(4).toString('hex');
    const now = Date.now();
    db.orders[id] = { id, name, phone, pickup, dropoff, desc: clean(b.desc, 500), status: 'nouvelle', createdAt: now, updatedAt: now };
    save();
    return send(res, 201, { id });
  }

  let m = p.match(/^\/api\/orders\/([a-f0-9]{8})$/);
  if (req.method === 'GET' && m) {
    const o = db.orders[m[1]];
    return o ? send(res, 200, publicOrder(o)) : send(res, 404, { error: 'Commande introuvable' });
  }

  if (p.startsWith('/api/driver/')) {
    if (!isDriver(req)) return send(res, 401, { error: 'Code incorrect' });

    if (req.method === 'GET' && p === '/api/driver/orders') {
      const limit = Date.now() - 24 * 3600 * 1000;
      const list = Object.values(db.orders)
        .filter((o) => o.updatedAt > limit || ACTIVE.includes(o.status) || o.status === 'nouvelle')
        .sort((a, b) => b.createdAt - a.createdAt);
      return send(res, 200, { orders: list });
    }

    m = p.match(/^\/api\/driver\/orders\/([a-f0-9]{8})\/status$/);
    if (req.method === 'POST' && m) {
      const o = db.orders[m[1]];
      if (!o) return send(res, 404, { error: 'Commande introuvable' });
      const b = await readBody(req);
      if (!STATUSES.includes(b.status)) return send(res, 400, { error: 'Statut invalide' });
      o.status = b.status; o.updatedAt = Date.now(); save();
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && p === '/api/driver/location') {
      const b = await readBody(req);
      const lat = num(b.lat), lng = num(b.lng);
      if (lat == null || lng == null) return send(res, 400, { error: 'Position invalide' });
      db.driver = { lat, lng, at: Date.now() }; save();
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'Not found' });
  }
  return send(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (rel === '/driver') rel = '/driver.html';
  const name = rel.slice(1);
  if (!ALLOWED.has(name)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Introuvable'); }
  const file = path.join(__dirname, name);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Introuvable'); }
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || name === 'sw.js' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Erreur serveur' });
  }
}).listen(PORT, () => console.log(`Bonjib prêt sur http://localhost:${PORT}  (livreur: /driver, code: ${PIN === '1234' ? '1234 - À CHANGER' : 'défini'})`));
