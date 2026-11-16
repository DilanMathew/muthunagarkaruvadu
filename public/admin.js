(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const STATUSES = ['new', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
  const PAY = ['pending', 'submitted', 'paid', 'cod', 'refunded'];

  let token = '';
  try { token = localStorage.getItem('mk_admin') || ''; } catch {}
  let orders = [];
  let products = [];
  let filter = 'active';
  let q = '';

  async function api(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { logout(); throw new Error(data.error || 'Please log in.'); }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2000); }

  function showLogin() { $('#login').hidden = false; $('#app').hidden = true; }
  function logout() { token = ''; try { localStorage.removeItem('mk_admin'); } catch {} showLogin(); }
  $('#logout').onclick = logout;

  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    $('#loginErr').textContent = '';
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: e.target.password.value }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      token = d.token;
      try { localStorage.setItem('mk_admin', token); } catch {}
      start();
    } catch (er) { $('#loginErr').textContent = er.message; }
  };

  async function start() {
    try {
      [orders, products] = await Promise.all([api('/api/admin/orders'), fetch('/api/products').then((r) => r.json())]);
    } catch { return; }
    $('#login').hidden = true;
    $('#app').hidden = false;
    renderOrders();
    renderProducts();
  }

  // ------------------------------- Orders ----------------------------------
  function waLink(o) {
    const first = o.customer.name.split(' ')[0];
    const track = `${location.origin}/track/${o.id}`;
    let msg;
    if (o.paymentMethod === 'upi' && o.paymentStatus === 'pending') msg = `Vanakkam ${first}! 🙏 Thank you for your order ${o.id} (${inr(o.total)}) from Muthunagar Karuvadu. We haven't received your UPI payment yet. You can complete it here: ${track}`;
    else if (o.status === 'shipped') msg = `Vanakkam ${first}! 🚚 Your Muthunagar Karuvadu order ${o.id} has been shipped. ${o.trackingUrl ? `Courier tracking: ${o.trackingUrl}` : `Track: ${track}`}`;
    else if (o.status === 'delivered') msg = `Vanakkam ${first}! We hope you enjoy your karuvadu 🐟. If you liked it, please tag us on Instagram. Nandri!`;
    else msg = `Vanakkam ${first}! ✅ Your Muthunagar Karuvadu order ${o.id} (${inr(o.total)}) is confirmed. We'll pack it fresh and ship it soon. Track anytime: ${track}`;
    return `https://wa.me/91${o.customer.phone}?text=${encodeURIComponent(msg)}`;
  }

  function matches(o) {
    if (filter === 'active' && ['delivered', 'cancelled'].includes(o.status)) return false;
    if (filter === 'unpaid' && o.paymentStatus !== 'pending' && o.paymentStatus !== 'submitted') return false;
    if (STATUSES.includes(filter) && o.status !== filter) return false;
    if (!q) return true;
    const hay = `${o.id} ${o.customer.name} ${o.customer.phone} ${o.customer.city} ${o.customer.pincode}`.toLowerCase();
    return hay.includes(q);
  }

  function renderOrders() {
    const count = (fn) => orders.filter(fn).length;
    const chips = [
      ['active', 'Active', count((o) => !['delivered', 'cancelled'].includes(o.status))],
      ['new', 'New', count((o) => o.status === 'new')],
      ['unpaid', 'Check payment', count((o) => ['pending', 'submitted'].includes(o.paymentStatus))],
      ['confirmed', 'Confirmed', count((o) => o.status === 'confirmed')],
      ['packed', 'Packed', count((o) => o.status === 'packed')],
      ['shipped', 'Shipped', count((o) => o.status === 'shipped')],
      ['delivered', 'Delivered', count((o) => o.status === 'delivered')],
      ['all', 'All', orders.length],
    ];
    $('#statusFilter').innerHTML = chips.map(([k, l, n]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${l}<b>${n}</b></button>`).join('');
    const today = new Date().toDateString();
    const todays = orders.filter((o) => new Date(o.createdAt).toDateString() === today && o.status !== 'cancelled');
    $('#summary').textContent = `Today: ${todays.length} orders · ${inr(todays.reduce((s, o) => s + o.total, 0))}`;
    const newCount = count((o) => o.status === 'new');
    document.title = (newCount ? `(${newCount}) ` : '') + 'Orders · Muthunagar Karuvadu';

    const list = orders.filter(matches);
    $('#orders').innerHTML = list.length ? list.map((o) => `
      <article class="order s-${o.status}" data-id="${esc(o.id)}">
        <div class="o-head">
          <div><span class="o-id">${esc(o.id)}</span> · <span class="muted" style="display:inline">${new Date(o.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
            ${o.source ? ` · <span class="pill">${esc(o.source)}</span>` : ''}</div>
          <div class="o-total">${inr(o.total)}</div>
        </div>
        <div class="o-grid">
          <div>
            <h4>Customer</h4>
            <p><b>${esc(o.customer.name)}</b> · <a href="tel:+91${esc(o.customer.phone)}">${esc(o.customer.phone)}</a></p>
            <p>${esc(o.customer.address)}${o.customer.landmark ? `, ${esc(o.customer.landmark)}` : ''}</p>
            <p>${esc(o.customer.city)}, ${esc(o.customer.state)} – <b>${esc(o.customer.pincode)}</b></p>
            ${o.customer.email ? `<p>${esc(o.customer.email)}</p>` : ''}
            ${o.note ? `<p style="margin-top:6px">📝 <i>${esc(o.note)}</i></p>` : ''}
          </div>
          <div>
            <h4>Items · ${(o.grams / 1000).toFixed(2)} kg</h4>
            <ul class="o-items">${o.lines.map((l) => `<li>${esc(l.name)} <b>${esc(l.variant)} × ${l.qty}</b></li>`).join('')}</ul>
            <p class="muted" style="margin-top:4px">Delivery ${o.delivery ? inr(o.delivery) : 'free'}${o.codFee ? ` · COD ${inr(o.codFee)}` : ''}</p>
          </div>
          <div>
            <h4>Payment</h4>
            <p>${o.paymentMethod.toUpperCase()} <span class="pill ${o.paymentStatus}">${o.paymentStatus}</span></p>
            ${o.upiRef ? `<p>UTR: <b style="font-family:monospace">${esc(o.upiRef)}</b></p>` : ''}
            <select data-pay style="margin-top:6px">${PAY.map((p) => `<option ${p === o.paymentStatus ? 'selected' : ''}>${p}</option>`).join('')}</select>
          </div>
        </div>
        <div class="o-actions">
          <select data-status aria-label="Order status">${STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <input data-track placeholder="Courier tracking link (optional)" value="${esc(o.trackingUrl || '')}" />
          <a class="btn wa sm" target="_blank" rel="noopener" href="${waLink(o)}">WhatsApp customer</a>
          <button class="btn sm" data-copy>Copy address</button>
        </div>
      </article>`).join('') : '<div class="empty">No orders here yet. 🎣</div>';
  }

  $('#statusFilter').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; renderOrders(); } };
  $('#search').oninput = (e) => { q = e.target.value.trim().toLowerCase(); renderOrders(); };

  async function patch(id, body) {
    try {
      const updated = await api('/api/admin/orders/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(body) });
      orders = orders.map((o) => (o.id === id ? updated : o));
      renderOrders();
      toast('Saved');
    } catch (e) { toast(e.message); }
  }
  $('#orders').addEventListener('change', (e) => {
    const card = e.target.closest('.order'); if (!card) return;
    if (e.target.matches('[data-status]')) patch(card.dataset.id, { status: e.target.value });
    if (e.target.matches('[data-pay]')) patch(card.dataset.id, { paymentStatus: e.target.value });
    if (e.target.matches('[data-track]')) patch(card.dataset.id, { trackingUrl: e.target.value });
  });
  $('#orders').addEventListener('click', (e) => {
    const card = e.target.closest('.order'); if (!card || !e.target.matches('[data-copy]')) return;
    const o = orders.find((x) => x.id === card.dataset.id);
    const c = o.customer;
    const text = `${c.name}\n${c.address}${c.landmark ? ', ' + c.landmark : ''}\n${c.city}, ${c.state} - ${c.pincode}\nPh: ${c.phone}`;
    navigator.clipboard?.writeText(text).then(() => toast('Address copied'));
  });

  // ------------------------------- Products --------------------------------
  function renderProducts() {
    $('#products').innerHTML = products.map((p) => `
      <form class="product" data-id="${esc(p.id)}">
        <h3>${esc(p.name)}</h3>
        <label class="switch"><input type="checkbox" name="inStock" ${p.inStock ? 'checked' : ''}/> In stock</label>
        <div class="prices">${p.variants.map((v, i) => `<label>${esc(v.label)} ₹<input name="price${i}" type="number" min="1" value="${v.price}" /></label>`).join('')}</div>
        <label>Badge (optional)<input name="tag" value="${esc(p.tag || '')}" placeholder="e.g. Bestseller, Fresh batch" /></label>
        <label>Photo link (optional, https)<input name="image" value="${esc(p.image || '')}" placeholder="https://…/photo.jpg" /></label>
        <label>Description<textarea name="description" rows="2">${esc(p.description)}</textarea></label>
        <button class="btn primary" type="submit">Save</button>
      </form>`).join('');
  }
  $('#products').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const p = products.find((x) => x.id === f.dataset.id);
    const body = {
      inStock: f.inStock.checked,
      prices: p.variants.map((_, i) => Number(f['price' + i].value)),
      tag: f.tag.value, image: f.image.value.trim(), description: f.description.value,
    };
    try {
      const updated = await api('/api/admin/products/' + p.id, { method: 'PUT', body: JSON.stringify(body) });
      products = products.map((x) => (x.id === p.id ? updated : x));
      toast(`${p.name} saved`);
    } catch (er) { toast(er.message); }
  });
  $('#products').addEventListener('change', (e) => { if (e.target.name === 'inStock') e.target.form.requestSubmit(); });

  $$('.tab').forEach((t) => (t.onclick = () => {
    $$('.tab').forEach((x) => x.classList.toggle('on', x === t));
    $('#ordersTab').hidden = t.dataset.tab !== 'orders';
    $('#productsTab').hidden = t.dataset.tab !== 'products';
  }));
  $('#refresh').onclick = async () => { await start(); toast('Up to date'); };

  // Auto-refresh every 30s (skip while an input is focused)
  setInterval(async () => {
    if (!token || $('#app').hidden || document.activeElement?.matches('input, select, textarea')) return;
    try { orders = await api('/api/admin/orders'); renderOrders(); } catch {}
  }, 30000);

  token ? start().catch(showLogin) : showLogin();
  if (!token) showLogin();
})();
