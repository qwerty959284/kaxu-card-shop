/* 卡序 · 前端公共工具 */
(function () {
  const paths = {
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/><circle cx="12" cy="15.4" r="1.1"/>',
    shield: '<path d="M12 3.2 4.8 6v5.4c0 4.4 3 7.5 7.2 9.4 4.2-1.9 7.2-5 7.2-9.4V6L12 3.2Z"/><path d="m9.2 11.8 1.9 1.9 3.7-3.8"/>',
    zap: '<path d="M13 2.8 4.9 13h6.3l-.9 8.2L19.2 11h-6.3l.1-8.2Z"/>',
    check: '<path d="m4.5 12.5 5 5L19.5 7"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M15 9V6.2A2.2 2.2 0 0 0 12.8 4H6.2A2.2 2.2 0 0 0 4 6.2v6.6A2.2 2.2 0 0 0 6.2 15H9"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    cart: '<circle cx="9.5" cy="19.5" r="1.3"/><circle cx="18" cy="19.5" r="1.3"/><path d="M3.5 4h2.2l2.6 11.2h11.1L21 7.5H6.4"/>',
    bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M8.8 9V6.5a3.2 3.2 0 0 1 6.4 0V9"/>',
    play: '<circle cx="12" cy="12" r="8.7"/><path d="m10.3 8.8 5.1 3.2-5.1 3.2V8.8Z" fill="currentColor" stroke="none"/>',
    game: '<path d="M7.4 8.2h9.2a4.5 4.5 0 0 1 4.3 5.8l-1 3.4a2.3 2.3 0 0 1-3.8 1l-2-1.9h-4.2l-2 1.9a2.3 2.3 0 0 1-3.8-1l-1-3.4a4.5 4.5 0 0 1 4.3-5.8Z"/><path d="M8 11v3M6.5 12.5h3M15.6 11.7h.01M17.7 13.6h.01"/>',
    bolt: '<path d="M13.2 2.8 5.8 13.2h5.6L10 21.2l7.4-10.4h-5.6l1.4-8Z"/>',
    book: '<path d="M4.5 5.2A2.2 2.2 0 0 1 6.7 3H19v16.5H6.7a2.2 2.2 0 0 0-2.2 2.2V5.2Z"/><path d="M4.5 19.2A2.2 2.2 0 0 1 6.7 17H19"/><path d="M8.3 7h6.4"/>',
    music: '<path d="M9 18.2V5.6l9-1.8v12.1"/><circle cx="6.5" cy="18.4" r="2.5"/><circle cx="15.5" cy="16.1" r="2.5"/>',
    cloud: '<path d="M7.3 18.7h9.9a3.8 3.8 0 0 0 .5-7.6 5.6 5.6 0 0 0-10.8-1.3 4.5 4.5 0 0 0 .4 8.9Z"/>',
    star: '<path d="m12 3.2 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3.2Z"/>',
    gift: '<rect x="3.8" y="8.5" width="16.4" height="4" rx="1"/><path d="M5.4 12.5V20h13.2v-7.5M12 8.5V20"/><path d="M12 8.5S10.7 3.5 8.2 3.5a2.4 2.4 0 0 0 0 5H12ZM12 8.5s1.3-5 3.8-5a2.4 2.4 0 0 1 0 5H12Z"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2.4"/><path d="M3 10h18M6.5 14.5h4"/>',
    eye: '<path d="M2.6 12S6 5.9 12 5.9 21.4 12 21.4 12 18 18.1 12 18.1 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.7"/>',
    eyeOff: '<path d="m3 3 18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.4 6 9.4 6a17 17 0 0 1-2.4 3.2M6.2 6.6A17 17 0 0 0 2.6 12S6 18 12 18a9 9 0 0 0 3.7-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    trash: '<path d="M4.5 6.5h15M9 3.8h6M6.5 6.5l.8 13.2h9.4l.8-13.2M10 10.2v6M14 10.2v6"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.2 4.2"/>',
    logout: '<path d="M14.5 8V5.8A1.8 1.8 0 0 0 12.7 4H5.8A1.8 1.8 0 0 0 4 5.8v12.4A1.8 1.8 0 0 0 5.8 20h6.9a1.8 1.8 0 0 0 1.8-1.8V16"/><path d="M9.5 12H21M17.8 8.6 21.2 12l-3.4 3.4"/>',
    grid: '<rect x="3.8" y="3.8" width="6.5" height="6.5" rx="1.5"/><rect x="13.7" y="3.8" width="6.5" height="6.5" rx="1.5"/><rect x="3.8" y="13.7" width="6.5" height="6.5" rx="1.5"/><rect x="13.7" y="13.7" width="6.5" height="6.5" rx="1.5"/>',
    tag: '<path d="M3.8 11.4V4.4h7l9.1 9.1a1.6 1.6 0 0 1 0 2.3l-4.2 4.2a1.6 1.6 0 0 1-2.3 0l-9.6-8.6Z"/><circle cx="7.7" cy="8.2" r="1.2"/>',
    box: '<path d="m12 3.2 8.4 4.4v8.8L12 20.8l-8.4-4.4V7.6L12 3.2Z"/><path d="m3.8 7.7 8.2 4.5 8.2-4.5M12 12.2v8.4"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    ticket: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v2a2.5 2.5 0 0 0 0 5v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-2a2.5 2.5 0 0 0 0-5v-2Z"/><path d="M14 6.5v11" stroke-dasharray="2.5 3"/>',
    plusBox: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    arrowRight: '<path d="M4.5 12h15M13.8 6.3 19.5 12l-5.7 5.7"/>',
    arrowUpRight: '<path d="M7 17 17 7M8.5 7H17v8.5"/>',
    arrowLeft: '<path d="M19.5 12h-15M10.2 6.3 4.5 12l5.7 5.7"/>',
    chevronLeft: '<path d="m14.5 6-6 6 6 6"/>',
    chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
    chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5.2A1.8 1.8 0 0 1 17.2 21H5.8A1.8 1.8 0 0 1 4 19.2V7.8A1.8 1.8 0 0 1 5.8 6H11"/>',
    alert: '<path d="M12 3.8 21 20H3L12 3.8Z"/><path d="M12 9.5v4.6M12 17.2h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>',
    clock: '<circle cx="12" cy="12" r="8.8"/><path d="M12 7v5.4l3.4 2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.4"/><path d="m4 6.5 8 6 8-6"/>',
    download: '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16"/>',
    edit: '<path d="m14.5 5.5 4 4M4 20l1-4.2L16.4 4.4a1.8 1.8 0 0 1 2.5 0l.7.7a1.8 1.8 0 0 1 0 2.5L8.2 19 4 20Z"/>',
    user: '<circle cx="12" cy="8" r="3.7"/><path d="M4.5 20.2c.6-3.7 3.6-5.7 7.5-5.7s6.9 2 7.5 5.7"/>',
    users: '<circle cx="9" cy="8.3" r="3.3"/><path d="M2.8 19.5c.5-3.2 3-5 6.2-5s5.7 1.8 6.2 5M16.2 5.4a3.2 3.2 0 0 1 0 6.2M18.2 14.7c1.7.5 2.8 1.8 3.1 4"/>',
    wechat: '<path d="M9.7 4.3c-3.9 0-7 2.5-7 5.7 0 1.8 1 3.4 2.6 4.5l-.6 2.1 2.4-1.2c.8.2 1.6.4 2.5.4.3 0 .6 0 .9-.1" fill="none"/><path d="M21.3 14.4c0-2.7-2.6-4.8-5.8-4.8s-5.8 2.1-5.8 4.8 2.6 4.8 5.8 4.8c.7 0 1.4-.1 2-.3l2 1-.5-1.8c1.4-.9 2.3-2.2 2.3-3.7Z"/><circle cx="7.4" cy="8.7" r=".8" fill="currentColor" stroke="none"/><circle cx="11.4" cy="8.7" r=".8" fill="currentColor" stroke="none"/><circle cx="13.7" cy="13.5" r=".7" fill="currentColor" stroke="none"/><circle cx="17.2" cy="13.5" r=".7" fill="currentColor" stroke="none"/>',
    spark: '<path d="M12 2.8v4M12 17.2v4M2.8 12h4M17.2 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M18.5 5.5l-2.8 2.8M8.3 15.7l-2.8 2.8"/>',
    filter: '<path d="M3.5 5.5h17l-6.5 7.6v5.4l-4 1.5v-6.9L3.5 5.5Z"/>',
    more: '<circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
    key: '<circle cx="8" cy="8" r="4.3"/><path d="m11.3 11.3 8.2 8.2M16 15.5l2-2M18.4 18l1.8-1.8"/>',
    wallet: '<path d="M4 7.2A2.2 2.2 0 0 1 6.2 5H19v14H6.2A2.2 2.2 0 0 1 4 16.8V7.2Z"/><path d="M4 8.5h15M15.5 12h3.7v4h-3.7a2 2 0 0 1 0-4Z"/>',
  };

  const icon = (name, size = 18) => {
    const body = paths[name] || paths.card;
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  };

  const money = (cents, symbol = true) => {
    const n = Number(cents || 0) / 100;
    return `${symbol ? '¥' : ''}${n.toFixed(2)}`;
  };

  const dateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(d)
      .replace(/\//g, '-');
  };

  const fullDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(d)
      .replace(/\//g, '-');
  };

  const timeAgo = (iso) => {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
    return dateTime(iso);
  };

  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const api = async (path, options = {}) => {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (window.__CSRF__) headers['X-CSRF-Token'] = window.__CSRF__;
    const res = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers,
      body:
        options.body && !(options.body instanceof FormData) && typeof options.body !== 'string'
          ? JSON.stringify(options.body)
          : options.body,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      if (res.status === 401 && path !== '/api/admin/login') {
        window.dispatchEvent(new CustomEvent('kx:unauthorized'));
      }
      const err = new Error((data && data.error) || `请求失败（${res.status}）`);
      err.status = res.status;
      err.code = data && data.code;
      throw err;
    }
    return data;
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      el.remove();
      return ok;
    }
  };

  const toast = (message, type = 'success') => {
    let root = document.getElementById('toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toast-root';
      document.body.appendChild(root);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', 'status');
    const ico = type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check';
    el.innerHTML = `${icon(ico, 17)}<span>${escapeHtml(message)}</span>`;
    root.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 260);
    }, 3000);
  };

  const hydrateIcons = (root = document) => {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      const size = Number(el.dataset.size || 18);
      el.innerHTML = icon(el.dataset.icon, size);
      el.removeAttribute('data-icon');
    });
  };

  window.KX = {
    icon,
    money,
    dateTime,
    fullDateTime,
    timeAgo,
    escapeHtml,
    api,
    copyText,
    toast,
    hydrateIcons,
    $: (sel, root = document) => root.querySelector(sel),
    $$: (sel, root = document) => Array.from(root.querySelectorAll(sel)),
  };
})();
