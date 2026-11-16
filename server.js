'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

// ---------------------------------------------------------------------------
// Configuration (all overridable with Railway variables)
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const CONFIG = {
  businessName: process.env.BUSINESS_NAME || 'Muthunagar Karuvadu',
  whatsappNumber: (process.env.WHATSAPP_NUMBER || '919999999999').replace(/\D/g, ''),
  bulkWhatsappNumber: (process.env.BULK_WHATSAPP_NUMBER || process.env.WHATSAPP_NUMBER || '919999999999').replace(/\D/g, ''),
  upiId: process.env.UPI_ID || '',
  upiName: process.env.UPI_NAME || process.env.BUSINESS_NAME || 'Muthunagar Karuvadu',
  instagram: process.env.INSTAGRAM_URL || 'https://www.instagram.com/',
  bulkThresholdKg: Number(process.env.BULK_THRESHOLD_KG) || 5,
  minOrder: Number(process.env.MIN_ORDER) || 300,
  freeDeliveryAbove: Number(process.env.FREE_DELIVERY_ABOVE) || 1500,
  codEnabled: process.env.COD_ENABLED !== 'false',
  codFee: Number(process.env.COD_FEE ?? 40),
};

// Delivery zones by Indian pincode prefix.
const ZONES = [
  { id: 'tn', name: 'Tamil Nadu & Puducherry', test: (p) => /^6[0-4]/.test(p), fee: 60, days: '2–4 days' },
  { id: 'south', name: 'South India', test: (p) => /^(5[0-9]|6[7-9])/.test(p), fee: 90, days: '3–5 days' },
  { id: 'india', name: 'Rest of India', test: (p) => /^[1-9]/.test(p), fee: 150, days: '4–7 days' },
];

function zoneFor(pincode) {
  const p = String(pincode || '').trim();
  if (!/^[1-9][0-9]{5}$/.test(p)) return null;
  return ZONES.find((z) => z.test(p)) || null;
}

const STATUSES = ['new', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];

// ---------------------------------------------------------------------------
// Tiny JSON-file store with serialized, atomic writes
// ---------------------------------------------------------------------------
fs.mkdirSync(DATA_DIR, { recursive: true });
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

let writeChain = Promise.resolve();
function writeJson(file, data) {
  const job = writeChain.then(() => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  });
  // keep the chain alive even if one write fails
  writeChain = job.catch((e) => console.error('[store] write failed:', e.message));
  return job;
}

let products = readJson(PRODUCTS_FILE, null);
if (!Array.isArray(products)) {
  products = readJson(path.join(__dirname, 'catalog.default.json'), []);
  writeJson(PRODUCTS_FILE, products);
}
let orders = readJson(ORDERS_FILE, []);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function newOrderId() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id;
  do {
    let s = '';
    for (const b of crypto.randomBytes(4)) s += alphabet[b % alphabet.length];
    id = `MK${ymd}-${s}`;
  } while (orders.some((o) => o.id === id));
  return id;
}

function priceCart(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Your cart is empty.');
  if (items.length > 40) throw new Error('Too many items in one order.');
  const lines = [];
  let subtotal = 0;
  let grams = 0;
  for (const raw of items) {
    const product = products.find((p) => p.id === raw.productId);
    if (!product) throw new Error('One of the items is no longer available.');
    if (!product.inStock) throw new Error(`${product.name} just sold out. Please remove it from your cart.`);
    const variant = product.variants.find((v) => v.label === raw.variant);
    if (!variant) throw new Error(`Please choose a pack size for ${product.name}.`);
    const qty = Math.floor(Number(raw.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 20) throw new Error('Invalid quantity.');
    const lineTotal = variant.price * qty;
    subtotal += lineTotal;
    grams += variant.grams * qty;
    lines.push({ productId: product.id, name: product.name, tamil: product.tamil, variant: variant.label, grams: variant.grams, price: variant.price, qty, lineTotal });
  }
  return { lines, subtotal, grams };
}

function quote(items, pincode, payment) {
  const { lines, subtotal, grams } = priceCart(items);
  const zone = zoneFor(pincode);
  const delivery = zone ? (subtotal >= CONFIG.freeDeliveryAbove ? 0 : zone.fee) : null;
  const codFee = payment === 'cod' ? CONFIG.codFee : 0;
  const total = subtotal + (delivery ?? 0) + codFee;
  return { lines, subtotal, grams, zone: zone && { id: zone.id, name: zone.name, days: zone.days }, delivery, codFee, total };
}

function publicOrder(o) {
  return {
    id: o.id,
    createdAt: o.createdAt,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    lines: o.lines,
    subtotal: o.subtotal,
    delivery: o.delivery,
    codFee: o.codFee,
    total: o.total,
    zone: o.zone,
    trackingUrl: o.trackingUrl || '',
    customer: { name: o.customer.name, city: o.customer.city, pincode: o.customer.pincode },
    history: o.history,
  };
}

// Simple in-memory rate limiter
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.path}|${req.ip}`;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
    arr.push(now);
    hits.set(key, arr);
    next();
  };
}
setInterval(() => hits.clear(), 60 * 60 * 1000).unref();

// Admin auth: bearer token derived from the password
function adminToken() {
  return crypto.createHmac('sha256', ADMIN_PASSWORD).update('mk-admin-v1').digest('hex');
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin is disabled. Set the ADMIN_PASSWORD variable on Railway.' });
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(token, adminToken())) return res.status(401).json({ error: 'Please log in again.' });
  next();
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/api/config', (req, res) => {
  res.json({ ...CONFIG, zones: ZONES.map(({ id, name, fee, days }) => ({ id, name, fee, days })) });
});

app.get('/api/products', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(products);
});

app.get('/api/pincode/:pin', (req, res) => {
  const zone = zoneFor(req.params.pin);
  if (!zone) return res.status(400).json({ error: 'Enter a valid 6-digit pincode.' });
  res.json({ zone: zone.id, name: zone.name, fee: zone.fee, days: zone.days, freeAbove: CONFIG.freeDeliveryAbove });
});

app.post('/api/quote', (req, res) => {
  try {
    res.json(quote(req.body.items, req.body.pincode, req.body.paymentMethod));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/orders', rateLimit(8, 10 * 60 * 1000), async (req, res) => {
  try {
    const b = req.body || {};
    if (b.website) return res.status(400).json({ error: 'Invalid request.' }); // honeypot

    const customer = {
      name: clean(b.customer?.name, 80),
      phone: clean(b.customer?.phone, 20).replace(/[^\d+]/g, ''),
      email: clean(b.customer?.email, 120),
      address: clean(b.customer?.address, 400),
      landmark: clean(b.customer?.landmark, 120),
      city: clean(b.customer?.city, 80),
      state: clean(b.customer?.state, 80),
      pincode: clean(b.customer?.pincode, 6),
    };
    const phoneDigits = customer.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    if (customer.name.length < 2) throw new Error('Please enter your name.');
    if (!/^[6-9]\d{9}$/.test(phoneDigits)) throw new Error('Please enter a valid 10-digit mobile number.');
    if (customer.address.length < 8) throw new Error('Please enter your full delivery address.');
    if (!customer.city) throw new Error('Please enter your city.');
    if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new Error('Please check your email address.');
    customer.phone = phoneDigits;

    const paymentMethod = b.paymentMethod === 'cod' ? 'cod' : 'upi';
    if (paymentMethod === 'cod' && !CONFIG.codEnabled) throw new Error('Cash on delivery is not available right now.');
    if (paymentMethod === 'upi' && !CONFIG.upiId) throw new Error('UPI payment is not set up yet. Please choose cash on delivery.');

    const q = quote(b.items, customer.pincode, paymentMethod);
    if (!q.zone) throw new Error('Please enter a valid 6-digit pincode.');
    if (q.subtotal < CONFIG.minOrder) throw new Error(`Minimum order is ₹${CONFIG.minOrder}.`);
    if (q.grams > CONFIG.bulkThresholdKg * 1000) {
      throw new Error(`Orders above ${CONFIG.bulkThresholdKg} kg are bulk orders. Please contact us on WhatsApp for bulk pricing.`);
    }

    const now = new Date().toISOString();
    const order = {
      id: newOrderId(),
      createdAt: now,
      status: 'new',
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'cod' : 'pending',
      upiRef: '',
      customer,
      note: clean(b.note, 300),
      source: clean(b.source, 60),
      lines: q.lines,
      grams: q.grams,
      subtotal: q.subtotal,
      delivery: q.delivery,
      codFee: q.codFee,
      total: q.total,
      zone: q.zone,
      trackingUrl: '',
      history: [{ status: 'new', at: now }],
    };
    orders.push(order);
    try {
      await writeJson(ORDERS_FILE, orders);
    } catch {
      orders = orders.filter((x) => x !== order);
      throw new Error('We could not save your order. Please try again in a minute.');
    }
    console.log(`[order] ${order.id} ₹${order.total} ${order.paymentMethod} ${customer.city}`);
    res.status(201).json({ order: publicOrder(order), phone: order.customer.phone });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Customer submits UPI transaction reference after paying
app.post('/api/orders/:id/payment', rateLimit(10, 10 * 60 * 1000), async (req, res) => {
  const o = orders.find((x) => x.id === String(req.params.id).toUpperCase());
  const phone = clean(req.body?.phone, 20).replace(/\D/g, '').slice(-10);
  if (!o || o.customer.phone !== phone) return res.status(404).json({ error: 'Order not found.' });
  const ref = clean(req.body?.upiRef, 40);
  if (!/^[A-Za-z0-9]{6,40}$/.test(ref)) return res.status(400).json({ error: 'Enter the UPI transaction / UTR number from your payment app.' });
  o.upiRef = ref;
  if (o.paymentStatus === 'pending') o.paymentStatus = 'submitted';
  await writeJson(ORDERS_FILE, orders);
  res.json({ order: publicOrder(o) });
});

function upiUri(o) {
  const q = new URLSearchParams({ pa: CONFIG.upiId, pn: CONFIG.upiName, am: String(o.total), cu: 'INR', tn: `Order ${o.id}` });
  return 'upi://pay?' + q.toString().replace(/\+/g, '%20');
}

// UPI QR for an order (generated server-side: no third-party CDN needed)
app.get('/api/orders/:id/upi.svg', rateLimit(60, 10 * 60 * 1000), async (req, res) => {
  const o = orders.find((x) => x.id === String(req.params.id).toUpperCase());
  const phone = String(req.query.phone || '').replace(/\D/g, '').slice(-10);
  if (!o || o.customer.phone !== phone || !CONFIG.upiId) return res.status(404).end();
  const svg = await QRCode.toString(upiUri(o), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b2a3c', light: '#ffffff' } });
  res.set('Cache-Control', 'private, max-age=3600').type('image/svg+xml').send(svg);
});

app.get('/api/orders/:id', rateLimit(30, 10 * 60 * 1000), (req, res) => {
  const o = orders.find((x) => x.id === String(req.params.id).trim().toUpperCase());
  const phone = String(req.query.phone || '').replace(/\D/g, '').slice(-10);
  if (!o || o.customer.phone !== phone) return res.status(404).json({ error: 'No order found with that ID and mobile number.' });
  res.json({ order: publicOrder(o) });
});

// ----------------------------- Admin ---------------------------------------
app.post('/api/admin/login', rateLimit(10, 15 * 60 * 1000), (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin is disabled. Set the ADMIN_PASSWORD variable on Railway.' });
  if (!safeEqual(String(req.body?.password || ''), ADMIN_PASSWORD)) return res.status(401).json({ error: 'Wrong password.' });
  res.json({ token: adminToken() });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json([...orders].reverse());
});

app.patch('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  const o = orders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  const { status, paymentStatus, trackingUrl, adminNote } = req.body || {};
  if (status !== undefined) {
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    if (status !== o.status) {
      o.status = status;
      o.history.push({ status, at: new Date().toISOString() });
    }
  }
  if (paymentStatus !== undefined) {
    if (!['pending', 'submitted', 'paid', 'cod', 'refunded'].includes(paymentStatus)) return res.status(400).json({ error: 'Invalid payment status.' });
    o.paymentStatus = paymentStatus;
  }
  if (trackingUrl !== undefined) o.trackingUrl = clean(trackingUrl, 300);
  if (adminNote !== undefined) o.adminNote = clean(adminNote, 500);
  await writeJson(ORDERS_FILE, orders);
  res.json(o);
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const p = products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  const b = req.body || {};
  if (typeof b.inStock === 'boolean') p.inStock = b.inStock;
  if (b.image !== undefined) {
    const img = clean(b.image, 500);
    if (img && !/^https:\/\//.test(img)) return res.status(400).json({ error: 'Image must be an https:// link.' });
    p.image = img;
  }
  if (b.tag !== undefined) p.tag = clean(b.tag, 30);
  if (b.description !== undefined) p.description = clean(b.description, 400);
  if (Array.isArray(b.prices)) {
    b.prices.forEach((price, i) => {
      const n = Math.round(Number(price));
      if (p.variants[i] && Number.isFinite(n) && n > 0 && n < 100000) p.variants[i].price = n;
    });
  }
  await writeJson(PRODUCTS_FILE, products);
  res.json(p);
});

// ----------------------------- Static --------------------------------------
const PUBLIC = path.join(__dirname, 'public');
app.use(express.static(PUBLIC, { extensions: ['html'], maxAge: '1h' }));
// Shareable product links for Instagram DMs: /p/nethili opens that product
app.get('/p/:slug', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
app.get(['/track', '/track/:id'], (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC, 'index.html')));

app.listen(PORT, () => {
  console.log(`${CONFIG.businessName} listening on :${PORT} (data: ${DATA_DIR})`);
  if (!ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD is not set: /admin is disabled.');
  if (!CONFIG.upiId) console.warn('UPI_ID is not set: only cash on delivery will be offered.');
});
