/* Wine shop — progressive enhancement, no dependencies.
   Every feature works without JS (plain forms); JS adds AJAX cart, drawers, steppers … */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const base = document.body.dataset.base?.replace(/\/$/, '') || '';
  const csrf = () => $('meta[name="csrf-token"]')?.content || '';

  const post = async (url, data) => {
    const res = await fetch(url, {
      method: 'POST',
      body: data,
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf(), Accept: 'application/json' },
      credentials: 'same-origin',
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  };

  // ---- toast -----------------------------------------------------------
  const toastEl = $('[data-toast]');
  let toastTimer;
  const toast = (msg) => {
    if (!toastEl || !msg) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2800);
  };

  // ---- header ----------------------------------------------------------
  const header = $('[data-header]');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  const nav = $('[data-nav]');
  $('[data-nav-open]')?.addEventListener('click', () => nav?.classList.add('is-open'));
  $('[data-nav-close]')?.addEventListener('click', () => nav?.classList.remove('is-open'));

  const search = $('[data-search]');
  $('[data-search-open]')?.addEventListener('click', () => { search?.classList.add('is-open'); $('input', search)?.focus(); });
  $('[data-search-close]')?.addEventListener('click', () => search?.classList.remove('is-open'));

  // ---- drawer (mini cart) ---------------------------------------------
  const drawer = $('[data-drawer]');
  const panel = $('[data-drawer-panel]');
  const openDrawer = async (html) => {
    if (!drawer) return;
    if (html) panel.innerHTML = html;
    else {
      const r = await fetch(base + '/cart/drawer', { credentials: 'same-origin' });
      panel.innerHTML = await r.text();
    }
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    $('[data-drawer-close]', panel)?.focus();
  };
  const closeDrawer = () => { drawer?.classList.remove('is-open'); drawer?.setAttribute('aria-hidden', 'true'); };
  drawer?.addEventListener('click', (e) => { if (e.target.closest('[data-drawer-close]')) closeDrawer(); });
  $('[data-cart-open]')?.addEventListener('click', (e) => {
    if (window.matchMedia('(min-width: 641px)').matches) { e.preventDefault(); openDrawer(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDrawer(); nav?.classList.remove('is-open'); search?.classList.remove('is-open'); $('[data-filters]')?.classList.remove('is-open'); }
  });

  const setCount = (n) => {
    const el = $('[data-cart-count]');
    if (!el) return;
    el.textContent = n;
    el.hidden = !n;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  };

  // ---- add to cart -----------------------------------------------------
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-add-to-cart]');
    if (!form) return;
    e.preventDefault();
    const data = new FormData(form, e.submitter);
    const btn = e.submitter || $('button', form);
    btn?.setAttribute('disabled', '');
    try {
      const { ok, json } = await post(form.action, data);
      if (ok && json.ok) { setCount(json.count); openDrawer(json.drawer); }
      else toast(json.message || json.error || 'Error');
    } catch { form.submit(); }
    finally { btn?.removeAttribute('disabled'); }
  });

  // ---- wishlist --------------------------------------------------------
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-wishlist]');
    if (!form) return;
    e.preventDefault();
    const { status, json } = await post(form.action, new FormData(form));
    if (status === 401 && json.login) { location.href = json.login; return; }
    $('button', form)?.classList.toggle('is-active', !!json.active);
  });

  // ---- generic ajax forms (newsletter) --------------------------------
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-ajax-form]');
    if (!form) return;
    e.preventDefault();
    const { json } = await post(form.action, new FormData(form));
    toast(json.message);
    if (json.ok) form.reset();
  });

  // ---- steppers --------------------------------------------------------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const input = $('input', b.closest('[data-stepper]'));
    const min = Number(input.min || 0), max = Number(input.max || 9999);
    input.value = Math.min(max, Math.max(min, Number(input.value || 0) + Number(b.dataset.step)));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Cart page: auto update after quantity change.
  let cartTimer;
  $$('[data-autosubmit-debounce]').forEach((i) => i.addEventListener('change', () => {
    clearTimeout(cartTimer);
    cartTimer = setTimeout(() => i.form.requestSubmit(), 600);
  }));
  $$('[data-autosubmit]').forEach((s) => s.addEventListener('change', () => s.form.submit()));

  // ---- filters (mobile sheet + instant apply on desktop) --------------
  const filters = $('[data-filters]');
  $('[data-filters-open]')?.addEventListener('click', () => filters?.classList.add('is-open'));
  $('[data-filters-close]')?.addEventListener('click', () => filters?.classList.remove('is-open'));
  filters?.addEventListener('click', (e) => { if (e.target === filters) filters.classList.remove('is-open'); });
  $('[data-filter-form]')?.addEventListener('change', (e) => {
    if (window.matchMedia('(min-width: 981px)').matches && e.target.type === 'checkbox') e.currentTarget.submit();
  });

  // ---- toggles ---------------------------------------------------------
  $$('[data-toggle]').forEach((cb) => {
    const target = $(cb.dataset.toggle);
    const sync = () => { if (target) target.hidden = !cb.checked; };
    cb.addEventListener('change', sync);
    sync();
  });

  // ---- tabs ------------------------------------------------------------
  $$('[data-tabs]').forEach((tabs) => {
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      $$('[data-tab]', tabs).forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      $$('[data-panel]', tabs).forEach((p) => { p.hidden = p.dataset.panel !== btn.dataset.tab; });
    });
  });

  // ---- checkout: live totals on shipping change ------------------------
  const totals = $('[data-totals]');
  $$('[data-shipping-radio]').forEach((r) => r.addEventListener('change', async () => {
    const res = await fetch(base + '/checkout/totals?shipping_method=' + encodeURIComponent(r.value), { credentials: 'same-origin' });
    if (res.ok && totals) totals.innerHTML = await res.text();
  }));

  // ---- B2B quick order -------------------------------------------------
  const rows = $('[data-quick-rows]');
  $('[data-add-row]')?.addEventListener('click', () => {
    const row = rows.firstElementChild.cloneNode(true);
    $$('input', row).forEach((i) => (i.value = ''));
    $('[data-sku-hint]', row).textContent = '';
    rows.appendChild(row);
    $('input', row).focus();
  });
  let skuTimer;
  rows?.addEventListener('input', (e) => {
    const input = e.target.closest('[data-sku-lookup]');
    if (!input || input.value.length < 2) return;
    clearTimeout(skuTimer);
    skuTimer = setTimeout(async () => {
      const r = await fetch(base + '/b2b/sku-lookup?q=' + encodeURIComponent(input.value), { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      const list = await r.json();
      const dl = $('#sku-suggest');
      dl.innerHTML = list.map((p) => `<option value="${p.sku}">${p.name} — ${p.price}</option>`).join('');
      const hit = list.find((p) => p.sku.toLowerCase() === input.value.toLowerCase());
      const hint = $('[data-sku-hint]', input.closest('.quick__row'));
      if (hint) hint.textContent = hit ? `${hit.name} · ${hit.price} · ${hit.stock}` : '';
    }, 250);
  });

  // ---- age gate --------------------------------------------------------
  const gate = $('[data-age-gate]');
  if (gate) {
    document.documentElement.style.overflow = 'hidden';
    $('[data-age-yes]', gate)?.addEventListener('click', async () => {
      const fd = new FormData();
      fd.append('_token', csrf());
      document.cookie = 'age_ok=1; path=/; max-age=' + 86400 * 90 + '; samesite=lax';
      post(base + '/age-confirm', fd).catch(() => {});
      gate.remove();
      document.documentElement.style.overflow = '';
    });
  }
})();
