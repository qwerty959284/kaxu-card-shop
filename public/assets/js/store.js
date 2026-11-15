/* 卡序 · 商城前台逻辑 */
(function () {
  const { $, $$, icon, money, escapeHtml, api, toast, hydrateIcons } = window.KX;

  const state = {
    products: [],
    category: '全部',
    current: null,
    qty: 1,
    submitting: false,
  };

  const el = {
    grid: $('#productGrid'),
    tabs: $('#categoryTabs'),
    modal: $('#purchaseModal'),
    close: $('#purchaseClose'),
    icon: $('#purchaseIcon'),
    category: $('#purchaseCategory'),
    title: $('#purchaseTitle'),
    desc: $('#purchaseDesc'),
    features: $('#purchaseFeatures'),
    stock: $('#purchaseStock'),
    qty: $('#qtyValue'),
    minus: $('#qtyMinus'),
    plus: $('#qtyPlus'),
    contact: $('#purchaseContact'),
    total: $('#purchaseTotal'),
    error: $('#purchaseError'),
    errorText: $('#purchaseErrorText'),
    submit: $('#checkoutBtn'),
    submitLabel: $('#checkoutLabel'),
  };

  const accentVar = (accent) => `var(--${accent || 'mint'})`;
  const iconName = (name) => name || 'card';

  const stockMarkup = (product) => {
    if (product.stock <= 0) {
      return `<span class="stock-pill out"><i></i>暂时缺货</span>`;
    }
    if (product.stock <= 5) {
      return `<span class="stock-pill low"><i></i>仅剩 ${product.stock} 张</span>`;
    }
    return `<span class="stock-pill"><i></i>库存 ${product.stock} 张</span>`;
  };

  const productMarkup = (product) => {
    const out = product.stock <= 0;
    const original =
      product.originalPriceCents && product.originalPriceCents > product.priceCents
        ? `<span class="price-original">${money(product.originalPriceCents)}</span>`
        : '';
    const features = (product.features || [])
      .slice(0, 3)
      .map((f) => `<span>${escapeHtml(f)}</span>`)
      .join('');
    return `
      <article class="product-card${out ? ' is-out' : ''}" data-product="${product.id}" style="--accent:${accentVar(product.accent)}" tabindex="0" role="button" aria-label="购买 ${escapeHtml(product.name)}">
        <div class="product-top">
          <span class="product-icon">${icon(iconName(product.icon), 23)}</span>
          ${product.badge ? `<span class="product-flag">${escapeHtml(product.badge)}</span>` : ''}
        </div>
        <span class="product-cat">${escapeHtml(product.category)}</span>
        <h3 class="product-name">${escapeHtml(product.name)}</h3>
        <p class="product-desc">${escapeHtml(product.description)}</p>
        <div class="product-features">${features}</div>
        <div class="product-foot">
          <div>
            <div class="price-wrap">
              <span class="price"><span class="currency">¥</span>${(product.priceCents / 100).toFixed(2)}</span>
              ${original}
            </div>
            <div style="margin-top:7px">${stockMarkup(product)}</div>
          </div>
          <span class="buy-orb" aria-hidden="true">${out ? icon('clock', 17) : icon('arrowUpRight', 17)}</span>
        </div>
      </article>`;
  };

  const render = () => {
    const list =
      state.category === '全部'
        ? state.products
        : state.products.filter((p) => p.category === state.category);

    if (!list.length) {
      el.grid.innerHTML = `
        <div class="empty-state products-empty">
          ${icon('box', 38)}
          <strong>这个分类暂时没有商品</strong>
          <p>补货后会第一时间出现在这里。</p>
        </div>`;
      return;
    }
    el.grid.innerHTML = list.map(productMarkup).join('');
    el.grid.querySelectorAll('.product-card').forEach((card) => {
      const open = () => openModal(Number(card.dataset.product));
      card.addEventListener('click', open);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
    });
    hydrateIcons(el.grid);
  };

  const renderTabs = () => {
    const cats = ['全部', ...new Set(state.products.map((p) => p.category))];
    el.tabs.innerHTML = cats
      .map(
        (cat) =>
          `<button class="filter-tab${cat === state.category ? ' active' : ''}" type="button" data-category="${escapeHtml(cat)}" role="tab" aria-selected="${cat === state.category}">${escapeHtml(cat)}</button>`,
      )
      .join('');
    el.tabs.querySelectorAll('.filter-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.category = tab.dataset.category;
        renderTabs();
        render();
      });
    });
  };

  const updateQty = () => {
    const max = Math.min(10, state.current ? state.current.stock : 1);
    el.qty.textContent = state.qty;
    el.minus.disabled = state.qty <= 1;
    el.plus.disabled = state.qty >= max;
    el.total.textContent = ((state.current.priceCents * state.qty) / 100).toFixed(2);
  };

  const resetCheckoutLabel = (label) => {
    el.submit.innerHTML = `<span id="checkoutLabel">${label}</span>${icon('arrowRight', 16)}`;
    el.submitLabel = $('#checkoutLabel');
  };

  const openModal = (id) => {
    const product = state.products.find((p) => p.id === id);
    if (!product) return;
    if (product.stock <= 0) {
      toast('该商品暂时缺货，补货后可购买', 'info');
      return;
    }
    state.current = product;
    state.qty = 1;
    state.submitting = false;
    el.icon.innerHTML = icon(iconName(product.icon), 22);
    el.icon.style.color = accentVar(product.accent);
    el.icon.style.borderColor = `color-mix(in srgb, ${accentVar(product.accent)} 22%, transparent)`;
    el.icon.style.background = `color-mix(in srgb, ${accentVar(product.accent)} 8%, transparent)`;
    el.category.textContent = `${product.category} · DIGITAL CARD`;
    el.title.textContent = product.name;
    el.desc.textContent = product.description;
    el.features.innerHTML = (product.features || [])
      .map((f) => `<span>${escapeHtml(f)}</span>`)
      .join('');
    el.stock.textContent = `库存 ${product.stock} 张 · 单笔限购 10 张`;
    el.contact.value = '';
    el.error.hidden = true;
    el.submit.disabled = false;
    resetCheckoutLabel('使用支付宝支付');
    el.modal.hidden = false;
    document.body.classList.add('no-scroll');
    updateQty();
    setTimeout(() => el.close.focus(), 50);
  };

  const closeModal = () => {
    if (state.submitting) return;
    el.modal.hidden = true;
    document.body.classList.remove('no-scroll');
    state.current = null;
  };

  const showError = (message) => {
    el.errorText.textContent = message;
    el.error.hidden = false;
  };

  const checkout = async () => {
    if (!state.current || state.submitting) return;
    state.submitting = true;
    el.error.hidden = true;
    el.submit.disabled = true;
    el.submit.innerHTML = `<span class="spinner spinner-dark"></span><span>正在创建订单…</span>`;
    try {
      const data = await api('/api/orders', {
        method: 'POST',
        body: {
          productId: state.current.id,
          quantity: state.qty,
          contact: el.contact.value.trim(),
          payType: 'alipay',
        },
      });
      const target = `${data.payUrl}&type=alipay`;
      el.submit.innerHTML = `<span class="spinner spinner-dark"></span><span>正在前往支付…</span>`;
      window.location.assign(target);
    } catch (err) {
      state.submitting = false;
      el.submit.disabled = false;
      resetCheckoutLabel('使用支付宝支付');
      showError(err.message || '创建订单失败，请稍后重试');
      if (/库存/.test(err.message)) {
        loadStore(true);
      }
    }
  };

  async function loadStore(quiet = false) {
    try {
      const data = await api('/api/store');
      state.products = data.products || [];
      const stock = state.products.reduce((sum, p) => sum + p.stock, 0);
      $('#statStock').textContent = stock.toLocaleString('zh-CN');
      $('#statProducts').textContent = state.products.length;
      if (!quiet) {
        renderTabs();
        render();
      } else {
        render();
        if (state.current) {
          const fresh = state.products.find((p) => p.id === state.current.id);
          if (fresh) {
            state.current = fresh;
            el.stock.textContent = `库存 ${fresh.stock} 张 · 单笔限购 10 张`;
            state.qty = Math.min(state.qty, Math.max(1, fresh.stock));
            updateQty();
          }
        }
      }
    } catch (err) {
      el.grid.innerHTML = `
        <div class="empty-state products-empty">
          ${icon('alert', 38)}
          <strong>商品加载失败</strong>
          <p>${escapeHtml(err.message || '请刷新页面重试')}</p>
          <button class="btn btn-ghost btn-sm" type="button" id="reloadStore">刷新页面</button>
        </div>`;
      $('#reloadStore')?.addEventListener('click', () => location.reload());
    }
  }

  const initHeader = () => {
    const header = $('#siteHeader');
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 14);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const toggle = $('#menuToggle');
    const nav = $('#navLinks');
    toggle.addEventListener('click', () => {
      const open = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('a').forEach((link) =>
      link.addEventListener('click', () => {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }),
    );
    document.addEventListener('click', (event) => {
      if (!nav.contains(event.target) && !toggle.contains(event.target)) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  };

  const initReveal = () => {
    const items = $$('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    items.forEach((item) => io.observe(item));
  };

  const initModal = () => {
    el.close.addEventListener('click', closeModal);
    el.modal.addEventListener('click', (event) => {
      if (event.target === el.modal) closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !el.modal.hidden) closeModal();
    });
    el.minus.addEventListener('click', () => {
      if (state.qty > 1) {
        state.qty -= 1;
        updateQty();
      }
    });
    el.plus.addEventListener('click', () => {
      const max = Math.min(10, state.current ? state.current.stock : 1);
      if (state.qty < max) {
        state.qty += 1;
        updateQty();
      }
    });
    el.submit.addEventListener('click', checkout);
  };

  document.addEventListener('DOMContentLoaded', () => {
    hydrateIcons();
    initHeader();
    initModal();
    initReveal();
    loadStore();

    // 从支付页返回后，如果地址带 order 标记，不在这里处理；订单页会自行同步。
  });
})();
