/* Muthunagar Karuvadu: storefront */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  let config = { bulkThresholdKg: 5, minOrder: 300, freeDeliveryAbove: 1500, codEnabled: true, codFee: 40, whatsappNumber: '', bulkWhatsappNumber: '', upiId: '' };
  let products = [];
  let cart = store.get('mk_cart', []);
  const pick = {}; // productId -> { variant, qty }
  let view = 'cart';
  let lastOrder = store.get('mk_last_order', null);
  let pinInfo = null;
  let filter = 'all';

  // Remember where the visitor came from (e.g. Instagram DM links: ?src=ig)
  const params = new URLSearchParams(location.search);
  const src = params.get('src') || params.get('utm_source');
  if (src) try { sessionStorage.setItem('mk_src', src.slice(0, 60)); } catch {}
  const source = () => { try { return sessionStorage.getItem('mk_src') || (document.referrer.includes('instagram') ? 'instagram' : ''); } catch { return ''; } };

  // ----------------------------------------------------------------------
  // Fish illustrations: hand-drawn feel, no photos needed
  // ----------------------------------------------------------------------
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function salt(seed, n, box) {
    let s = seed, out = '';
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < n; i++) out += `<circle cx="${(box[0] + rnd() * box[2]).toFixed(1)}" cy="${(box[1] + rnd() * box[3]).toFixed(1)}" r="${(0.6 + rnd() * 1.1).toFixed(1)}" fill="#fff" opacity=".7"/>`;
    return out;
  }
  const string = (xs, to = 44) => xs.map((x) => `<path d="M${x} 0V${to}" stroke="#7b5a37" stroke-width="1.6"/><circle cx="${x}" cy="${to}" r="2.2" fill="#7b5a37"/>`).join('');

  function fishBody(c, shark = false) {
    const dk = shade(c, -0.22), lt = shade(c, 0.18);
    return `
      <path d="M196 70 L232 ${shark ? 36 : 44} Q222 70 232 ${shark ? 100 : 96} Z" fill="${dk}"/>
      ${shark ? `<path d="M96 42 L126 6 L140 44 Z" fill="${dk}"/>` : `<path d="M88 42 Q120 16 152 46" fill="${dk}"/>`}
      <path d="M${shark ? 6 : 14} 72 C40 34 120 26 200 66 C150 108 50 112 ${shark ? 6 : 14} 72Z" fill="${c}"/>
      <path d="M34 84 C80 102 140 98 188 74" stroke="${lt}" stroke-width="5" fill="none" opacity=".6" stroke-linecap="round"/>
      <path d="M58 52 Q70 72 58 92" stroke="${dk}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      ${shark ? '' : [80, 104, 128, 152].map((x) => `<path d="M${x} 56 q8 8 0 16 M${x + 10} 62 q8 8 0 16" stroke="${dk}" stroke-width="1.2" fill="none" opacity=".45"/>`).join('')}
      <path d="M96 92 Q110 112 124 94" fill="${dk}" opacity=".8"/>
      <circle cx="${shark ? 30 : 36}" cy="66" r="5.5" fill="#fbf3e3"/><circle cx="${shark ? 30 : 36}" cy="66" r="2.8" fill="#1d1a16"/>
      ${salt(c.length * 7 + (shark ? 3 : 1), 22, [40, 50, 150, 40])}`;
  }
  function smallFish(x, y, s, r, c) {
    return `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">
      <path d="M-30 0 C-18 -11 12 -12 22 -2 L32 -9 Q29 0 32 9 L22 2 C12 12 -18 11 -30 0Z" fill="${c}"/>
      <path d="M-20 3 C-6 8 8 7 18 2" stroke="${shade(c, 0.2)}" stroke-width="1.6" fill="none"/>
      <circle cx="-22" cy="-1" r="1.8" fill="#1d1a16"/></g>`;
  }
  function art(p) {
    const c = p.color || '#cbb48a';
    let inner = '';
    switch (p.art) {
      case 'cluster':
        inner = string([60, 180], 30) +
          [[60, 50, 1.25, -8], [130, 44, 1.1, 6], [190, 58, 1.2, -4], [80, 92, 1.15, 10], [150, 96, 1.3, -6], [110, 70, 1.05, 2], [196, 104, 1, 12]]
            .map(([x, y, s, r], i) => smallFish(x, y, s, r, i % 2 ? c : shade(c, -0.06))).join('') + salt(11, 18, [30, 30, 190, 90]);
        break;
      case 'ribbon': {
        const dk = shade(c, -0.25);
        inner = string([40, 120, 200], 50) + [0, 26].map((o) => `
          <path d="M12 ${66 + o} C60 ${40 + o} 100 ${104 + o} 150 ${70 + o} S 214 ${48 + o} 232 ${64 + o}" stroke="${c}" stroke-width="15" fill="none" stroke-linecap="round"/>
          <path d="M14 ${66 + o} C60 ${42 + o} 100 ${104 + o} 150 ${72 + o} S 214 ${50 + o} 230 ${64 + o}" stroke="${dk}" stroke-width="1.4" fill="none" opacity=".6"/>
          <path d="M6 ${62 + o} l14 4 -12 6z" fill="${dk}"/><circle cx="16" cy="${64 + o}" r="2.2" fill="#1d1a16"/>`).join('') + salt(5, 16, [20, 50, 200, 50]);
        break;
      }
      case 'squid': {
        const dk = shade(c, -0.2);
        inner = string([110, 190], 46) + `
          ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M46 ${62 + i * 4} C30 ${54 + i * 6} 20 ${70 + i * 3} 6 ${58 + i * 7}" stroke="${dk}" stroke-width="3" fill="none" stroke-linecap="round"/>`).join('')}
          <path d="M44 72 C44 44 150 38 192 60 L226 46 L216 72 L226 98 L192 84 C150 106 44 100 44 72Z" fill="${c}"/>
          <path d="M60 72 H186" stroke="${dk}" stroke-width="1.4" opacity=".5"/>
          ${[80, 110, 140, 168].map((x) => `<ellipse cx="${x}" cy="72" rx="9" ry="16" fill="none" stroke="${shade(c, -0.12)}" stroke-width="1.4" opacity=".6"/>`).join('')}
          <circle cx="56" cy="64" r="4" fill="#1d1a16"/>${salt(9, 20, [60, 50, 140, 40])}`;
        break;
      }
      case 'prawn': {
        const one = (x, y, s, r) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">
          ${[0, 1, 2, 3, 4, 5].map((i) => { const a = (-150 + i * 40) * Math.PI / 180; return `<ellipse cx="${(Math.cos(a) * 26).toFixed(1)}" cy="${(Math.sin(a) * 26).toFixed(1)}" rx="${11 - i}" ry="${13 - i}" fill="${i % 2 ? c : shade(c, -0.08)}" stroke="${shade(c, -0.25)}" stroke-width="1"/>`; }).join('')}
          <path d="M-24 -14 C-46 -30 -58 -18 -70 -30 M-26 -10 C-48 -18 -60 -6 -72 -14" stroke="${shade(c, -0.3)}" stroke-width="1.4" fill="none"/>
          <circle cx="-28" cy="-16" r="2" fill="#1d1a16"/></g>`;
        inner = string([70, 170], 34) + one(80, 80, 1.15, 10) + one(170, 76, 1, -12) + one(126, 108, .85, 30);
        break;
      }
      case 'shark':
        inner = string([70, 160], 40) + fishBody(c, true);
        break;
      default:
        inner = string([80, 160], 42) + fishBody(c);
    }
    return `<svg viewBox="0 0 240 140" role="img" aria-label="${esc(p.name)}">${inner}</svg>`;
  }
  const visual = (p) => (p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />` : art(p));

  // ----------------------------------------------------------------------
  // Data
  // ----------------------------------------------------------------------
  async function api(path, opts = {}) {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  async function load() {
    try {
      [config, products] = await Promise.all([api('/api/config'), api('/api/products')]);
    } catch (e) {
      $('#grid').innerHTML = `<div class="loading">Couldn't load the catalogue. Please refresh the page.</div>`;
      return;
    }
    $$('[data-bulk-kg]').forEach((el) => (el.textContent = config.bulkThresholdKg));
    if (config.instagram) $('#igLink').href = config.instagram;
    // drop items that no longer exist
    cart = cart.filter((l) => products.some((p) => p.id === l.productId && p.variants.some((v) => v.label === l.variant)));
    saveCart();
    renderMarquee();
    renderGrid();
    route();
  }

  function renderMarquee() {
    const items = products.map((p) => `<span>${esc(p.english)}</span><span class="ta" lang="ta">${esc(p.tamil)}</span>`).join('');
    $('#marquee').innerHTML = items + items;
  }

  // ----------------------------------------------------------------------
  // Product grid
  // ----------------------------------------------------------------------
  function getPick(p) {
    if (!pick[p.id]) pick[p.id] = { variant: p.variants[Math.min(1, p.variants.length - 1)].label, qty: 1 };
    return pick[p.id];
  }

  function cardHTML(p) {
    const s = getPick(p);
    const v = p.variants.find((x) => x.label === s.variant) || p.variants[0];
    return `
      <article class="card ${p.inStock ? '' : 'soldout'}" id="product-${esc(p.id)}" data-id="${esc(p.id)}">
        ${p.inStock ? (p.tag ? `<span class="tag">${esc(p.tag)}</span>` : '') : '<span class="tag sold">Sold out</span>'}
        <button class="card-art" data-quick="${esc(p.id)}" aria-label="View ${esc(p.name)}">${visual(p)}</button>
        <div class="card-body">
          <div class="card-title"><h3>${esc(p.name.replace(' Karuvadu', ''))}</h3><span class="ta" lang="ta">${esc(p.tamil)}</span></div>
          <p class="card-sub">${esc(p.english)}</p>
          <p class="card-desc">${esc(p.description)}</p>
          <div class="best">${(p.bestFor || []).map((b) => `<span>${esc(b)}</span>`).join('')}</div>
          <div class="variants" role="radiogroup" aria-label="Pack size">
            ${p.variants.map((x) => `<button class="variant ${x.label === v.label ? 'on' : ''}" role="radio" aria-checked="${x.label === v.label}" data-variant="${esc(x.label)}">${esc(x.label)}<b>${inr(x.price)}</b></button>`).join('')}
          </div>
          <div class="buy-row">
            <div class="qty" aria-label="Quantity"><button data-step="-1" aria-label="Less">−</button><span>${s.qty}</span><button data-step="1" aria-label="More">+</button></div>
            <button class="btn btn-primary add-btn" data-add ${p.inStock ? '' : 'disabled'}>${p.inStock ? `Add · ${inr(v.price * s.qty)}` : 'Back soon'}</button>
          </div>
        </div>
      </article>`;
  }

  function renderGrid() {
    const list = products.filter((p) => filter === 'all' || (p.bestFor || []).includes(filter));
    $('#grid').innerHTML = list.map(cardHTML).join('') || '<div class="loading">Nothing here right now.</div>';
  }

  function refreshCard(id) {
    const p = products.find((x) => x.id === id);
    const el = document.getElementById('product-' + id);
    if (p && el) el.outerHTML = cardHTML(p);
  }

  $('#grid').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const p = products.find((x) => x.id === card.dataset.id);
    const s = getPick(p);
    const vb = e.target.closest('[data-variant]');
    const step = e.target.closest('[data-step]');
    if (vb) { s.variant = vb.dataset.variant; refreshCard(p.id); }
    else if (step) { s.qty = Math.max(1, Math.min(20, s.qty + Number(step.dataset.step))); refreshCard(p.id); }
    else if (e.target.closest('[data-add]')) { addToCart(p.id, s.variant, s.qty, e.target.closest('[data-add]')); s.qty = 1; refreshCard(p.id); }
  });

  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    $$('#filters .chip').forEach((c) => { c.classList.toggle('active', c === b); c.setAttribute('aria-selected', c === b); });
    renderGrid();
  });

  // ----------------------------------------------------------------------
  // Cart
  // ----------------------------------------------------------------------
  function saveCart() { store.set('mk_cart', cart); updateBadges(); }
  function lineInfo(l) {
    const p = products.find((x) => x.id === l.productId);
    const v = p && p.variants.find((x) => x.label === l.variant);
    return p && v ? { p, v, total: v.price * l.qty, grams: v.grams * l.qty } : null;
  }
  function cartTotals() {
    let subtotal = 0, grams = 0, count = 0;
    cart.forEach((l) => { const i = lineInfo(l); if (i) { subtotal += i.total; grams += i.grams; count += l.qty; } });
    return { subtotal, grams, count };
  }

  function addToCart(productId, variant, qty, fromEl) {
    const ex = cart.find((l) => l.productId === productId && l.variant === variant);
    if (ex) ex.qty = Math.min(20, ex.qty + qty); else cart.push({ productId, variant, qty });
    saveCart();
    const p = products.find((x) => x.id === productId);
    flyToCart(fromEl);
    toast(`Added ${p.name.replace(' Karuvadu', '')} · ${variant}`);
    const badge = $('#cartCount');
    badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump');
  }

  function flyToCart(fromEl) {
    if (!fromEl || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = fromEl.getBoundingClientRect();
    const b = $('#cartBtn').getBoundingClientRect();
    const dot = document.createElement('div');
    dot.style.cssText = `position:fixed;z-index:90;left:${a.left + a.width / 2 - 14}px;top:${a.top}px;width:28px;height:28px;border-radius:50%;background:#e8a317;box-shadow:0 0 0 4px rgba(232,163,23,.3);pointer-events:none;transition:transform .7s cubic-bezier(.5,-0.4,.6,1),opacity .7s`;
    document.body.appendChild(dot);
    requestAnimationFrame(() => {
      dot.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top - a.top}px) scale(.4)`;
      dot.style.opacity = '.2';
    });
    setTimeout(() => dot.remove(), 750);
  }

  function updateBadges() {
    const { subtotal, count } = cartTotals();
    const badge = $('#cartCount');
    badge.textContent = count;
    badge.hidden = count === 0;
    const mc = $('#mobileCart');
    mc.hidden = count === 0 || $('#drawer').classList.contains('open');
    $('#mobileCartText').textContent = `${count} item${count === 1 ? '' : 's'} · View cart`;
    $('#mobileCartTotal').textContent = inr(subtotal);
  }

  // ----------------------------------------------------------------------
  // Drawer (cart → details → pay)
  // ----------------------------------------------------------------------
  const drawer = $('#drawer'), scrim = $('#scrim');
  function openDrawer(v = 'cart') {
    view = v;
    renderDrawer();
    scrim.hidden = false;
    requestAnimationFrame(() => { scrim.classList.add('on'); drawer.classList.add('open'); });
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    updateBadges();
    setTimeout(() => $('#drawerClose').focus(), 50);
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    scrim.classList.remove('on');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(() => (scrim.hidden = true), 300);
    if (view === 'done') view = 'cart';
    updateBadges();
  }
  $('#cartBtn').addEventListener('click', () => openDrawer(lastOrder && view === 'done' ? 'done' : 'cart'));
  $('#mobileCart').addEventListener('click', () => openDrawer('cart'));
  $('#drawerClose').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  $('#drawerBack').addEventListener('click', () => { view = 'cart'; renderDrawer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });

  function setSteps(i) { $$('#stepsBar span').forEach((s, n) => s.classList.toggle('on', n <= i)); }

  function bulkWaLink(extra = '') {
    const lines = cart.map((l) => { const i = lineInfo(l); return i ? `• ${i.p.name} ${l.variant} × ${l.qty}` : ''; }).filter(Boolean).join('\n');
    const text = `Hi! Bulk order enquiry from the website.\n${lines}${extra}\n\nName:\nCity:\nBusiness (if any):`;
    return `https://wa.me/${config.bulkWhatsappNumber}?text=${encodeURIComponent(text)}`;
  }

  function renderDrawer() {
    const body = $('#drawerBody'), foot = $('#drawerFoot');
    $('#drawerBack').hidden = view !== 'details';
    if (view === 'cart') renderCartView(body, foot);
    else if (view === 'details') renderDetailsView(body, foot);
    else renderDoneView(body, foot);
    body.scrollTop = 0;
  }

  function renderCartView(body, foot) {
    $('#drawerTitle').textContent = 'Your cart';
    setSteps(0);
    if (!cart.length) {
      body.innerHTML = `<div class="empty">
        <svg viewBox="0 0 240 140">${string([80, 160], 42)}<path d="M14 72 C40 34 120 26 200 66 C150 108 50 112 14 72Z M196 70 L232 44 Q222 70 232 96 Z" fill="none" stroke="#7b5a37" stroke-width="2" stroke-dasharray="5 5"/></svg>
        <p><b>Your cart is empty.</b><br/>The racks are full, though.</p>
        <button class="btn btn-primary" id="goShop">Browse the catch</button></div>`;
      foot.innerHTML = '';
      $('#goShop').onclick = () => { closeDrawer(); document.getElementById('shop').scrollIntoView(); };
      return;
    }
    const t = cartTotals();
    const bulk = t.grams > config.bulkThresholdKg * 1000;
    const toFree = Math.max(0, config.freeDeliveryAbove - t.subtotal);
    body.innerHTML = `
      ${bulk ? `<div class="notice bulk-n"><b>That's a bulk order (${(t.grams / 1000).toFixed(1)} kg).</b><br/>Orders above ${config.bulkThresholdKg} kg get wholesale pricing. Send it to us on WhatsApp and we'll quote you.<br/><br/><a class="btn btn-wa btn-block" target="_blank" rel="noopener" href="${bulkWaLink()}">Get bulk price on WhatsApp</a></div>` : ''}
      ${cart.map((l, idx) => { const i = lineInfo(l); if (!i) return ''; return `
        <div class="line-item" data-idx="${idx}">
          <div class="line-thumb">${visual(i.p)}</div>
          <div><div class="line-name">${esc(i.p.name)}</div><div class="line-meta">${esc(l.variant)} · ${inr(i.v.price)} each${i.p.inStock ? '' : ' · <b style="color:#b3361a">Sold out</b>'}</div></div>
          <div class="line-right"><b>${inr(i.total)}</b>
            <div class="qty"><button data-q="-1" aria-label="Less">−</button><span>${l.qty}</span><button data-q="1" aria-label="More">+</button></div>
            <button class="remove" data-remove>Remove</button></div>
        </div>`; }).join('')}
      <div class="progress-free" style="margin-top:16px">${toFree > 0 ? `Add <b>${inr(toFree)}</b> more for <b>free delivery</b>` : '🎉 You get <b>free delivery</b>'}
        <div class="bar"><i style="width:${Math.min(100, (t.subtotal / config.freeDeliveryAbove) * 100)}%"></i></div></div>`;
    const soldOut = cart.some((l) => !lineInfo(l)?.p.inStock);
    const underMin = t.subtotal < config.minOrder;
    foot.innerHTML = `
      <div class="totals"><div class="grand"><span>Subtotal</span><span>${inr(t.subtotal)}</span></div></div>
      ${underMin ? `<p class="tiny">Minimum order is ${inr(config.minOrder)}.</p>` : ''}
      ${soldOut ? `<p class="tiny" style="color:#b3361a">Please remove sold-out items to continue.</p>` : ''}
      <button class="btn btn-accent btn-block" id="toDetails" ${bulk || underMin || soldOut ? 'disabled' : ''}>Checkout →</button>`;
    body.onclick = (e) => {
      const row = e.target.closest('.line-item'); if (!row) return;
      const l = cart[row.dataset.idx];
      if (e.target.closest('[data-remove]')) cart.splice(row.dataset.idx, 1);
      else if (e.target.closest('[data-q]')) { l.qty += Number(e.target.closest('[data-q]').dataset.q); if (l.qty < 1) cart.splice(row.dataset.idx, 1); if (l.qty > 20) l.qty = 20; }
      else return;
      saveCart(); renderDrawer();
    };
    $('#toDetails').onclick = () => { view = 'details'; renderDrawer(); };
  }

  function renderDetailsView(body, foot) {
    $('#drawerTitle').textContent = 'Delivery details';
    setSteps(1);
    const f = store.get('mk_customer', {});
    const upi = !!config.upiId;
    const pay = store.get('mk_pay', upi ? 'upi' : 'cod');
    body.onclick = null;
    body.innerHTML = `
      <form class="form" id="checkoutForm" novalidate>
        <div class="row">
          <label>Full name<input name="name" autocomplete="name" required value="${esc(f.name)}" /></label>
          <label>Mobile number<input name="phone" type="tel" inputmode="numeric" autocomplete="tel" required maxlength="14" placeholder="10-digit" value="${esc(f.phone)}" /></label>
        </div>
        <label>Pincode<input name="pincode" inputmode="numeric" autocomplete="postal-code" required maxlength="6" value="${esc(f.pincode)}" /><span class="hint" id="pinHint">We deliver across India</span></label>
        <label>House / street / area<textarea name="address" rows="2" autocomplete="street-address" required>${esc(f.address)}</textarea></label>
        <label>Landmark (optional)<input name="landmark" value="${esc(f.landmark)}" /></label>
        <div class="row">
          <label>City<input name="city" autocomplete="address-level2" required value="${esc(f.city)}" /></label>
          <label>State<input name="state" autocomplete="address-level1" value="${esc(f.state || 'Tamil Nadu')}" /></label>
        </div>
        <label>Email (optional, for a receipt)<input name="email" type="email" autocomplete="email" value="${esc(f.email)}" /></label>
        <label>Note for us (optional)<input name="note" placeholder="e.g. Extra cleaning, gift pack" /></label>
        <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off" /></label>

        <div class="section-label">Payment</div>
        <div class="pay-options">
          ${upi ? `<label class="pay-opt"><input type="radio" name="pay" value="upi" ${pay === 'upi' ? 'checked' : ''}/><span><b>UPI: GPay, PhonePe, Paytm</b><small>Scan a QR or tap to pay once your order is placed.</small></span></label>` : ''}
          ${config.codEnabled ? `<label class="pay-opt"><input type="radio" name="pay" value="cod" ${pay === 'cod' || !upi ? 'checked' : ''}/><span><b>Cash on delivery</b><small>${config.codFee ? `${inr(config.codFee)} COD handling fee.` : 'Pay when it arrives.'}</small></span></label>` : ''}
        </div>
        <div id="formErr"></div>
      </form>`;
    const form = $('#checkoutForm');
    const pin = form.pincode;
    const updateTotals = () => {
      const t = cartTotals();
      const payM = form.pay ? (form.querySelector('[name=pay]:checked') || {}).value : 'cod';
      const del = pinInfo ? (t.subtotal >= config.freeDeliveryAbove ? 0 : pinInfo.fee) : null;
      const cod = payM === 'cod' ? config.codFee : 0;
      foot.innerHTML = `
        <div class="totals">
          <div><span>Subtotal</span><span>${inr(t.subtotal)}</span></div>
          <div><span>Delivery${pinInfo ? ` · ${esc(pinInfo.days)}` : ''}</span><span class="${del === 0 ? 'free' : ''}">${del === null ? 'Enter pincode' : del === 0 ? 'FREE' : inr(del)}</span></div>
          ${cod ? `<div><span>COD fee</span><span>${inr(cod)}</span></div>` : ''}
          <div class="grand"><span>Total</span><span>${inr(t.subtotal + (del || 0) + cod)}</span></div>
        </div>
        <button class="btn btn-accent btn-block" id="placeOrder" type="button">${payM === 'upi' ? 'Place order & pay' : 'Place order'} · ${inr(t.subtotal + (del || 0) + cod)}</button>
        <p class="tiny">🔒 Your details are only used to deliver this order.</p>`;
      $('#placeOrder').onclick = () => placeOrder(form);
    };
    const checkPin = async () => {
      const v = pin.value.replace(/\D/g, '');
      pin.value = v;
      const hint = $('#pinHint');
      pinInfo = null;
      if (v.length === 6) {
        try {
          pinInfo = await api('/api/pincode/' + v);
          hint.className = 'hint ok';
          hint.textContent = `✓ We deliver to ${pinInfo.name} in ${pinInfo.days}`;
          autofillCity(v, form);
        } catch (e) { hint.className = 'hint err'; hint.textContent = e.message; }
      } else { hint.className = 'hint'; hint.textContent = 'We deliver across India'; }
      updateTotals();
    };
    pin.addEventListener('input', checkPin);
    form.addEventListener('change', (e) => { if (e.target.name === 'pay') { store.set('mk_pay', e.target.value); updateTotals(); } });
    form.addEventListener('input', () => {
      const d = Object.fromEntries(new FormData(form));
      delete d.note; delete d.website; delete d.pay;
      store.set('mk_customer', d);
    });
    updateTotals();
    if (pin.value) checkPin();
  }

  let pinFetchCtl;
  async function autofillCity(pin, form) {
    // Best-effort city/state lookup from India Post's public directory
    if (form.city.value && form.state.value && form.state.value !== 'Tamil Nadu') return;
    try {
      pinFetchCtl?.abort();
      pinFetchCtl = new AbortController();
      const t = setTimeout(() => pinFetchCtl.abort(), 4000);
      const r = await fetch('https://api.postalpincode.in/pincode/' + pin, { signal: pinFetchCtl.signal });
      clearTimeout(t);
      const d = await r.json();
      const po = d?.[0]?.PostOffice?.[0];
      if (po) {
        if (!form.city.value) form.city.value = po.District;
        form.state.value = po.State;
        form.dispatchEvent(new Event('input'));
      }
    } catch { /* optional */ }
  }

  async function placeOrder(form) {
    const err = $('#formErr');
    err.innerHTML = '';
    const d = Object.fromEntries(new FormData(form));
    const btn = $('#placeOrder');
    const fail = (m) => { err.innerHTML = `<div class="notice err">${esc(m)}</div>`; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    if (!d.name || d.name.trim().length < 2) return fail('Please enter your name.'), form.name.focus();
    if (!/^(\+?91)?[6-9]\d{9}$/.test(d.phone.replace(/[\s-]/g, ''))) return fail('Please enter a valid 10-digit mobile number.'), form.phone.focus();
    if (!pinInfo) return fail('Please enter a valid 6-digit pincode.'), form.pincode.focus();
    if (!d.address || d.address.trim().length < 8) return fail('Please enter your full address.'), form.address.focus();
    if (!d.city) return fail('Please enter your city.'), form.city.focus();
    btn.disabled = true;
    btn.textContent = 'Placing your order…';
    try {
      const res = await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cart,
          paymentMethod: d.pay || 'cod',
          customer: { name: d.name, phone: d.phone, email: d.email, address: d.address, landmark: d.landmark, city: d.city, state: d.state, pincode: d.pincode },
          note: d.note, website: d.website, source: source(),
        }),
      });
      lastOrder = { ...res.order, phone: res.phone };
      store.set('mk_last_order', lastOrder);
      cart = [];
      saveCart();
      view = 'done';
      renderDrawer();
    } catch (e) {
      fail(e.message);
      btn.disabled = false;
      btn.textContent = 'Try again';
      if (/sold out|no longer/i.test(e.message)) load();
    }
  }

  function upiLink(o) {
    const q = new URLSearchParams({ pa: config.upiId, pn: config.upiName || 'Muthunagar Karuvadu', am: String(o.total), cu: 'INR', tn: `Order ${o.id}` });
    return 'upi://pay?' + q.toString().replace(/\+/g, '%20');
  }

  function renderDoneView(body, foot) {
    const o = lastOrder;
    $('#drawerTitle').textContent = 'Order placed';
    setSteps(2);
    $('#drawerBack').hidden = true;
    body.onclick = null;
    const isUpi = o.paymentMethod === 'upi' && config.upiId;
    const paidSubmitted = ['submitted', 'paid'].includes(o.paymentStatus);
    body.innerHTML = `
      <div class="done">
        <div class="done-badge"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#0b2a3c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h3 style="font-size:1.6rem;margin-bottom:.2em">Nandri, ${esc(o.customer.name.split(' ')[0])}! 🙏</h3>
        <p class="muted" style="margin-bottom:.4em">Your order ID</p>
        <div class="order-id"><span id="oid">${esc(o.id)}</span><button id="copyId" type="button">Copy</button></div>
        ${isUpi ? (paidSubmitted ? `
          <div class="notice" style="background:#e5f4ea;border:1.5px solid #8fcca5"><b>Payment reference received.</b> We'll verify it and confirm your order shortly.</div>` : `
          <div class="upi-box">
            <p style="margin:0" class="muted">Pay to confirm your order</p>
            <div class="amt">${inr(o.total)}</div>
            <a class="btn btn-primary btn-block" href="${esc(upiLink(o))}" id="upiBtn">Pay with UPI app</a>
            <p class="tiny" style="margin-top:10px">On a computer? Scan with any UPI app:</p>
            <div id="upiQr" aria-label="UPI QR code"></div>
            <div class="upi-id">${esc(config.upiId)}</div>
            <div class="upi-apps"><span>GPay</span>·<span>PhonePe</span>·<span>Paytm</span>·<span>BHIM</span></div>
          </div>
          <form class="form" id="utrForm" style="text-align:left">
            <label>After paying, enter the UPI reference / UTR number<input name="utr" inputmode="numeric" placeholder="12-digit UTR from your payment app" required /></label>
            <button class="btn btn-accent" type="submit">I've paid: confirm</button>
            <div id="utrErr"></div>
          </form>`) : `
          <div class="notice" style="background:#e5f4ea;border:1.5px solid #8fcca5;text-align:left"><b>Cash on delivery.</b> Please keep <b>${inr(o.total)}</b> ready when it arrives. We'll start packing right away.</div>`}
        <div class="totals" style="text-align:left;margin-top:16px">
          ${o.lines.map((l) => `<div><span>${esc(l.name)} · ${esc(l.variant)} × ${l.qty}</span><span>${inr(l.lineTotal)}</span></div>`).join('')}
          <div><span>Delivery (${esc(o.zone?.days || '')})</span><span>${o.delivery ? inr(o.delivery) : 'FREE'}</span></div>
          ${o.codFee ? `<div><span>COD fee</span><span>${inr(o.codFee)}</span></div>` : ''}
          <div class="grand"><span>Total</span><span>${inr(o.total)}</span></div>
        </div>
        <p class="tiny" style="margin-top:14px">Save your order ID. Use it with your mobile number to track your parcel at any time.</p>
        <div style="display:grid;gap:10px;margin-top:18px">
          <button class="btn btn-ghost btn-block" id="trackThis">Track this order</button>
          <button class="link-btn" id="keepShopping">Keep shopping</button>
        </div>
      </div>`;
    foot.innerHTML = '';
    $('#copyId').onclick = () => { navigator.clipboard?.writeText(o.id).then(() => toast('Order ID copied')); };
    $('#trackThis').onclick = () => { closeDrawer(); openTrack(o.id, o.phone); };
    $('#keepShopping').onclick = () => { closeDrawer(); view = 'cart'; };
    const qrEl = $('#upiQr');
    if (qrEl) qrEl.innerHTML = `<img alt="UPI QR code for ${esc(o.id)}" width="180" height="180" src="/api/orders/${encodeURIComponent(o.id)}/upi.svg?phone=${encodeURIComponent(o.phone)}" />`;
    const utr = $('#utrForm');
    if (utr) utr.onsubmit = async (e) => {
      e.preventDefault();
      const b = utr.querySelector('button');
      b.disabled = true;
      try {
        const r = await api(`/api/orders/${o.id}/payment`, { method: 'POST', body: JSON.stringify({ phone: o.phone, upiRef: utr.utr.value.trim() }) });
        lastOrder = { ...r.order, phone: o.phone };
        store.set('mk_last_order', lastOrder);
        renderDrawer();
        toast('Thank you! We will confirm shortly.');
      } catch (er) { $('#utrErr').innerHTML = `<div class="notice err">${esc(er.message)}</div>`; b.disabled = false; }
    };
  }

  // ----------------------------------------------------------------------
  // Quick view (used by Instagram links: /p/<product>)
  // ----------------------------------------------------------------------
  const quick = $('#quickView');
  function openQuick(id) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    const s = getPick(p);
    const render = () => {
      const v = p.variants.find((x) => x.label === s.variant) || p.variants[0];
      $('#quickBody').innerHTML = `
        <div class="quick-art card-art">${visual(p)}</div>
        <p class="eyebrow" style="margin-bottom:.3em">${esc(p.english)} · <span lang="ta">${esc(p.tamil)}</span></p>
        <h2>${esc(p.name)}</h2>
        <p>${esc(p.description)}</p>
        <div class="best" style="margin-bottom:16px">${(p.bestFor || []).map((b) => `<span>${esc(b)}</span>`).join('')}</div>
        ${p.inStock ? `
        <div class="variants" style="margin-bottom:14px">${p.variants.map((x) => `<button class="variant ${x.label === v.label ? 'on' : ''}" data-v="${esc(x.label)}">${esc(x.label)}<b>${inr(x.price)}</b></button>`).join('')}</div>
        <div class="buy-row" style="margin-bottom:10px">
          <div class="qty"><button data-s="-1" aria-label="Less">−</button><span>${s.qty}</span><button data-s="1" aria-label="More">+</button></div>
          <button class="btn btn-ghost add-btn" data-qadd>Add to cart</button>
        </div>
        <button class="btn btn-accent btn-block" data-qbuy>Buy now · ${inr(v.price * s.qty)}</button>`
        : `<div class="notice bulk-n"><b>Sold out this week.</b> A fresh batch is drying on the racks right now. Check back soon!</div>`}`;
    };
    render();
    quick.onclick = (e) => {
      if (e.target === quick || e.target.closest('[data-close]')) return quick.close();
      const vb = e.target.closest('[data-v]'), st = e.target.closest('[data-s]');
      if (vb) { s.variant = vb.dataset.v; render(); }
      else if (st) { s.qty = Math.max(1, Math.min(20, s.qty + Number(st.dataset.s))); render(); }
      else if (e.target.closest('[data-qadd]')) { addToCart(p.id, s.variant, s.qty, e.target.closest('[data-qadd]')); s.qty = 1; quick.close(); refreshCard(p.id); }
      else if (e.target.closest('[data-qbuy]')) { addToCart(p.id, s.variant, s.qty); s.qty = 1; quick.close(); refreshCard(p.id); openDrawer('cart'); }
    };
    if (!quick.open) quick.showModal();
  }
  quick.addEventListener('close', () => { if (location.pathname.startsWith('/p/')) history.replaceState(null, '', '/' + location.search); });
  document.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]');
    if (q) { e.preventDefault(); openQuick(q.dataset.quick); }
  });

  // ----------------------------------------------------------------------
  // Track order
  // ----------------------------------------------------------------------
  const trackModal = $('#trackModal');
  const STATUS_FLOW = [
    ['new', 'Order received'], ['confirmed', 'Confirmed'], ['packed', 'Packed & sealed'], ['shipped', 'Shipped'], ['delivered', 'Delivered'],
  ];
  function openTrack(id = '', phone = '') {
    const f = $('#trackForm');
    if (id) f.id.value = id;
    if (phone) f.phone.value = phone;
    else if (lastOrder && (!id || id === lastOrder.id)) { f.id.value = f.id.value || lastOrder.id; f.phone.value = lastOrder.phone; }
    $('#trackResult').innerHTML = '';
    if (!trackModal.open) trackModal.showModal();
    if (f.id.value && f.phone.value) f.requestSubmit();
  }
  trackModal.addEventListener('click', (e) => { if (e.target === trackModal || e.target.closest('[data-close]')) trackModal.close(); });
  trackModal.addEventListener('close', () => { if (location.pathname.startsWith('/track')) history.replaceState(null, '', '/'); });
  $$('[data-open-track]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openTrack(); }));
  $('#trackForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, out = $('#trackResult');
    out.innerHTML = '<p class="muted">Looking up your order…</p>';
    try {
      const { order: o } = await api(`/api/orders/${encodeURIComponent(f.id.value.trim().toUpperCase())}?phone=${encodeURIComponent(f.phone.value)}`);
      const when = (s) => o.history.find((h) => h.status === s)?.at;
      const fmt = (t) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      const curIdx = STATUS_FLOW.findIndex(([s]) => s === o.status);
      const payTxt = { pending: 'Awaiting UPI payment', submitted: 'Payment being verified', paid: 'Paid ✓', cod: 'Cash on delivery', refunded: 'Refunded' }[o.paymentStatus] || '';
      out.innerHTML = o.status === 'cancelled'
        ? `<div class="notice err" style="margin-top:16px">Order <b>${esc(o.id)}</b> was cancelled. If this is unexpected, please contact us.</div>`
        : `<div style="margin-top:18px"><b>${esc(o.id)}</b> · ${inr(o.total)} · <span class="muted">${esc(payTxt)}</span>
          <ul class="timeline">${STATUS_FLOW.map(([s, label], i) => `<li class="${i <= curIdx ? 'done-s' : ''} ${i === curIdx ? 'cur' : ''}">${label}${when(s) ? `<small>${fmt(when(s))}</small>` : ''}</li>`).join('')}</ul>
          ${o.trackingUrl ? `<a class="btn btn-primary btn-block" target="_blank" rel="noopener" href="${esc(o.trackingUrl)}">Track with courier →</a>` : ''}
          ${o.paymentStatus === 'pending' && lastOrder?.id === o.id ? `<button class="btn btn-accent btn-block" style="margin-top:10px" id="payNow">Complete payment</button>` : ''}</div>`;
      const pn = $('#payNow');
      if (pn) pn.onclick = () => { trackModal.close(); lastOrder = { ...lastOrder, ...o }; openDrawer('done'); };
    } catch (er) { out.innerHTML = `<div class="notice err" style="margin-top:16px">${esc(er.message)}</div>`; }
  });

  // ----------------------------------------------------------------------
  // Bulk enquiry → WhatsApp
  // ----------------------------------------------------------------------
  $('#bulkForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const text = `Hi! Bulk order enquiry from the website.\n\nBusiness: ${d.biz || '-'}\nNeed: ${d.items}\nCity: ${d.city}\nFrequency: ${d.freq}`;
    window.open(`https://wa.me/${config.bulkWhatsappNumber}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  });

  // ----------------------------------------------------------------------
  // Routing for shareable links
  // ----------------------------------------------------------------------
  function route() {
    const m = location.pathname.match(/^\/p\/([\w-]+)/);
    if (m) {
      const id = m[1].toLowerCase();
      const card = document.getElementById('product-' + id);
      if (card) { card.scrollIntoView({ block: 'center' }); card.classList.add('highlight'); }
      openQuick(id);
      return;
    }
    const t = location.pathname.match(/^\/track(?:\/([\w-]+))?/);
    if (t) openTrack(t[1] ? t[1].toUpperCase() : '');
  }

  // ----------------------------------------------------------------------
  // Ambient motion
  // ----------------------------------------------------------------------
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('on'), 2200);
  }

  const nav = $('#nav'), sun = $('#sun'), process = $('#process'), pathSun = $('.sunpath');
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY;
      nav.classList.toggle('scrolled', y > 40);
      if (y < innerHeight * 1.2) sun.style.setProperty('--sun', (-y * 0.25).toFixed(1));
      const r = process.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * 0.75 - r.top) / (r.height * 0.8)));
      pathSun.style.setProperty('--p', p.toFixed(3));
      ticking = false;
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.15 });
  $$('.reveal').forEach((el) => io.observe(el));

  $('#year').textContent = new Date().getFullYear();
  updateBadges();
  load();
})();
