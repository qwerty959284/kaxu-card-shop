/* 卡序 · 运营后台逻辑 */
(function () {
  const {
    $,
    $$,
    icon,
    money,
    dateTime,
    fullDateTime,
    escapeHtml: esc,
    api,
    toast,
    copyText,
    hydrateIcons,
  } = window.KX;

  const loginView = $('#loginView');
  const app = $('#adminApp');
  const content = $('#adminContent');
  const modalRoot = $('#modalRoot');
  const sidebar = $('#sidebar');
  const sidebarMask = $('#sidebarMask');

  const VIEWS = {
    dashboard: {
      title: '概览',
      subtitle: '今天的生意，一眼看清。',
      load: loadDashboard,
    },
    sales: {
      title: '卡密售出',
      subtitle: '每一笔订单，都有迹可循。',
      load: loadSales,
    },
    support: {
      title: '留言中心',
      subtitle: '客户联系管理员的留言都在这里。',
      load: loadSupport,
    },
    restock: {
      title: '卡密补充',
      subtitle: '补充库存，立即开卖。',
      load: loadRestock,
    },
    cards: {
      title: '卡密管理',
      subtitle: '库存卡密，一清二楚。',
      load: loadCards,
    },
    create: {
      title: '卡密创建',
      subtitle: '上架新商品，或调整已有商品。',
      load: loadCreate,
    },
    channels: {
      title: '通道控制',
      subtitle: '随时开关支付宝 / 微信支付通道。',
      load: loadChannels,
    },
    selfhost: {
      title: '自建支付',
      subtitle: '自挂监控软件的商户接口与最近请求。',
      load: loadSelfhost,
    },
    testpay: {
      title: '测试支付',
      subtitle: '打开与前台一致的支付页，验证真实支付与自动发货。',
      load: loadTestPay,
    },
  };

  const state = {
    me: null,
    dashboard: null,
    products: [],
    sales: { page: 1, status: 'all', q: '', card: '', tradeNo: '', total: 0, totalPages: 1 },
    cards: {
      page: 1,
      status: 'all',
      productId: '',
      q: '',
      total: 0,
      totalPages: 1,
      selected: new Set(),
      revealed: new Set(),
    },
    restock: { productId: null },
    create: { editingId: null, icon: 'card', accent: 'mint' },
    channels: { alipay: true, wxpay: true, qqpay: true },
    support: { status: 'all', page: 1, totalPages: 1 },
    searchTimer: null,
    currentView: 'dashboard',
  };

  const statusLabels = {
    pending: '待支付',
    delivered: '已发货',
    paid_pending: '待补货',
    closed: '已关闭',
    available: '未售',
    reserved: '锁定中',
    sold: '已售',
  };

  const statusPill = (status) =>
    `<span class="status-pill status-${esc(status)}"><i></i>${statusLabels[status] || esc(status)}</span>`;

  const payLabel = (type) =>
    type === 'wxpay' ? '微信' : type === 'qqpay' ? 'QQ钱包' : '支付宝';
  const payDot = (type) =>
    `<span style="display:inline-block;width:6px;height:6px;border-radius:2px;background:${
      type === 'wxpay' ? '#07c160' : type === 'qqpay' ? '#12b7f5' : '#1677ff'
    };margin-right:5px;vertical-align:1px"></span>`;

  const viewLoading = () => {
    content.innerHTML = `<div class="admin-loading"><span class="spinner"></span><span>正在加载…</span></div>`;
  };

  const viewError = (message) => {
    content.innerHTML = `
      <div class="admin-empty" style="min-height:340px">
        ${icon('alert', 30)}
        <strong>加载失败</strong>
        <p>${esc(message || '请稍后重试')}</p>
        <button class="btn btn-ghost btn-sm" type="button" id="retryView">重新加载</button>
      </div>`;
    $('#retryView')?.addEventListener('click', () => navigate(state.currentView, true));
  };

  const setHeader = (view) => {
    $('#pageTitle').textContent = view.title;
    $('#pageSubtitle').textContent = view.subtitle;
    $$('.side-link').forEach((link) =>
      link.classList.toggle('is-active', link.dataset.view === state.currentView),
    );
  };

  const closeSidebar = () => {
    sidebar.classList.remove('is-open');
    sidebarMask.classList.remove('is-open');
  };

  const navigate = (viewName, force = false) => {
    const name = VIEWS[viewName] ? viewName : 'dashboard';
    state.currentView = name;
    setHeader(VIEWS[name]);
    closeSidebar();
    if (location.hash !== `#/${name}` && !force) {
      history.replaceState(null, '', `#/${name}`);
    }
    viewLoading();
    Promise.resolve(VIEWS[name].load()).catch((err) => {
      if (err.status === 401) return showLogin();
      viewError(err.message);
    });
  };

  /* ============================== 登录 ============================== */

  const showLogin = () => {
    app.hidden = true;
    loginView.hidden = false;
    document.body.classList.remove('no-scroll');
    state.me = null;
    window.__CSRF__ = null;
    closeModal();
  };

  const showApp = (me) => {
    state.me = me;
    loginView.hidden = true;
    app.hidden = false;
    const letter = (me.admin?.username || 'A').slice(0, 1).toUpperCase();
    $('#sideUsername').textContent = me.admin?.username || 'ADMIN';
    $('#sideAvatar').textContent = letter;
    $('#topbarAvatar').textContent = letter;
    navigate(currentViewName(), true);
    refreshSidebar();
  };

  const currentViewName = () => {
    const match = location.hash.match(/^#\/([a-z]+)/);
    return match && VIEWS[match[1]] ? match[1] : 'dashboard';
  };

  async function checkAuth() {
    try {
      const me = await api('/api/admin/me');
      window.__CSRF__ = me.csrf;
      showApp(me);
    } catch {
      showLogin();
    }
  }

  const bindLogin = () => {
    const form = $('#loginForm');
    const user = $('#loginUser');
    const pass = $('#loginPass');
    const btn = $('#loginBtn');
    const error = $('#loginError');
    const errorText = $('#loginErrorText');

    $('#togglePass').addEventListener('click', () => {
      const show = pass.type === 'password';
      pass.type = show ? 'text' : 'password';
      $('#togglePass').innerHTML = icon(show ? 'eyeOff' : 'eye', 15);
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.hidden = true;
      if (!user.value.trim() || !pass.value) {
        errorText.textContent = '请输入管理员账号和密码';
        error.hidden = false;
        return;
      }
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner spinner-dark"></span><span>正在验证…</span>`;
      try {
        const data = await api('/api/admin/login', {
          method: 'POST',
          body: { username: user.value.trim(), password: pass.value },
        });
        window.__CSRF__ = data.csrf;
        pass.value = '';
        showApp(data);
        toast(`欢迎回来，${data.admin.username}`);
      } catch (err) {
        errorText.textContent = err.message || '登录失败';
        error.hidden = false;
        btn.disabled = false;
        btn.innerHTML = `<span>进入后台</span>${icon('arrowRight', 16)}`;
      }
    });
  };

  const bindChrome = () => {
    $('#logoutBtn').addEventListener('click', async () => {
      try {
        await api('/api/admin/logout', { method: 'POST', body: {} });
      } catch {
        /* ignore */
      }
      showLogin();
      toast('已退出登录', 'info');
    });

    $('#sidebarToggle').addEventListener('click', () => {
      sidebar.classList.add('is-open');
      sidebarMask.classList.add('is-open');
    });
    sidebarMask.addEventListener('click', closeSidebar);

    $('#refreshBtn').addEventListener('click', () => {
      const el = $('#refreshBtn svg');
      if (el) {
        el.style.transition = 'transform .5s ease';
        el.style.transform = 'rotate(360deg)';
        setTimeout(() => {
          el.style.transition = 'none';
          el.style.transform = 'none';
        }, 520);
      }
      navigate(state.currentView, true);
    });

    window.addEventListener('hashchange', () => {
      if (app.hidden) return;
      navigate(currentViewName(), true);
    });

    window.addEventListener('kx:unauthorized', () => {
      if (!app.hidden) {
        showLogin();
        toast('登录已失效，请重新登录', 'error');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeModal();
        closeSidebar();
      }
    });
  };

  /* ============================== 侧栏 ============================== */

  async function refreshSidebar() {
    try {
      const data = await api('/api/admin/dashboard');
      state.dashboard = data;
      updateSidebar(data.stats);
      if (state.currentView === 'dashboard' && content.querySelector('.stats-grid')) {
        renderDashboard(data);
      }
    } catch {
      /* 静默 */
    }
  }

  const updateSidebar = (stats) => {
    $('#sideStockNum').textContent = Number(stats.stock || 0).toLocaleString('zh-CN');
    const total = Number(stats.stock || 0) + Number(stats.cardsSold || 0);
    const pct = total ? Math.max(3, Math.round((stats.stock / total) * 100)) : 0;
    $('#sideStockBar').style.width = `${pct}%`;
    const pending = Number(stats.pending || 0);
    const waiting = Number(stats.waiting || 0);
    $('#sideStockHint').textContent =
      waiting > 0 ? `${waiting} 笔已付款待补货` : pending > 0 ? `${pending} 笔订单待支付` : '库存状态正常';
    const badge = $('#navSalesBadge');
    const count = pending + waiting;
    badge.hidden = count <= 0;
    badge.textContent = count > 99 ? '99+' : String(count);

    const supportBadge = $('#navSupportBadge');
    const unread = Number(stats.supportUnread || 0);
    if (supportBadge) {
      supportBadge.hidden = unread <= 0;
      supportBadge.textContent = unread > 99 ? '99+' : String(unread);
    }
  };

  /* ============================== 通道控制 ============================== */

  async function loadChannels() {
    const data = await api('/api/admin/payment-methods');
    state.channels = { alipay: data.alipay, wxpay: data.wxpay, qqpay: data.qqpay };
    const labels = [data.alipay ? '支付宝' : '', data.wxpay ? '微信' : '', data.qqpay ? 'QQ钱包' : ''].filter(Boolean);
    const summary = labels.length ? labels.join(' + ') : '暂停销售';
    const summaryClass = labels.length ? 'tag tag-mint' : 'tag';

    content.innerHTML = `
      <div class="view-enter channels-view">
        <div class="channels-grid">
          <section class="panel">
            <div class="panel-head">
              <div>
                <div class="panel-title">${icon('wallet', 15)} 前台支付通道</div>
                <div class="panel-sub">关闭后前台立即隐藏对应支付方式，不需要重启服务</div>
              </div>
              <span class="${summaryClass}" id="channelSummary">${summary}</span>
            </div>
            <div class="channel-list">
              <div class="channel-card ${data.alipay ? '' : 'is-off'}" id="alipayCard">
                <span class="channel-icon alipay">支</span>
                <div class="channel-info">
                  <strong>支付宝通道</strong>
                  <span>${data.alipay ? '当前前台可用' : '当前已关闭，前台不显示支付宝'}</span>
                </div>
                <label class="switch" title="开启 / 关闭支付宝">
                  <input type="checkbox" id="channelAlipay" ${data.alipay ? 'checked' : ''}>
                  <i></i>
                </label>
              </div>

              <div class="channel-card ${data.wxpay ? '' : 'is-off'}" id="wxpayCard">
                <span class="channel-icon wechat">微</span>
                <div class="channel-info">
                  <strong>微信支付通道</strong>
                  <span>${data.wxpay ? '当前前台可用；账号被风控时建议关闭' : '当前已关闭，前台不显示微信'}</span>
                </div>
                <label class="switch" title="开启 / 关闭微信">
                  <input type="checkbox" id="channelWxpay" ${data.wxpay ? 'checked' : ''}>
                  <i></i>
                </label>
              </div>

              <div class="channel-card ${data.qqpay ? '' : 'is-off'}" id="qqpayCard">
                <span class="channel-icon qq">Q</span>
                <div class="channel-info">
                  <strong>QQ 钱包通道</strong>
                  <span>${data.qqpay ? '当前前台可用；需先在自建支付上传 QQ 收款码' : '当前已关闭，前台不显示 QQ 钱包'}</span>
                </div>
                <label class="switch" title="开启 / 关闭 QQ 钱包">
                  <input type="checkbox" id="channelQqpay" ${data.qqpay ? 'checked' : ''}>
                  <i></i>
                </label>
              </div>
            </div>

            <div class="channel-note">
              ${icon('alert', 14)}
              <span>三个通道都关闭后，前台会进入“暂停销售”状态，客户无法下单。修改后点下方保存。</span>
            </div>

            <div class="form-actions">
              <button class="btn btn-primary btn-sm" type="button" id="saveChannels">
                ${icon('check', 14)} 保存通道设置
              </button>
            </div>
          </section>

          <aside class="panel">
            <div class="panel-head">
              <div><div class="panel-title">${icon('info', 15)} 使用说明</div></div>
            </div>
            <div class="panel-body">
              <ul class="channel-help">
                <li>支付通道掉线时，先关闭对应通道，避免客户付款失败。</li>
                <li>微信/QQ 账号被风控或频繁离线时，建议关闭对应通道。</li>
                <li>通道开关立即生效，不影响已经创建的订单。</li>
                <li>重新开启后，前台会自动恢复对应支付方式。</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>`;

    hydrateIcons(content);

    const alipay = $('#channelAlipay');
    const wxpay = $('#channelWxpay');
    const qqpay = $('#channelQqpay');
    const syncCards = () => {
      $('#alipayCard')?.classList.toggle('is-off', !alipay.checked);
      $('#wxpayCard')?.classList.toggle('is-off', !wxpay.checked);
      $('#qqpayCard')?.classList.toggle('is-off', !qqpay.checked);
    };
    alipay.addEventListener('change', syncCards);
    wxpay.addEventListener('change', syncCards);
    qqpay.addEventListener('change', syncCards);

    $('#saveChannels').addEventListener('click', async () => {
      const nextAlipay = alipay.checked;
      const nextWxpay = wxpay.checked;
      const nextQqpay = qqpay.checked;
      if (!nextAlipay && !nextWxpay && !nextQqpay) {
        const ok = await confirmDialog({
          title: '暂停销售',
          message: '支付宝、微信和 QQ 钱包都关闭后，前台会暂停销售，客户将无法下单。确定全部关闭吗？',
          confirmText: '全部关闭',
        });
        if (!ok) return;
      }

      const btn = $('#saveChannels');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width:13px;height:13px"></span> 正在保存…`;
      try {
        await api('/api/admin/payment-methods', {
          method: 'POST',
          body: { alipay: nextAlipay, wxpay: nextWxpay, qqpay: nextQqpay },
        });
        toast(nextAlipay || nextWxpay || nextQqpay ? '支付通道已更新' : '已暂停销售');
        await loadChannels();
      } catch (err) {
        toast(err.message || '保存失败', 'error');
        btn.disabled = false;
        btn.innerHTML = `${icon('check', 14)} 保存通道设置`;
      }
    });
  }

  /* ============================== 自建支付 ============================== */

  async function loadSelfhost() {
    const data = await api('/api/admin/selfhost');
    const logs = data.logs || [];
    const qrcodes = data.qrcodes || [];
    const qrTiles = qrcodes
      .map(
        (item) => `
          <div class="qr-tile">
            <div class="qr-preview${item.has ? '' : ' is-empty'}">
              ${item.has ? `<img src="/api/qrcodes/${item.type}?t=${Date.now()}" alt="${esc(item.name)}收款码">` : '<span>未上传</span>'}
            </div>
            <strong>${esc(item.name)}</strong>
            <button class="btn btn-ghost btn-sm" type="button" data-upload="${item.type}">${item.has ? '更换收款码' : '上传收款码'}</button>
            <input type="file" accept="image/png,image/jpeg,image/webp" data-file="${item.type}" hidden>
          </div>`,
      )
      .join('');
    const rows = logs.length
      ? logs
          .map(
            (row) => `
              <tr>
                <td class="cell-mono">${esc(fullDateTime(row.createdAt))}</td>
                <td><span class="tag">${esc(row.method || '')} ${esc(row.path || '')}</span></td>
                <td class="cell-note">${esc(row.note || '—')}</td>
                <td class="cell-params">${esc((row.params || '').slice(0, 220))}</td>
              </tr>`,
          )
          .join('')
      : `<tr><td colspan="4" class="empty-cell">还没有收到请求。把监控软件的商户地址改成下面的地址，再点一次测试。</td></tr>`;

    content.innerHTML = `
      <div class="view-enter channels-view">
        <div class="selfhost-stack">
          <section class="panel">
            <div class="panel-head">
              <div>
                <div class="panel-title">${icon('external', 15)} 商户接口</div>
                <div class="panel-sub">把这三项填进自挂监控软件的「商户接口」</div>
              </div>
              <span class="${data.enabled ? 'tag tag-mint' : 'tag'}">${data.enabled ? '已启用' : '未配置密钥'}</span>
            </div>
            <form class="create-form" onsubmit="return false">
              <div class="form-grid">
                <label class="field span-2">
                  <span class="field-label">商户地址</span>
                  <input class="input" id="selfhostAddress" type="text" readonly value="${esc(data.address || '')}">
                </label>
                <label class="field">
                  <span class="field-label">商户 ID</span>
                  <input class="input" id="selfhostPid" type="text" readonly value="${esc(data.pid || '')}">
                </label>
                <label class="field">
                  <span class="field-label">商户密钥</span>
                  <input class="input" id="selfhostKey" type="text" readonly value="${esc(data.key || '')}" placeholder="未配置">
                </label>
              </div>
              <p class="form-hint">${icon('alert', 14)} 商户地址只填根域名，不要带 /api.php；监控软件会自动拼接。密钥等同于收款权限，不要发给买家。</p>
              <div class="form-actions">
                <button class="btn btn-primary btn-sm" type="button" id="copySelfhost">
                  ${icon('copy', 14)} 复制三项配置
                </button>
                <button class="btn btn-ghost btn-sm" type="button" id="refreshSelfhost">
                  ${icon('refresh', 14)} 刷新请求
                </button>
              </div>
            </form>
          </section>

          <section class="panel">
            <div class="panel-head">
              <div>
                <div class="panel-title">${icon('wallet', 15)} 收款码</div>
                <div class="panel-sub">买家在支付页看到的个人收款码，对应金额由订单决定</div>
              </div>
              <span class="${qrcodes.some((item) => item.has) ? 'tag tag-mint' : 'tag'}">${qrcodes.some((item) => item.has) ? '已配置' : '待上传'}</span>
            </div>
            <div class="qr-grid">${qrTiles}</div>
            <div class="selfhost-gateway">
              <label class="field">
                <span class="field-label">当前支付通道</span>
                <select class="select" id="paymentGateway">
                  <option value="selfhost"${data.gateway === 'selfhost' ? ' selected' : ''}>自建收款码（推荐）</option>
                  <option value="epay"${data.gateway === 'epay' ? ' selected' : ''}>易彩豆收银台</option>
                </select>
              </label>
              <p class="form-hint">${icon('alert', 14)} 自建模式下，前台和测试支付都会打开商城自己的收款码页，不再跳转易彩豆。请先上传至少一个收款码。</p>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <div>
                <div class="panel-title">${icon('clock', 15)} 最近请求</div>
                <div class="panel-sub">监控软件查单、上报收款都会记录在这里</div>
              </div>
            </div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>时间</th><th>接口</th><th>结果</th><th>参数</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </section>
        </div>
      </div>`;

    hydrateIcons(content);

    $('#copySelfhost')?.addEventListener('click', async () => {
      const text = `商户地址：${data.address || ''}\n商户 ID：${data.pid || ''}\n商户密钥：${data.key || ''}`;
      const ok = await copyText(text);
      toast(ok ? '三项配置已复制' : '复制失败，请手动选择复制', ok ? 'success' : 'error');
    });
    $('#refreshSelfhost')?.addEventListener('click', () => loadSelfhost());

    content.querySelectorAll('[data-upload]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = content.querySelector(`[data-file="${btn.dataset.upload}"]`);
        input?.click();
      });
    });

    content.querySelectorAll('[data-file]').forEach((input) => {
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          toast('图片不能超过 2MB，请压缩后再上传', 'error');
          input.value = '';
          return;
        }
        const type = input.dataset.file;
        const reader = new FileReader();
        reader.onload = async () => {
          const btn = content.querySelector(`[data-upload="${type}"]`);
          if (btn) btn.disabled = true;
          try {
            await api('/api/admin/qrcode', {
              method: 'POST',
              body: { type, dataUrl: reader.result },
            });
            toast('收款码已保存', 'success');
            await loadSelfhost();
          } catch (err) {
            toast(err.message || '上传失败，请重试', 'error');
            if (btn) btn.disabled = false;
          } finally {
            input.value = '';
          }
        };
        reader.readAsDataURL(file);
      });
    });

    $('#paymentGateway')?.addEventListener('change', async (event) => {
      const select = event.currentTarget;
      select.disabled = true;
      try {
        await api('/api/admin/payment-gateway', {
          method: 'POST',
          body: { gateway: select.value },
        });
        toast(select.value === 'selfhost' ? '已切换为自建收款码' : '已切换为易彩豆收银台', 'success');
      } catch (err) {
        toast(err.message || '切换失败', 'error');
        await loadSelfhost();
      } finally {
        select.disabled = false;
      }
    });
  }

  /* ============================== 测试支付 ============================== */

  async function loadTestPay() {
    content.innerHTML = `
      <div class="view-enter">
        <div class="testpay-wrap">
          <section class="panel">
            <div class="panel-head">
              <div>
                <div class="panel-title">${icon('bolt', 15)} 测试一笔支付</div>
                <div class="panel-sub">创建隐藏测试订单，打开与前台一致的支付页，验证真实支付流程</div>
              </div>
              <span class="tag tag-mint">不扣真实余额</span>
            </div>
            <form class="create-form" id="testPayForm" novalidate>
              <div class="form-grid">
                <label class="field">
                  <span class="field-label">测试金额（元）</span>
                  <input class="input" id="testPayAmount" type="number" min="0.01" max="1000" step="0.01" value="0.01" required>
                </label>
                <label class="field">
                  <span class="field-label">支付方式</span>
                  <select class="select" id="testPayType">
                    <option value="wxpay">微信支付</option>
                    <option value="alipay">支付宝</option>
                    <option value="qqpay">QQ 钱包</option>
                  </select>
                </label>
              </div>
              <p class="form-hint">${icon('alert', 14)} 会生成一笔「支付测试」隐藏订单并打开前台支付页；扫码付款后，监控软件上报给商城并自动发货。</p>
              <div class="form-actions">
                <button class="btn btn-primary" type="submit" id="testPaySubmit">
                  ${icon('external', 15)} 去支付（打开支付页）
                </button>
                <button class="btn btn-ghost" type="submit" id="testPaySimulate" formnovalidate>
                  ${icon('bolt', 15)} 模拟回调（不付款）
                </button>
              </div>
            </form>
            <div class="testpay-result" id="testPayResult" hidden></div>
          </section>
        </div>
      </div>`;

    hydrateIcons(content);

    const form = document.querySelector('#testPayForm');
    const amountInput = document.querySelector('#testPayAmount');
    const typeInput = document.querySelector('#testPayType');
    const submit = document.querySelector('#testPaySubmit');
    const simulate = document.querySelector('#testPaySimulate');
    const box = document.querySelector('#testPayResult');

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const mode = event.submitter && event.submitter.id === 'testPaySimulate' ? 'simulate' : 'pay';
      const amount = Number(amountInput.value);
      if (!Number.isFinite(amount) || amount < 0.01 || amount > 1000) {
        toast('测试金额需在 0.01 - 1000 元之间', 'error');
        amountInput.focus();
        return;
      }

      let payWindow = null;
      if (mode === 'pay') payWindow = window.open('', '_blank');

      submit.disabled = true;
      simulate.disabled = true;
      const submitHtml = submit.innerHTML;
      const simulateHtml = simulate.innerHTML;
      (mode === 'pay' ? submit : simulate).textContent = '处理中…';
      box.hidden = true;

      try {
        const data = await api('/api/admin/test-payment', {
          method: 'POST',
          body: { amount, payType: typeInput.value, mode },
        });

        if (mode === 'pay') {
          if (payWindow) payWindow.location.href = data.payUrl;
          else window.open(data.payUrl, '_blank');
          box.hidden = false;
          box.className = 'testpay-result is-info';
          box.innerHTML = `
            <div class="testpay-result-head">${icon('external', 16)} 测试订单已创建，支付页已打开</div>
            <p class="testpay-result-msg">完成付款后，监控软件会把收款上报给商城并自动发货。若支付页没有弹出，点下面的按钮打开。</p>
            <dl class="testpay-meta">
              <div><dt>订单号</dt><dd class="cell-mono">${esc(data.orderNo || '—')}</dd></div>
              <div><dt>金额</dt><dd>¥${((Number(data.amountCents) || 0) / 100).toFixed(2)}</dd></div>
              <div><dt>支付方式</dt><dd>${esc(data.payType || '')}</dd></div>
            </dl>
            <div class="testpay-links">
              <a class="btn btn-primary btn-sm" href="${esc(data.payUrl)}" target="_blank" rel="noopener">${icon('external', 14)} 打开支付页</a>
              <a class="btn btn-ghost btn-sm" href="${esc(data.orderUrl)}" target="_blank" rel="noopener">${icon('receipt', 14)} 查看订单状态</a>
            </div>`;
          hydrateIcons(box);
          return;
        }

        const ok = Boolean(data.ok);
        const rawMessage = (data.result && (data.result.msg || data.result.message)) || '';
        const message = ok
          ? '自建网关已确认收款，测试卡密已发放。'
          : rawMessage || '模拟上报未通过，请查看自建支付日志。';
        box.hidden = false;
        box.className = `testpay-result ${ok ? 'is-ok' : 'is-fail'}`;
        box.innerHTML = `
          <div class="testpay-result-head">${icon(ok ? 'check' : 'alert', 16)} ${ok ? '支付成功，订单已自动发货' : '上报失败'}</div>
          <p class="testpay-result-msg">${esc(message)}</p>
          <dl class="testpay-meta">
            <div><dt>订单号</dt><dd class="cell-mono">${esc(data.orderNo || '—')}</dd></div>
            <div><dt>金额</dt><dd>¥${((Number(data.amountCents) || 0) / 100).toFixed(2)}</dd></div>
            <div><dt>支付方式</dt><dd>${esc(data.payType || '')}</dd></div>
          </dl>
          ${data.orderUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(data.orderUrl)}" target="_blank" rel="noopener">${icon('external', 14)} 打开订单页查看卡密</a>` : ''}`;
        hydrateIcons(box);
      } catch (err) {
        if (payWindow) payWindow.close();
        box.hidden = false;
        box.className = 'testpay-result is-fail';
        box.innerHTML = `<div class="testpay-result-head">${icon('alert', 16)} 请求失败</div><p class="testpay-result-msg">${esc(err.message || '请稍后重试')}</p>`;
        hydrateIcons(box);
      } finally {
        submit.disabled = false;
        simulate.disabled = false;
        submit.innerHTML = submitHtml;
        simulate.innerHTML = simulateHtml;
        hydrateIcons(submit);
        hydrateIcons(simulate);
      }
    });
  }

  /* ============================== 留言中心 ============================== */

  async function loadSupport() {
    const data = await api(
      `/api/admin/support?status=${encodeURIComponent(state.support.status)}&page=${state.support.page}`,
    );
    state.support.page = data.page;
    state.support.totalPages = data.totalPages;
    const newCount = data.items.filter((item) => item.status === 'new').length;

    content.innerHTML = `
      <div class="view-enter">
        <div class="sales-head">
          <div><h2>客户留言</h2><p>客户在订单页或查询页提交的留言，会出现在这里。</p></div>
          <div class="sales-stats">
            <div class="sales-stat"><strong>${data.total}</strong><span>当前筛选留言</span></div>
            <div class="sales-stat"><strong>${newCount}</strong><span>本页未读</span></div>
          </div>
        </div>

        <section class="panel">
          <div class="toolbar">
            <div class="filter-chips" id="supportStatusChips">
              ${[
                ['all', '全部'],
                ['new', '未读'],
                ['read', '已读'],
              ]
                .map(
                  ([value, label]) =>
                    `<button class="chip-btn${state.support.status === value ? ' is-active' : ''}" type="button" data-status="${value}">${label}</button>`,
                )
                .join('')}
            </div>
            <span class="toolbar-spacer"></span>
            <button class="icon-btn" type="button" id="supportRefresh" title="刷新">${icon('refresh', 15)}</button>
          </div>
          <div class="support-list">
            ${
              data.items.length
                ? data.items
                    .map(
                      (item) => `
              <article class="support-item ${item.status === 'new' ? 'is-new' : ''}">
                <div class="support-meta">
                  <span class="support-dot"></span>
                  <strong>${item.order_no ? esc(item.order_no) : '未填写订单号'}</strong>
                  ${item.contact ? `<span>${esc(item.contact)}</span>` : ''}
                  <time>${dateTime(item.created_at)}</time>
                  <em class="${item.status === 'new' ? 'tag tag-mint' : 'tag'}">${item.status === 'new' ? '未读' : '已读'}</em>
                </div>
                <p class="support-message">${esc(item.message)}</p>
                <div class="support-actions">
                  <button class="row-btn" type="button" data-support-read="${item.id}" data-read="${item.status === 'new' ? '1' : '0'}">
                    ${item.status === 'new' ? '标为已读' : '标为未读'}
                  </button>
                  <button class="row-btn danger" type="button" data-support-delete="${item.id}">${icon('trash', 12)} 删除</button>
                </div>
              </article>`,
                    )
                    .join('')
                : `<div class="admin-empty">${icon('mail', 30)}<strong>还没有留言</strong><p>客户提交的留言会显示在这里。</p></div>`
            }
          </div>
          <div class="pagination">
            <span class="pagination-info">共 ${data.total} 条 · 第 ${data.page} / ${data.totalPages} 页</span>
            <div class="pagination-btns">
              <button class="page-btn" type="button" data-support-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>${icon('chevronLeft', 12)}</button>
              <span class="page-btn is-active">${data.page}</span>
              <button class="page-btn" type="button" data-support-page="${data.page + 1}" ${data.page >= data.totalPages ? 'disabled' : ''}>${icon('chevronRight', 12)}</button>
            </div>
          </div>
        </section>
      </div>`;

    hydrateIcons(content);

    $('#supportStatusChips').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-status]');
      if (!btn) return;
      state.support.status = btn.dataset.status;
      state.support.page = 1;
      loadSupport();
    });
    $('#supportRefresh').addEventListener('click', loadSupport);
    content.querySelectorAll('[data-support-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.support.page = Number(btn.dataset.supportPage);
        loadSupport();
      });
    });
    content.querySelectorAll('[data-support-read]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await api(`/api/admin/support/${btn.dataset.supportRead}/read`, {
            method: 'POST',
            body: { read: btn.dataset.read === '1' },
          });
          await loadSupport();
          refreshSidebar();
        } catch (err) {
          toast(err.message || '操作失败', 'error');
          btn.disabled = false;
        }
      });
    });
    content.querySelectorAll('[data-support-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: '删除留言',
          message: '删除后无法恢复，确定删除这条客户留言吗？',
          confirmText: '删除',
        });
        if (!ok) return;
        try {
          await api(`/api/admin/support/${btn.dataset.supportDelete}`, { method: 'DELETE' });
          toast('留言已删除');
          await loadSupport();
          refreshSidebar();
        } catch (err) {
          toast(err.message || '删除失败', 'error');
        }
      });
    });
  }

  /* ============================== 概览 ============================== */

  async function loadDashboard() {
    const data = await api('/api/admin/dashboard');
    state.dashboard = data;
    state.products = data.products || [];
    updateSidebar(data.stats);
    renderDashboard(data);
  }

  function renderDashboard(data) {
    const s = data.stats;
    const maxRevenue = Math.max(...data.days.map((d) => d.revenue), 1);
    const demoBanner =
      s.demoCards > 0
        ? `<div class="banner">
             ${icon('info', 16)}
             <span>当前有 <b style="color:var(--amber)">${s.demoCards}</b> 张演示卡密，正式营业前建议清理，避免误售。</span>
             <button class="btn btn-ghost btn-sm" type="button" data-action="demo-clear">清理演示卡密</button>
           </div>`
        : '';
    const callbackBanner = data.callbackWarning
      ? `<div class="banner banner-info">
           ${icon('alert', 16)}
           <span>${esc(data.callbackWarning)} 当前回调：<code style="font-size:9px">${esc(data.callbackBase)}</code></span>
         </div>`
      : '';

    const lowStock =
      data.lowStock.length > 0
        ? data.lowStock
            .map(
              (p) => `
          <div class="low-stock-item">
            <span class="low-stock-icon">${icon(p.icon || 'card', 16)}</span>
            <div><strong>${esc(p.name)}</strong><span>${p.stock <= 0 ? '已售罄' : p.stock <= 5 ? '库存偏低' : '库存较少'}</span></div>
            <span class="stock-num ${p.stock <= 0 ? 'zero' : p.stock <= 5 ? 'low' : ''}">${p.stock}</span>
            <button class="row-btn" type="button" data-action="low-restock" data-id="${p.id}">补货</button>
          </div>`,
            )
            .join('')
        : `<div class="admin-empty">${icon('check', 30)}<strong>库存充足</strong><p>所有在售商品库存都在安全线以上。</p></div>`;

    const recent =
      data.recentOrders.length > 0
        ? data.recentOrders
            .map(
              (o) => `
          <tr>
            <td><span class="order-code">${esc(o.orderNo)}</span></td>
            <td><div class="product-cell"><div><strong>${esc(o.productName)}</strong><span>× ${o.quantity}</span></div></div></td>
            <td class="cell-strong">${money(o.amountCents)}</td>
            <td>${payDot(o.payType)}${payLabel(o.payType)}</td>
            <td>${statusPill(o.status)}</td>
            <td class="cell-muted">${dateTime(o.createdAt)}</td>
            <td><button class="row-btn" type="button" data-action="order-detail" data-id="${o.id}">查看</button></td>
          </tr>`,
            )
            .join('')
        : `<tr><td colspan="7"><div class="admin-empty">${icon('ticket', 30)}<strong>还没有订单</strong><p>前台售出后，订单会出现在这里。</p></div></td></tr>`;

    content.innerHTML = `
      <div class="view-enter">
        ${demoBanner}
        ${callbackBanner}
        <div class="stats-grid">
          <div class="stat-card" style="--stat-accent:var(--mint)">
            <div class="stat-head"><span>累计销售额</span><span class="stat-icon">${icon('wallet', 14)}</span></div>
            <div class="stat-value"><small>¥</small>${(s.totalRevenue / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
            <div class="stat-meta">今日 <b>+${money(s.todayRevenue)}</b> · ${s.todayOrders} 笔</div>
          </div>
          <div class="stat-card" style="--stat-accent:var(--violet)">
            <div class="stat-head"><span>已售卡密</span><span class="stat-icon">${icon('ticket', 14)}</span></div>
            <div class="stat-value">${Number(s.cardsSold).toLocaleString('zh-CN')}</div>
            <div class="stat-meta">累计 <b>${s.totalOrders}</b> 笔有效订单</div>
          </div>
          <div class="stat-card" style="--stat-accent:var(--blue)">
            <div class="stat-head"><span>可用库存</span><span class="stat-icon">${icon('box', 14)}</span></div>
            <div class="stat-value">${Number(s.stock).toLocaleString('zh-CN')}</div>
            <div class="stat-meta">${data.products.length} 个商品 · ${data.lowStock.filter((p) => p.stock <= 5).length} 个需补货</div>
          </div>
          <div class="stat-card" style="--stat-accent:var(--amber)">
            <div class="stat-head"><span>待处理</span><span class="stat-icon">${icon('clock', 14)}</span></div>
            <div class="stat-value">${s.pending + s.waiting}</div>
            <div class="stat-meta">${s.pending} 笔待支付 · <b style="color:var(--amber)">${s.waiting}</b> 笔待补货</div>
          </div>
        </div>

        <div class="dash-grid">
          <section class="panel">
            <div class="panel-head">
              <div><div class="panel-title">${icon('chart', 15)} 近 7 日销售额</div><div class="panel-sub">按支付时间统计，含待补货订单</div></div>
              <span class="tag tag-mint">${money(data.days.reduce((sum, d) => sum + d.revenue, 0))}</span>
            </div>
            <div class="chart-wrap">
              <div class="chart">
                ${data.days
                  .map(
                    (d) => `
                  <div class="chart-col">
                    <div class="chart-bar" style="height:${Math.max(3, Math.round((d.revenue / maxRevenue) * 100))}%" data-tip="${d.date} · ${money(d.revenue)}"></div>
                    <span class="chart-label">${d.date}</span>
                  </div>`,
                  )
                  .join('')}
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <div><div class="panel-title">${icon('box', 15)} 库存预警</div><div class="panel-sub">可用库存 ≤ 10 的商品</div></div>
              <a class="text-link" style="font-size:9px" href="#/restock">去补充</a>
            </div>
            <div class="low-stock-list">${lowStock}</div>
          </section>
        </div>

        <section class="panel recent-panel">
          <div class="panel-head">
            <div><div class="panel-title">${icon('ticket', 15)} 最近订单</div><div class="panel-sub">最新 8 笔订单动态</div></div>
            <a class="text-link" style="font-size:9px" href="#/sales">查看全部</a>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>订单号</th><th>商品</th><th>金额</th><th>支付</th><th>状态</th><th>时间</th><th></th></tr></thead>
              <tbody>${recent}</tbody>
            </table>
          </div>
        </section>
      </div>`;
    hydrateIcons(content);
  }

  /* ============================== 卡密售出 ============================== */

  async function loadSales() {
    content.innerHTML = `
      <div class="view-enter">
        <div class="sales-head">
          <div><h2>订单流水</h2><p>查看支付状态、发货卡密与联系方式，支持主动同步支付结果。</p></div>
          <div class="sales-stats">
            <div class="sales-stat"><strong id="salesTotal">—</strong><span>当前筛选订单</span></div>
            <div class="sales-stat"><strong id="salesDelivered">—</strong><span>已发货</span></div>
            <div class="sales-stat"><strong id="salesWaiting">—</strong><span>待处理</span></div>
          </div>
        </div>

        <section class="panel">
          <div class="toolbar">
            <div class="filter-chips" id="salesStatusChips">
              ${[
                ['all', '全部'],
                ['pending', '待支付'],
                ['delivered', '已发货'],
                ['paid_pending', '待补货'],
                ['closed', '已关闭'],
              ]
                .map(
                  ([value, label]) =>
                    `<button class="chip-btn${state.sales.status === value ? ' is-active' : ''}" type="button" data-status="${value}">${label}</button>`,
                )
                .join('')}
            </div>
            <div class="search-box">
              <span>${icon('search', 14)}</span>
              <input class="input" id="salesSearch" type="search" placeholder="订单号 / 商品 / 联系方式" value="${esc(state.sales.q)}" autocomplete="off">
            </div>
            <div class="search-box">
              <span>${icon('key', 14)}</span>
              <input class="input" id="salesCardSearch" type="search" placeholder="搜索卡密" value="${esc(state.sales.card)}" autocomplete="off">
            </div>
            <div class="search-box">
              <span>${icon('wallet', 14)}</span>
              <input class="input" id="salesTradeSearch" type="search" placeholder="支付单号" value="${esc(state.sales.tradeNo)}" autocomplete="off">
            </div>
            <span class="toolbar-spacer"></span>
            <button class="icon-btn" type="button" id="salesRefresh" title="刷新">${icon('refresh', 15)}</button>
          </div>
          <div id="salesTableArea"><div class="admin-loading"><span class="spinner"></span><span>正在读取订单…</span></div></div>
        </section>
      </div>`;

    $('#salesStatusChips').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-status]');
      if (!btn) return;
      state.sales.status = btn.dataset.status;
      state.sales.page = 1;
      $$('#salesStatusChips .chip-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      loadSalesTable();
    });
    $('#salesSearch').addEventListener('input', (event) => {
      clearTimeout(state.searchTimer);
      const value = event.target.value.trim();
      state.searchTimer = setTimeout(() => {
        state.sales.q = value;
        state.sales.page = 1;
        loadSalesTable();
      }, 320);
    });
    $('#salesCardSearch').addEventListener('input', (event) => {
      clearTimeout(state.searchTimer);
      const value = event.target.value.trim();
      state.searchTimer = setTimeout(() => {
        state.sales.card = value;
        state.sales.page = 1;
        loadSalesTable();
      }, 320);
    });
    $('#salesTradeSearch').addEventListener('input', (event) => {
      clearTimeout(state.searchTimer);
      const value = event.target.value.trim();
      state.searchTimer = setTimeout(() => {
        state.sales.tradeNo = value;
        state.sales.page = 1;
        loadSalesTable();
      }, 320);
    });
    $('#salesRefresh').addEventListener('click', loadSalesTable);

    await loadSalesTable();
  }

  async function loadSalesTable() {
    const area = $('#salesTableArea');
    if (!area) return;
    try {
      const data = await api(
        `/api/admin/orders?status=${encodeURIComponent(state.sales.status)}&q=${encodeURIComponent(
          state.sales.q,
        )}&card=${encodeURIComponent(state.sales.card)}&tradeNo=${encodeURIComponent(
          state.sales.tradeNo,
        )}&page=${state.sales.page}`,
      );
      state.sales.page = data.page;
      state.sales.total = data.total;
      state.sales.totalPages = data.totalPages;
      const delivered = data.items.filter((o) => o.status === 'delivered').length;
      const waiting = data.items.filter((o) => o.status === 'paid_pending' || o.status === 'pending').length;
      if ($('#salesTotal')) $('#salesTotal').textContent = data.total;
      if ($('#salesDelivered')) $('#salesDelivered').textContent = delivered;
      if ($('#salesWaiting')) $('#salesWaiting').textContent = waiting;

      const rows = data.items.length
        ? data.items
            .map(
              (o) => `
          <tr>
            <td><span class="order-code">${esc(o.orderNo)}</span></td>
            <td>
              <div class="product-cell">
                <div><strong>${esc(o.productName)}</strong><span>× ${o.quantity} · ${money(o.unitPriceCents)} / 张</span></div>
              </div>
            </td>
            <td class="cell-strong">${money(o.amountCents)}</td>
            <td style="white-space:nowrap">${payDot(o.payType)}${payLabel(o.payType)}</td>
            <td>${statusPill(o.status)}</td>
            <td class="cell-muted" style="white-space:nowrap">${dateTime(o.createdAt)}</td>
            <td><button class="row-btn" type="button" data-action="order-detail" data-id="${o.id}">${icon('eye', 12)} 详情</button></td>
          </tr>`,
            )
            .join('')
        : `<tr><td colspan="7"><div class="admin-empty">${icon('ticket', 30)}<strong>没有找到订单</strong><p>换个筛选条件，或等待第一笔订单。</p></div></td></tr>`;

      area.innerHTML = `
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>订单号</th><th>商品</th><th>金额</th><th>支付</th><th>状态</th><th>下单时间</th><th>操作</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="pagination">
          <span class="pagination-info">共 ${data.total} 笔 · 第 ${data.page} / ${data.totalPages} 页</span>
          <div class="pagination-btns">
            <button class="page-btn" type="button" data-action="sales-page" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>${icon('chevronLeft', 12)}</button>
            <span class="page-btn is-active">${data.page}</span>
            <button class="page-btn" type="button" data-action="sales-page" data-page="${data.page + 1}" ${data.page >= data.totalPages ? 'disabled' : ''}>${icon('chevronRight', 12)}</button>
          </div>
        </div>`;
    } catch (err) {
      area.innerHTML = `<div class="admin-empty">${icon('alert', 30)}<strong>订单加载失败</strong><p>${esc(err.message)}</p></div>`;
    }
  }

  async function openOrderDetail(id) {
    try {
      const data = await api(`/api/admin/orders/${id}`);
      const o = data.order;
      const cards = data.cards || [];
      const doneCards = cards.filter((c) => c.status === 'sold');
      const cardList = cards.length
        ? cards
            .map(
              (c) => `
          <div class="detail-secret-row">
            <code>${esc(c.secret)}</code>
            <span class="tag">${statusLabels[c.status] || c.status}</span>
            <button class="mini-icon-btn" type="button" data-copy="${esc(c.secret)}" title="复制">${icon('copy', 12)}</button>
          </div>`,
            )
            .join('')
        : `<div class="detail-secret-row"><span class="cell-muted" style="padding:4px 0">${o.status === 'pending' ? '订单未支付，卡密仍处于锁定状态' : '暂无分配卡密'}</span></div>`;

      const actions = [];
      if (o.status !== 'delivered') {
        actions.push(
          `<button class="btn btn-ghost btn-sm" type="button" data-order-action="sync" data-id="${o.id}">${icon('refresh', 13)} 同步支付状态</button>`,
        );
        actions.push(
          `<button class="btn btn-primary btn-sm" type="button" data-order-action="mark" data-id="${o.id}">${icon('check', 13)} 手动补单</button>`,
        );
      }
      if (o.status === 'pending') {
        actions.push(
          `<button class="btn btn-danger btn-sm" type="button" data-order-action="close" data-id="${o.id}">关闭订单</button>`,
        );
      }

      openModal(`
        <div class="admin-modal">
          <div class="modal-head">
            <div>
              <h3>订单详情 ${statusPill(o.status)}</h3>
              <p>${esc(o.orderNo)}</p>
            </div>
            <button class="modal-close" type="button" data-close-modal aria-label="关闭">${icon('close', 15)}</button>
          </div>
          <div class="modal-body">
            <div class="detail-grid">
              <div class="detail-item"><span>商品</span><strong title="${esc(o.productName)}">${esc(o.productName)}</strong></div>
              <div class="detail-item"><span>数量 / 金额</span><strong>${o.quantity} 张 · ${money(o.amountCents)}</strong></div>
              <div class="detail-item"><span>支付方式</span><strong>${payLabel(o.payType)}</strong></div>
              <div class="detail-item"><span>下单时间</span><strong>${fullDateTime(o.createdAt)}</strong></div>
              <div class="detail-item"><span>支付时间</span><strong>${o.paidAt ? fullDateTime(o.paidAt) : '—'}</strong></div>
              <div class="detail-item"><span>发货时间</span><strong>${o.deliveredAt ? fullDateTime(o.deliveredAt) : '—'}</strong></div>
              <div class="detail-item"><span>联系方式</span><strong>${o.contact ? esc(o.contact) : '未填写'}</strong></div>
              <div class="detail-item"><span>平台订单号</span><strong title="${esc(o.tradeNo || '')}">${o.tradeNo ? esc(o.tradeNo) : '—'}</strong></div>
              <div class="detail-item"><span>已发放卡密</span><strong>${doneCards.length} / ${o.quantity} 张</strong></div>
            </div>
            ${o.note ? `<div class="detail-note">${esc(o.note)}</div>` : ''}
            <div class="detail-section">
              <div class="detail-section-title"><span>订单卡密</span><span>${doneCards.length} 张已发放</span></div>
              <div class="detail-secrets">${cardList}</div>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(o.orderNo)}">${icon('copy', 13)} 复制订单号</button>
            <span style="flex:1"></span>
            ${actions.join('')}
          </div>
        </div>`);
    } catch (err) {
      toast(err.message || '订单详情加载失败', 'error');
    }
  }

  /* ============================== 卡密补充 ============================== */

  async function loadRestock() {
    const data = await api('/api/admin/products');
    state.products = data.items || [];
    if (!state.products.length) {
      content.innerHTML = `<div class="panel view-enter"><div class="admin-empty" style="min-height:380px">${icon('box', 32)}<strong>还没有商品</strong><p>先去“卡密创建”上架第一个商品。</p><a class="btn btn-primary btn-sm" href="#/create">去创建商品</a></div></div>`;
      return;
    }
    if (!state.products.some((p) => p.id === Number(state.restock.productId))) {
      state.restock.productId = state.products[0].id;
    }

    content.innerHTML = `
      <div class="view-enter restock-grid">
        <section class="panel">
          <div class="panel-head">
            <div><div class="panel-title">${icon('tag', 15)} 选择商品</div><div class="panel-sub">共 ${state.products.length} 个商品</div></div>
          </div>
          <div class="picker-list" id="restockPicker"></div>
        </section>
        <section class="panel">
          <div id="restockFormArea"></div>
          <div class="panel-head" style="border-top:1px solid var(--line);border-bottom:0">
            <div><div class="panel-title">${icon('clock', 15)} 最近补充批次</div><div class="panel-sub">该商品最近 8 个入库批次</div></div>
          </div>
          <div id="batchHistory"></div>
        </section>
      </div>`;

    renderRestockPicker();
    renderRestockForm();
    loadBatches();

    $('#restockPicker').addEventListener('click', (event) => {
      const item = event.target.closest('[data-pick]');
      if (!item) return;
      state.restock.productId = Number(item.dataset.pick);
      renderRestockPicker();
      renderRestockForm();
      loadBatches();
    });
  }

  const selectedRestockProduct = () =>
    state.products.find((p) => p.id === Number(state.restock.productId)) || state.products[0];

  function renderRestockPicker() {
    const picker = $('#restockPicker');
    if (!picker) return;
    picker.innerHTML = state.products
      .map(
        (p) => `
      <button class="pick-item${p.id === Number(state.restock.productId) ? ' is-active' : ''}" type="button" data-pick="${p.id}">
        <span class="pick-icon" style="--pick-accent:var(--${p.accent || 'mint'})">${icon(p.icon || 'card', 16)}</span>
        <span class="pick-info"><strong>${esc(p.name)}</strong><span>${esc(p.category)} · ${p.active ? '在售' : '已下架'}</span></span>
        <span class="pick-stock"><strong>${p.stock}</strong><span>可用</span></span>
      </button>`,
      )
      .join('');
  }

  function renderRestockForm() {
    const area = $('#restockFormArea');
    if (!area) return;
    const p = selectedRestockProduct();
    if (!p) return;
    area.innerHTML = `
      <div class="restock-form">
        <div class="restock-product-head">
          <span class="pick-icon" style="--pick-accent:var(--${p.accent || 'mint'})">${icon(p.icon || 'card', 20)}</span>
          <div><h3>${esc(p.name)}</h3><p>${esc(p.category)} · ${money(p.priceCents)} / 张</p></div>
          <span class="stock-badge">可用 ${p.stock} 张</span>
        </div>
        <form id="restockForm">
          <label class="field">
            <span class="form-label-row">
              <span class="field-label">卡密内容 <small>一行一条，自动去重</small></span>
              <span class="counter" id="restockCounter">0 条</span>
            </span>
            <textarea class="textarea textarea-cards" id="restockCards" placeholder="每行一条卡密，支持从 Excel 批量粘贴" spellcheck="false"></textarea>
          </label>
          <p class="form-hint">${icon('info', 12)} 重复卡密会自动跳过；已售出的卡密不会被覆盖。补充后若有“待补货”订单，会自动优先发放。</p>
          <div style="margin-top:16px;max-width:320px">
            <label class="field">
              <span class="field-label">批次备注 <small>选填</small></span>
              <input class="input input-sm" id="restockBatch" type="text" maxlength="40" placeholder="如：20261115-A">
            </label>
          </div>
          <div class="form-actions">
            <button class="btn btn-ghost btn-sm" type="button" data-action="view-product-cards">查看该商品卡密</button>
            <button class="btn btn-primary btn-sm" type="submit" id="restockSubmit">${icon('plusBox', 14)} 补充库存</button>
          </div>
        </form>
      </div>`;

    const textarea = $('#restockCards');
    const counter = $('#restockCounter');
    const update = () => {
      const count = new Set(
        textarea.value
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter(Boolean),
      ).size;
      counter.textContent = `${count} 条`;
    };
    textarea.addEventListener('input', update);
    update();

    $('#restockForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const cardsText = textarea.value.trim();
      if (!cardsText) {
        toast('请先粘贴要补充的卡密', 'error');
        textarea.focus();
        return;
      }
      const btn = $('#restockSubmit');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width:13px;height:13px"></span> 正在入库…`;
      try {
        const result = await api(`/api/admin/products/${p.id}/restock`, {
          method: 'POST',
          body: { cardsText, batch: $('#restockBatch').value.trim() },
        });
        toast(
          result.filled > 0
            ? `已补充 ${result.added} 张，并自动发出 ${result.filled} 笔待补货订单`
            : `已补充 ${result.added} 张卡密`,
        );
        await loadRestock();
        if (state.currentView === 'restock') refreshSidebar();
      } catch (err) {
        toast(err.message || '补充失败', 'error');
        btn.disabled = false;
        btn.innerHTML = `${icon('plusBox', 14)} 补充库存`;
      }
    });
  }

  async function loadBatches() {
    const area = $('#batchHistory');
    if (!area) return;
    const p = selectedRestockProduct();
    if (!p) return;
    try {
      const data = await api(`/api/admin/products/${p.id}/batches`);
      area.innerHTML = data.items.length
        ? data.items
            .map(
              (b) => `
          <div class="batch-row">
            <code>${esc(b.batch)}</code>
            <span>${b.total} 张</span>
            <b>+${b.available}</b>
            <span>${dateTime(b.created_at)}</span>
          </div>`,
            )
            .join('')
        : `<div class="admin-empty" style="padding:28px">${icon('clock', 26)}<strong>还没有补充记录</strong><p>新入库的批次会显示在这里。</p></div>`;
    } catch {
      area.innerHTML = '';
    }
  }

  /* ============================== 卡密管理 ============================== */

  async function loadCards() {
    const data = await api('/api/admin/products');
    state.products = data.items || [];
    content.innerHTML = `
      <div class="view-enter">
        <section class="panel">
          <div class="toolbar">
            <div class="filter-chips" id="cardsStatusChips">
              ${[
                ['all', '全部'],
                ['available', '未售'],
                ['reserved', '锁定'],
                ['sold', '已售'],
              ]
                .map(
                  ([value, label]) =>
                    `<button class="chip-btn${state.cards.status === value ? ' is-active' : ''}" type="button" data-status="${value}">${label}</button>`,
                )
                .join('')}
            </div>
            <select class="select" id="cardsProductFilter">
              <option value="">全部商品</option>
              ${state.products
                .map(
                  (p) =>
                    `<option value="${p.id}"${String(p.id) === String(state.cards.productId) ? ' selected' : ''}>${esc(p.name)}</option>`,
                )
                .join('')}
            </select>
            <div class="search-box">
              <span>${icon('search', 14)}</span>
              <input class="input" id="cardsSearch" type="search" placeholder="卡密 / 订单号" value="${esc(state.cards.q)}" autocomplete="off">
            </div>
            <span class="toolbar-spacer"></span>
            <button class="btn btn-ghost btn-sm" type="button" data-action="export-cards">${icon('download', 13)} 导出 CSV</button>
            <button class="icon-btn" type="button" id="cardsRefresh" title="刷新">${icon('refresh', 15)}</button>
          </div>
          <div id="cardsTableArea"><div class="admin-loading"><span class="spinner"></span><span>正在读取卡密…</span></div></div>
        </section>
      </div>`;

    $('#cardsStatusChips').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-status]');
      if (!btn) return;
      state.cards.status = btn.dataset.status;
      state.cards.page = 1;
      state.cards.selected.clear();
      $$('#cardsStatusChips .chip-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      loadCardsTable();
    });
    $('#cardsProductFilter').addEventListener('change', (event) => {
      state.cards.productId = event.target.value;
      state.cards.page = 1;
      state.cards.selected.clear();
      loadCardsTable();
    });
    $('#cardsSearch').addEventListener('input', (event) => {
      clearTimeout(state.searchTimer);
      const value = event.target.value.trim();
      state.searchTimer = setTimeout(() => {
        state.cards.q = value;
        state.cards.page = 1;
        state.cards.selected.clear();
        loadCardsTable();
      }, 320);
    });
    $('#cardsRefresh').addEventListener('click', loadCardsTable);

    await loadCardsTable();
  }

  async function loadCardsTable() {
    const area = $('#cardsTableArea');
    if (!area) return;
    try {
      const query = new URLSearchParams({
        status: state.cards.status,
        productId: state.cards.productId,
        q: state.cards.q,
        page: state.cards.page,
      });
      const data = await api(`/api/admin/cards?${query}`);
      state.cards.page = data.page;
      state.cards.total = data.total;
      state.cards.totalPages = data.totalPages;
      const selected = state.cards.selected;
      const visible = data.items.map((c) => c.id);
      [...selected].forEach((id) => {
        if (!visible.includes(id)) selected.delete(id);
      });

      const rows = data.items.length
        ? data.items
            .map((c) => {
              const revealed = state.cards.revealed.has(c.id);
              const masked = `${c.secret.slice(0, 4)}••••••${c.secret.slice(-4)}`;
              return `
          <tr>
            <td class="checkbox-cell"><input class="table-check" type="checkbox" data-check="${c.id}" ${selected.has(c.id) ? 'checked' : ''} aria-label="选择卡密"></td>
            <td>
              <div class="secret-cell">
                <code class="${revealed ? '' : 'is-masked'}" data-secret-id="${c.id}">${esc(revealed ? c.secret : masked)}</code>
                <span class="secret-actions">
                  <button class="mini-icon-btn" type="button" data-action="toggle-secret" data-id="${c.id}" title="${revealed ? '隐藏' : '显示'}">${icon(revealed ? 'eyeOff' : 'eye', 12)}</button>
                  <button class="mini-icon-btn" type="button" data-action="copy-card" data-id="${c.id}" title="复制">${icon('copy', 12)}</button>
                </span>
              </div>
            </td>
            <td><div class="product-cell"><span class="product-cell-icon" style="color:var(--${c.product_accent || 'mint'})">${icon(c.product_icon || 'card', 14)}</span><div><strong>${esc(c.product_name)}</strong></div></div></td>
            <td>${statusPill(c.status)}</td>
            <td class="cell-muted">${c.batch ? esc(c.batch) : '—'}</td>
            <td>${c.order_no ? `<a class="order-code" href="#/sales" data-action="order-detail" data-id="${c.order_id}">${esc(c.order_no)}</a>` : '<span class="cell-muted">—</span>'}</td>
            <td class="cell-muted" style="white-space:nowrap">${dateTime(c.created_at)}</td>
            <td>
              ${
                c.status === 'available'
                  ? `<button class="row-btn danger" type="button" data-action="delete-card" data-id="${c.id}">${icon('trash', 12)} 删除</button>`
                  : '<span class="cell-muted">—</span>'
              }
            </td>
          </tr>`;
            })
            .join('')
        : `<tr><td colspan="8"><div class="admin-empty">${icon('key', 30)}<strong>没有找到卡密</strong><p>调整筛选条件，或去“卡密补充”入库。</p></div></td></tr>`;

      area.innerHTML = `
        ${
          selected.size
            ? `<div class="selection-bar"><span>已选择 <strong>${selected.size}</strong> 张卡密</span><button class="btn btn-danger btn-sm" type="button" data-action="bulk-delete">${icon('trash', 12)} 删除选中</button></div>`
            : ''
        }
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th class="checkbox-cell"><input class="table-check" id="checkAllCards" type="checkbox" aria-label="全选当前页"></th>
                <th>卡密</th><th>商品</th><th>状态</th><th>批次</th><th>关联订单</th><th>入库时间</th><th>操作</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="pagination">
          <span class="pagination-info">共 ${data.total} 张 · 第 ${data.page} / ${data.totalPages} 页</span>
          <div class="pagination-btns">
            <button class="page-btn" type="button" data-action="cards-page" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>${icon('chevronLeft', 12)}</button>
            <span class="page-btn is-active">${data.page}</span>
            <button class="page-btn" type="button" data-action="cards-page" data-page="${data.page + 1}" ${data.page >= data.totalPages ? 'disabled' : ''}>${icon('chevronRight', 12)}</button>
          </div>
        </div>`;

      area.querySelectorAll('[data-check]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const id = Number(cb.dataset.check);
          if (cb.checked) selected.add(id);
          else selected.delete(id);
          updateSelectionBar();
        });
      });
      const all = $('#checkAllCards');
      if (all) {
        all.checked = data.items.length > 0 && data.items.every((c) => selected.has(c.id));
        all.addEventListener('change', () => {
          data.items.forEach((c) => {
            if (all.checked) selected.add(c.id);
            else selected.delete(c.id);
          });
          loadCardsTable();
        });
      }
    } catch (err) {
      area.innerHTML = `<div class="admin-empty">${icon('alert', 30)}<strong>卡密加载失败</strong><p>${esc(err.message)}</p></div>`;
    }
  }

  function updateSelectionBar() {
    const area = $('#cardsTableArea');
    if (!area) return;
    const bar = area.querySelector('.selection-bar');
    if (!state.cards.selected.size) {
      bar?.remove();
      return;
    }
    if (bar) {
      bar.querySelector('strong').textContent = state.cards.selected.size;
    } else {
      area.insertAdjacentHTML(
        'afterbegin',
        `<div class="selection-bar"><span>已选择 <strong>${state.cards.selected.size}</strong> 张卡密</span><button class="btn btn-danger btn-sm" type="button" data-action="bulk-delete">${icon('trash', 12)} 删除选中</button></div>`,
      );
    }
  }

  /* ============================== 卡密创建 ============================== */

  async function loadCreate() {
    const data = await api('/api/admin/products');
    state.products = data.items || [];
    const editing = state.create.editingId
      ? state.products.find((p) => p.id === Number(state.create.editingId))
      : null;
    if (state.create.editingId && !editing) state.create.editingId = null;

    const categories = [...new Set(['影视会员', '游戏点卡', '工具软件', '阅读教育', '影音娱乐', ...state.products.map((p) => p.category)])];
    const p = editing || {
      name: '',
      category: '影视会员',
      description: '',
      priceCents: 0,
      originalPriceCents: null,
      badge: '',
      icon: 'card',
      accent: 'mint',
      features: [],
      active: true,
      stock: 0,
    };
    state.create.icon = p.icon || 'card';
    state.create.accent = p.accent || 'mint';

    content.innerHTML = `
      <div class="view-enter create-grid">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">${icon(editing ? 'edit' : 'plusBox', 15)} ${editing ? '编辑商品' : '创建卡密商品'}</div>
              <div class="panel-sub">${editing ? '修改商品信息，库存请通过“卡密补充”管理' : '填写商品信息，可同时导入首批卡密'}</div>
            </div>
            ${editing ? `<button class="btn btn-ghost btn-sm" type="button" data-action="cancel-edit">取消编辑</button>` : ''}
          </div>
          <form class="create-form" id="createForm">
            <div class="form-grid">
              <label class="field span-2">
                <span class="field-label">商品名称 <small>2 - 60 个字符</small></span>
                <input class="input" id="pfName" type="text" maxlength="60" required value="${esc(p.name)}" placeholder="如：云栖视频 VIP 月卡">
              </label>

              <label class="field">
                <span class="field-label">分类</span>
                <input class="input" id="pfCategory" type="text" maxlength="20" list="categoryList" value="${esc(p.category)}" placeholder="选择或输入分类">
                <datalist id="categoryList">${categories.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
              </label>

              <label class="field">
                <span class="field-label">角标 <small>选填，最多 8 字</small></span>
                <input class="input" id="pfBadge" type="text" maxlength="8" value="${esc(p.badge || '')}" placeholder="热销 / 官方 / 超值">
              </label>

              <label class="field">
                <span class="field-label">售价（元）</span>
                <input class="input" id="pfPrice" type="number" min="0.01" step="0.01" required value="${p.priceCents ? (p.priceCents / 100).toFixed(2) : ''}" placeholder="9.90">
              </label>

              <label class="field">
                <span class="field-label">原价（元） <small>选填，用于划线价</small></span>
                <input class="input" id="pfOriginal" type="number" min="0" step="0.01" value="${p.originalPriceCents ? (p.originalPriceCents / 100).toFixed(2) : ''}" placeholder="25.00">
              </label>

              <label class="field span-2">
                <span class="field-label">商品描述 <small>最多 300 字</small></span>
                <textarea class="textarea" id="pfDesc" maxlength="300" style="min-height:82px" placeholder="一句话说明适用平台、有效期与使用方式">${esc(p.description)}</textarea>
              </label>

              <label class="field span-2">
                <span class="field-label">卖点标签 <small>用逗号分隔，最多 6 个</small></span>
                <input class="input" id="pfFeatures" type="text" value="${esc((p.features || []).join(', '))}" placeholder="4K 超清, 全端通用, 即买即用">
              </label>

              <div class="field span-2">
                <span class="field-label">商品图标</span>
                <div class="icon-picker" id="iconPicker">
                  ${['card', 'play', 'game', 'bolt', 'book', 'music', 'cloud', 'star', 'gift']
                    .map(
                      (name) =>
                        `<button class="icon-choice${state.create.icon === name ? ' is-active' : ''}" type="button" data-icon-choice="${name}" aria-label="${name}">${icon(name, 17)}</button>`,
                    )
                    .join('')}
                </div>
              </div>

              <div class="field">
                <span class="field-label">主题色</span>
                <div class="accent-picker" id="accentPicker">
                  ${[
                    ['mint', '#6ff2bf'],
                    ['violet', '#b49cff'],
                    ['amber', '#ffc56e'],
                    ['blue', '#79b8ff'],
                    ['rose', '#ff9db0'],
                    ['cyan', '#74e6f2'],
                  ]
                    .map(
                      ([name, color]) =>
                        `<button class="accent-choice${state.create.accent === name ? ' is-active' : ''}" type="button" data-accent="${name}" style="--swatch:${color}" aria-label="${name}"></button>`,
                    )
                    .join('')}
                </div>
              </div>

              <div class="field" style="justify-content:flex-end">
                <label class="checkbox"><input type="checkbox" id="pfActive" ${p.active ? 'checked' : ''}> 立即上架销售</label>
              </div>

              <div class="field span-2" ${editing ? 'hidden' : ''}>
                <span class="form-label-row">
                  <span class="field-label">首批卡密 <small>选填，一行一条</small></span>
                  <span class="counter" id="createCardsCounter">0 条</span>
                </span>
                <textarea class="textarea textarea-cards" id="pfCards" placeholder="每行一条卡密，可留空稍后补充" spellcheck="false"></textarea>
              </div>
              ${
                editing
                  ? `<p class="form-hint span-2" style="margin-top:-6px">${icon('info', 12)} 编辑模式不会改动已有库存。需要加卡请前往 <a class="text-link" href="#/restock" data-action="go-restock">卡密补充</a>。</p>`
                  : ''
              }
            </div>

            <div class="form-actions">
              <button class="btn btn-ghost btn-sm" type="button" data-action="reset-create">重置</button>
              <button class="btn btn-primary btn-sm" type="submit" id="createSubmit">${icon(editing ? 'check' : 'plusBox', 14)} ${editing ? '保存修改' : '创建并上架'}</button>
            </div>
          </form>
        </section>

        <aside class="create-aside">
          <div class="preview-label">${icon('eye', 12)} 前台预览</div>
          <div class="product-preview" id="productPreview" style="--accent:var(--${state.create.accent})"></div>
          <p class="preview-note">预览仅展示样式，实际以前台页面为准。</p>
        </aside>

        <section class="panel product-table-wrap" style="grid-column:1 / -1">
          <div class="panel-head">
            <div><div class="panel-title">${icon('tag', 15)} 已上架商品</div><div class="panel-sub">共 ${state.products.length} 个商品 · 可编辑或切换上下架</div></div>
            <a class="text-link" style="font-size:9px" href="/" target="_blank" rel="noopener">查看前台</a>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>商品</th><th>分类</th><th>售价</th><th>可用库存</th><th>已售</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${
                  state.products.length
                    ? state.products
                        .map(
                          (item) => `
                  <tr>
                    <td><div class="product-cell"><span class="product-cell-icon" style="color:var(--${item.accent})">${icon(item.icon, 14)}</span><div><strong>${esc(item.name)}</strong><span>${esc(item.description || '暂无描述')}</span></div></div></td>
                    <td class="cell-muted">${esc(item.category)}</td>
                    <td class="cell-strong">${money(item.priceCents)}</td>
                    <td><span class="stock-num ${item.stock <= 5 ? 'low' : ''}">${item.stock}</span></td>
                    <td class="cell-muted">${item.sold}</td>
                    <td><label class="switch" title="${item.active ? '点击下架' : '点击上架'}"><input type="checkbox" data-active="${item.id}" ${item.active ? 'checked' : ''}><i></i></label></td>
                    <td>
                      <div class="row-actions">
                        <button class="row-btn" type="button" data-action="edit-product" data-id="${item.id}">${icon('edit', 12)} 编辑</button>
                        <button class="row-btn" type="button" data-action="restock-product" data-id="${item.id}">${icon('plus', 12)} 补货</button>
                        <button class="row-btn danger" type="button" data-action="delete-product" data-id="${item.id}" title="有历史订单的商品只能下架">${icon('trash', 12)} 删除</button>
                      </div>
                    </td>
                  </tr>`,
                        )
                        .join('')
                    : `<tr><td colspan="7"><div class="admin-empty">${icon('tag', 30)}<strong>还没有商品</strong><p>填写左侧表单，创建第一个卡密商品。</p></div></td></tr>`
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>`;

    hydrateIcons(content);
    renderCreatePreview();
    bindCreateForm(editing);

    $('#createForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = readCreatePayload();
      if (!payload.name || payload.name.length < 2) return toast('商品名称至少 2 个字符', 'error');
      if (!payload.priceCents || payload.priceCents < 1) return toast('请输入正确的售价', 'error');
      const btn = $('#createSubmit');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width:13px;height:13px"></span> 正在保存…`;
      try {
        if (editing) {
          await api(`/api/admin/products/${editing.id}`, { method: 'PATCH', body: payload });
          toast('商品已更新');
        } else {
          const result = await api('/api/admin/products', { method: 'POST', body: payload });
          toast(
            result.cardsAdded
              ? `商品已创建，并导入 ${result.cardsAdded} 张卡密`
              : '商品已创建，请及时补充卡密',
          );
        }
        state.create.editingId = null;
        await loadCreate();
        refreshSidebar();
      } catch (err) {
        toast(err.message || '保存失败', 'error');
        btn.disabled = false;
        btn.innerHTML = `${icon(editing ? 'check' : 'plusBox', 14)} ${editing ? '保存修改' : '创建并上架'}`;
      }
    });
  }

  function readCreatePayload() {
    const price = Number($('#pfPrice').value);
    const original = Number($('#pfOriginal').value);
    return {
      name: $('#pfName').value.trim(),
      category: $('#pfCategory').value.trim() || '其他',
      description: $('#pfDesc').value.trim(),
      priceCents: Math.round(price * 100),
      originalPriceCents: original > 0 ? Math.round(original * 100) : null,
      badge: $('#pfBadge').value.trim(),
      features: $('#pfFeatures').value
        .split(/[,，、|]/)
        .map((x) => x.trim())
        .filter(Boolean),
      icon: state.create.icon,
      accent: state.create.accent,
      active: $('#pfActive').checked,
      cardsText: $('#pfCards') ? $('#pfCards').value : '',
    };
  }

  function renderCreatePreview() {
    const preview = $('#productPreview');
    if (!preview) return;
    const name = $('#pfName')?.value.trim() || '商品名称';
    const category = $('#pfCategory')?.value.trim() || '分类';
    const desc = $('#pfDesc')?.value.trim() || '商品描述会显示在这里，简单说明适用平台与有效期。';
    const price = Number($('#pfPrice')?.value || 0);
    const badge = $('#pfBadge')?.value.trim();
    const features = ($('#pfFeatures')?.value || '')
      .split(/[,，、|]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 3);
    preview.style.setProperty('--accent', `var(--${state.create.accent})`);
    preview.innerHTML = `
      <div class="preview-top">
        <span class="preview-icon">${icon(state.create.icon, 21)}</span>
        ${badge ? `<span class="preview-flag">${esc(badge)}</span>` : ''}
      </div>
      <span class="preview-cat">${esc(category)}</span>
      <h3 class="preview-name">${esc(name)}</h3>
      <p class="preview-desc">${esc(desc)}</p>
      <div class="preview-features">${features.map((f) => `<span>${esc(f)}</span>`).join('')}</div>
      <div class="preview-foot">
        <span class="preview-price"><small>¥</small>${(price || 0).toFixed(2)}</span>
        <span class="preview-stock">库存以实际上架为准</span>
      </div>`;
  }

  function bindCreateForm(editing) {
    const form = $('#createForm');
    form.querySelectorAll('input, textarea').forEach((input) => {
      input.addEventListener('input', renderCreatePreview);
    });

    $('#iconPicker').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-icon-choice]');
      if (!btn) return;
      state.create.icon = btn.dataset.iconChoice;
      $$('#iconPicker .icon-choice').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderCreatePreview();
    });
    $('#accentPicker').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-accent]');
      if (!btn) return;
      state.create.accent = btn.dataset.accent;
      $$('#accentPicker .accent-choice').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderCreatePreview();
    });

    const cards = $('#pfCards');
    if (cards) {
      const counter = $('#createCardsCounter');
      const update = () => {
        counter.textContent = `${new Set(cards.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)).size} 条`;
      };
      cards.addEventListener('input', update);
      update();
    }

    content.querySelectorAll('[data-active]').forEach((checkbox) => {
      checkbox.addEventListener('change', async () => {
        const id = Number(checkbox.dataset.active);
        checkbox.disabled = true;
        try {
          await api(`/api/admin/products/${id}/active`, {
            method: 'POST',
            body: { active: checkbox.checked },
          });
          toast(checkbox.checked ? '商品已上架' : '商品已下架');
          const item = state.products.find((p) => p.id === id);
          if (item) item.active = checkbox.checked;
        } catch (err) {
          checkbox.checked = !checkbox.checked;
          toast(err.message || '操作失败', 'error');
        } finally {
          checkbox.disabled = false;
        }
      });
    });
  }

  /* ============================== 弹窗 / 确认 ============================== */

  function openModal(inner) {
    modalRoot.innerHTML = `<div class="modal-backdrop" id="adminModalBackdrop">${inner}</div>`;
    document.body.classList.add('no-scroll');
    const backdrop = $('#adminModalBackdrop');
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) closeModal();
      if (event.target.closest('[data-close-modal]')) closeModal();
    });
    backdrop.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await copyText(btn.dataset.copy);
        toast(ok ? '已复制' : '复制失败', ok ? 'success' : 'error');
      });
    });
    backdrop.querySelectorAll('[data-order-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleOrderAction(btn.dataset.orderAction, Number(btn.dataset.id)));
    });
  }

  function closeModal() {
    modalRoot.innerHTML = '';
    if (!document.querySelector('.confirm-backdrop')) document.body.classList.remove('no-scroll');
  }

  function confirmDialog({ title, message, confirmText = '确认', danger = true }) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-backdrop confirm-backdrop';
      wrap.innerHTML = `
        <div class="confirm-modal" role="alertdialog" aria-modal="true">
          <div class="confirm-icon">${icon('alert', 19)}</div>
          <h3>${esc(title)}</h3>
          <p>${esc(message)}</p>
          <div class="confirm-actions">
            <button class="btn btn-ghost btn-sm" type="button" data-confirm="0">取消</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" type="button" data-confirm="1">${esc(confirmText)}</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      document.body.classList.add('no-scroll');
      const done = (value) => {
        wrap.remove();
        if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('no-scroll');
        resolve(value);
      };
      wrap.addEventListener('click', (event) => {
        if (event.target === wrap) return done(false);
        const btn = event.target.closest('[data-confirm]');
        if (btn) done(btn.dataset.confirm === '1');
      });
    });
  }

  async function handleOrderAction(action, id) {
    if (action === 'sync') {
      try {
        toast('正在向支付平台查询…', 'info');
        const result = await api(`/api/admin/orders/${id}/resync`, { method: 'POST', body: {} });
        toast(result.paid ? '支付已确认，订单已同步' : result.warning || '暂未查询到支付记录', result.paid ? 'success' : 'info');
        closeModal();
        if (state.currentView === 'sales') loadSalesTable();
        if (state.currentView === 'dashboard') navigate('dashboard', true);
      } catch (err) {
        toast(err.message || '同步失败', 'error');
      }
      return;
    }
    if (action === 'mark') {
      const ok = await confirmDialog({
        title: '手动补单',
        message: '将把该订单标记为已支付并发放卡密。请先确认支付平台确实已收款，避免重复发货。',
        confirmText: '确认补单',
        danger: false,
      });
      if (!ok) return;
      try {
        const result = await api(`/api/admin/orders/${id}/mark-paid`, { method: 'POST', body: {} });
        toast(result.message || '补单完成', result.delivered ? 'success' : 'info');
        closeModal();
        if (state.currentView === 'sales') loadSalesTable();
        if (state.currentView === 'dashboard') navigate('dashboard', true);
      } catch (err) {
        toast(err.message || '补单失败', 'error');
      }
      return;
    }
    if (action === 'close') {
      const ok = await confirmDialog({
        title: '关闭订单',
        message: '关闭后订单锁定的卡密会释放回库存。若买家已付款，请改用“同步支付状态”或“手动补单”。',
        confirmText: '关闭订单',
      });
      if (!ok) return;
      try {
        await api(`/api/admin/orders/${id}/close`, { method: 'POST', body: {} });
        toast('订单已关闭');
        closeModal();
        if (state.currentView === 'sales') loadSalesTable();
        if (state.currentView === 'dashboard') navigate('dashboard', true);
      } catch (err) {
        toast(err.message || '关闭失败', 'error');
      }
    }
  }

  /* ============================== 全局点击委托 ============================== */

  content.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    if (action === 'order-detail') {
      event.preventDefault();
      openOrderDetail(Number(target.dataset.id));
      return;
    }
    if (action === 'sales-page') {
      state.sales.page = Number(target.dataset.page);
      loadSalesTable();
      return;
    }
    if (action === 'cards-page') {
      state.cards.page = Number(target.dataset.page);
      state.cards.selected.clear();
      loadCardsTable();
      return;
    }
    if (action === 'demo-clear') {
      const ok = await confirmDialog({
        title: '清理演示卡密',
        message: '将删除所有批次为 DEMO 且尚未售出的卡密。已售出的演示卡密不会受影响。',
        confirmText: '清理',
      });
      if (!ok) return;
      try {
        const result = await api('/api/admin/demo-clear', { method: 'POST', body: {} });
        toast(`已清理 ${result.deleted} 张演示卡密`);
        navigate('dashboard', true);
      } catch (err) {
        toast(err.message || '清理失败', 'error');
      }
      return;
    }
    if (action === 'low-restock' || action === 'restock-product') {
      state.restock.productId = Number(target.dataset.id);
      location.hash = '#/restock';
      if (state.currentView === 'restock') navigate('restock', true);
      return;
    }
    if (action === 'view-product-cards') {
      state.cards.productId = String(selectedRestockProduct()?.id || '');
      state.cards.status = 'all';
      state.cards.page = 1;
      state.cards.q = '';
      location.hash = '#/cards';
      if (state.currentView === 'cards') navigate('cards', true);
      return;
    }
    if (action === 'export-cards') {
      const query = new URLSearchParams({
        status: state.cards.status,
        productId: state.cards.productId,
        q: state.cards.q,
      });
      window.location.href = `/api/admin/cards/export?${query}`;
      return;
    }
    if (action === 'toggle-secret') {
      const id = Number(target.dataset.id);
      if (state.cards.revealed.has(id)) state.cards.revealed.delete(id);
      else state.cards.revealed.add(id);
      await loadCardsTable();
      return;
    }
    if (action === 'copy-card') {
      const rowCode = target.closest('.secret-cell')?.querySelector('code');
      const text = rowCode?.textContent || '';
      if (text.includes('•')) {
        toast('请先点击眼睛图标显示完整卡密', 'info');
        return;
      }
      const ok = await copyText(text);
      toast(ok ? '卡密已复制' : '复制失败', ok ? 'success' : 'error');
      return;
    }
    if (action === 'delete-card') {
      const ok = await confirmDialog({
        title: '删除卡密',
        message: '仅未售出的卡密可以删除。删除后无法恢复，确定继续吗？',
        confirmText: '删除',
      });
      if (!ok) return;
      try {
        await api(`/api/admin/cards/${target.dataset.id}`, { method: 'DELETE' });
        state.cards.selected.delete(Number(target.dataset.id));
        toast('卡密已删除');
        await loadCardsTable();
        refreshSidebar();
      } catch (err) {
        toast(err.message || '删除失败', 'error');
      }
      return;
    }
    if (action === 'bulk-delete') {
      const ids = [...state.cards.selected];
      if (!ids.length) return;
      const ok = await confirmDialog({
        title: `删除 ${ids.length} 张卡密`,
        message: '仅未售出的卡密会被删除，已售卡密会自动跳过。此操作不可恢复。',
        confirmText: '批量删除',
      });
      if (!ok) return;
      try {
        const result = await api('/api/admin/cards/bulk-delete', { method: 'POST', body: { ids } });
        state.cards.selected.clear();
        toast(`已删除 ${result.deleted} 张卡密`);
        await loadCardsTable();
        refreshSidebar();
      } catch (err) {
        toast(err.message || '删除失败', 'error');
      }
      return;
    }
    if (action === 'edit-product') {
      state.create.editingId = Number(target.dataset.id);
      location.hash = '#/create';
      if (state.currentView === 'create') navigate('create', true);
      return;
    }
    if (action === 'delete-product') {
      const id = Number(target.dataset.id);
      const item = state.products.find((p) => p.id === id);
      const ok = await confirmDialog({
        title: '删除商品',
        message: `将删除「${item ? item.name : '该商品'}」以及它的全部未售卡密，删除后不可恢复。有历史订单的商品不能删除，只能下架。`,
        confirmText: '删除商品',
      });
      if (!ok) return;
      try {
        const result = await api(`/api/admin/products/${id}`, { method: 'DELETE' });
        if (state.create.editingId === id) state.create.editingId = null;
        toast(
          result.deletedCards
            ? `商品已删除，同时清理了 ${result.deletedCards} 张卡密`
            : '商品已删除',
        );
        await loadCreate();
        refreshSidebar();
      } catch (err) {
        toast(err.message || '删除失败', 'error');
      }
      return;
    }
    if (action === 'cancel-edit') {
      state.create.editingId = null;
      await loadCreate();
      return;
    }
    if (action === 'reset-create') {
      state.create.editingId = null;
      state.create.icon = 'card';
      state.create.accent = 'mint';
      await loadCreate();
      toast('表单已重置', 'info');
      return;
    }
    if (action === 'go-restock') {
      event.preventDefault();
      location.hash = '#/restock';
      return;
    }
  });

  /* ============================== 启动 ============================== */

  document.addEventListener('DOMContentLoaded', () => {
    hydrateIcons();
    bindLogin();
    bindChrome();
    checkAuth();
  });
})();
