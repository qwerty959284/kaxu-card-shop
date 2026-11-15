/* 卡序 · 订单状态与卡密提取 */
(function () {
  const { $, icon, money, escapeHtml, fullDateTime, api, toast, copyText, hydrateIcons } = window.KX;
  const root = $('#orderContent');
  const params = new URLSearchParams(location.search);
  const orderNo = location.pathname.split('/').filter(Boolean).pop() || '';
  const token = params.get('token') || '';
  const returnedFromPay = params.get('paid') === '1';

  let order = null;
  let pollTimer = null;
  let countdownTimer = null;
  let syncing = false;
  let stopped = false;

  const payLabel = () => '支付宝';

  const statusMeta = (status) => {
    switch (status) {
      case 'delivered':
        return {
          className: 'is-success',
          badge: '支付成功',
          title: '卡密已自动发放',
          desc: '支付已确认，卡密已全部分配到本订单。请立即复制并妥善保存，不要转发给他人。',
        };
      case 'paid_pending':
        return {
          className: 'is-pending',
          badge: '已付款 · 待补货',
          title: '款项已到账，正在补货',
          desc: '支付已确认，但当前库存不足。管理员补货后系统会自动发放卡密，请稍后刷新本页。',
        };
      case 'closed':
        return {
          className: 'is-closed',
          badge: '订单已关闭',
          title: '这笔订单已关闭',
          desc: '订单超过支付时限，锁定的卡密已自动释放。如果你已经完成付款，可以点击“同步订单”找回。',
        };
      default:
        return {
          className: 'is-pending',
          badge: '等待支付',
          title: '订单已创建，等待支付',
          desc: '卡密已为你锁定。请在倒计时结束前完成支付，支付成功后本页会自动刷新。',
        };
    }
  };

  const timeline = (status) => {
    const paid = status === 'delivered' || status === 'paid_pending';
    const delivered = status === 'delivered';
    const step = (done, current, label, hint) =>
      `<div class="timeline-step${done ? ' done' : ''}${current ? ' current' : ''}"><strong>${label}</strong><br>${hint}</div>`;
    return `
      <div class="order-timeline">
        ${step(true, false, '创建订单', '卡密已锁定')}
        ${step(paid, status === 'pending', '支付确认', paid ? '款项已到账' : '等待支付结果')}
        ${step(delivered, status === 'paid_pending', '自动发货', delivered ? '卡密已发放' : '等待库存')}
      </div>`;
  };

  const pendingPanel = () => `
    <div class="pending-panel">
      <span class="pending-spinner" aria-hidden="true"></span>
      <div>
        <strong>正在等待支付确认</strong>
        <p>支付完成后通常 3 - 10 秒自动到账。若已付款，可手动触发一次查单。</p>
      </div>
      <button class="icon-btn" type="button" data-action="sync" title="我已完成支付，立即查单" aria-label="我已完成支付，立即查单">
        ${icon('refresh', 15)}
      </button>
    </div>`;

  const secretsPanel = () => {
    if (!order.cards || !order.cards.length) return '';
    return `
      <div class="order-secrets">
        <div class="secrets-head">
          <strong>${icon('key', 15)} 你的卡密 · ${order.cards.length} 张</strong>
          <button class="btn btn-ghost btn-sm" type="button" data-action="copy-all">${icon('copy', 13)} 复制全部</button>
        </div>
        ${order.cards
          .map(
            (secret, index) => `
          <div class="secret-row">
            <code>${escapeHtml(secret)}</code>
            <button class="icon-btn" type="button" data-action="copy" data-index="${index}" aria-label="复制第 ${index + 1} 张卡密">${icon('copy', 14)}</button>
          </div>`,
          )
          .join('')}
        <p class="secrets-tip">请勿将卡密泄露给他人。建议现在复制保存，并收藏本订单页链接。</p>
      </div>`;
  };

  const render = () => {
    if (!order) return;
    const meta = statusMeta(order.status);
    const countdown =
      order.status === 'pending'
        ? `<div class="purchase-row" style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
             <span class="purchase-row-label">支付剩余时间<small>超时后卡密将自动释放</small></span>
             <span class="mono" id="countdownText" style="color:var(--amber);font-size:13px">--:--</span>
           </div>`
        : '';

    const actions = [];
    if (order.status === 'pending') {
      actions.push(
        `<a class="btn btn-primary" href="/pay/${encodeURIComponent(order.orderNo)}?token=${encodeURIComponent(token)}&type=${encodeURIComponent(order.payType)}">${icon('wallet', 16)} 重新发起支付</a>`,
      );
      actions.push(
        `<button class="btn btn-ghost" type="button" data-action="sync">${icon('refresh', 16)} 我已完成支付</button>`,
      );
    } else if (order.status === 'delivered') {
      actions.push(
        `<button class="btn btn-primary" type="button" data-action="copy-all">${icon('copy', 16)} 复制全部卡密</button>`,
      );
      actions.push(`<a class="btn btn-ghost" href="/#products">${icon('bag', 16)} 再买一张</a>`);
    } else if (order.status === 'closed') {
      actions.push(
        `<button class="btn btn-primary" type="button" data-action="sync">${icon('refresh', 16)} 我已完成支付，同步订单</button>`,
      );
      actions.push(`<a class="btn btn-ghost" href="/#products">${icon('bag', 16)} 重新选购</a>`);
    } else {
      actions.push(
        `<button class="btn btn-primary" type="button" data-action="sync">${icon('refresh', 16)} 刷新发货状态</button>`,
      );
      actions.push(`<a class="btn btn-ghost" href="/#products">${icon('bag', 16)} 返回商店</a>`);
    }

    const metaItems = [
      ['订单号', order.orderNo],
      ['创建时间', fullDateTime(order.createdAt)],
      ['支付方式', payLabel(order.payType)],
    ];
    if (order.paidAt) metaItems.push(['支付时间', fullDateTime(order.paidAt)]);
    if (order.deliveredAt) metaItems.push(['发货时间', fullDateTime(order.deliveredAt)]);

    root.innerHTML = `
      <div class="order-status-head ${meta.className}">
        <span class="status-badge ${order.status === 'pending' ? 'pending' : order.status === 'closed' ? 'closed' : ''}">
          <i></i>${meta.badge}
        </span>
        <h1>${meta.title}</h1>
        <p>${meta.desc}</p>
        ${countdown}
      </div>

      <div class="order-summary">
        <span class="order-summary-icon">${icon('card', 21)}</span>
        <div class="order-summary-text">
          <strong>${escapeHtml(order.productName)}</strong>
          <span>数量 × ${order.quantity} · 单价 ${money(order.unitPriceCents)}</span>
        </div>
        <span class="order-summary-price"><small>¥</small>${(order.amountCents / 100).toFixed(2)}</span>
      </div>

      <div class="order-body">
        ${timeline(order.status)}
        <div class="order-meta">
          ${metaItems
            .map(
              ([label, value]) =>
                `<div class="order-meta-item"><span>${label}</span><strong title="${escapeHtml(value)}">${escapeHtml(value)}</strong></div>`,
            )
            .join('')}
        </div>

        ${order.status === 'pending' ? pendingPanel() : ''}
        ${order.status === 'delivered' || order.status === 'paid_pending' ? secretsPanel() : ''}
        ${
          order.status === 'paid_pending'
            ? `<div class="pending-panel" style="border-color:rgba(255,197,110,.18);background:rgba(255,197,110,.04)">
                 <span class="pending-spinner" style="border-top-color:var(--amber)"></span>
                 <div><strong>正在等待补货</strong><p>补货完成后会自动发放，无需重复付款。如有急用请联系管理员。</p></div>
               </div>`
            : ''
        }
        ${
          order.status === 'closed'
            ? `<div class="pending-panel" style="border-color:var(--line);background:rgba(255,255,255,.02)">
                 <div><strong style="color:var(--muted)">订单已超时关闭</strong><p>如果你确认已经付款，点击下方“同步订单”让系统重新核对支付平台记录。</p></div>
               </div>`
            : ''
        }

        <div class="order-actions">${actions.join('')}</div>
      </div>`;

    hydrateIcons(root);
    startCountdown();
    renderPolling();
  };

  const startCountdown = () => {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    if (!order || order.status !== 'pending') return;
    const target = new Date(order.expiresAt).getTime();
    const tick = () => {
      const el = $('#countdownText');
      if (!el) return;
      const remain = Math.max(0, target - Date.now());
      const mm = String(Math.floor(remain / 60000)).padStart(2, '0');
      const ss = String(Math.floor((remain % 60000) / 1000)).padStart(2, '0');
      el.textContent = remain > 0 ? `${mm}:${ss}` : '已超时';
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  };

  const stopTimers = () => {
    if (pollTimer) clearInterval(pollTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    pollTimer = null;
    countdownTimer = null;
  };

  const renderPolling = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (!order || order.status !== 'pending') return;
    pollTimer = setInterval(async () => {
      if (document.hidden || stopped) return;
      await refresh({ sync: true });
    }, 5000);
  };

  async function refresh({ sync = false, force = false } = {}) {
    if (!orderNo || !token) return;
    try {
      const query = new URLSearchParams({ token });
      if (sync) query.set('sync', '1');
      if (force) query.set('force', '1');
      const data = await api(`/api/orders/${encodeURIComponent(orderNo)}?${query}`);
      const changed = order && order.status !== data.order.status;
      order = data.order;
      render();
      if (changed && order.status === 'delivered') {
        toast('支付成功，卡密已发放', 'success');
      }
    } catch (err) {
      stopTimers();
      renderError(err.message || '订单查询失败');
    }
  }

  const renderError = (message) => {
    stopped = true;
    root.innerHTML = `
      <div class="empty-state" style="padding:64px 24px">
        ${icon('alert', 38)}
        <strong>${escapeHtml(message)}</strong>
        <p>请确认你使用的是下单后生成的完整订单链接。</p>
        <a class="btn btn-ghost btn-sm" href="/" style="margin-top:8px">返回商店</a>
      </div>`;
  };

  const manualSync = async () => {
    if (syncing) return;
    syncing = true;
    const buttons = document.querySelectorAll('[data-action="sync"]');
    buttons.forEach((b) => {
      b.disabled = true;
      b.dataset.original = b.innerHTML;
      b.innerHTML = `<span class="spinner" style="width:14px;height:14px"></span> 查询中…`;
    });
    try {
      const data = await api(`/api/orders/${encodeURIComponent(orderNo)}/sync`, {
        method: 'POST',
        body: { token },
      });
      order = data.order;
      render();
      if (data.paid) {
        toast('支付已确认，卡密已更新', 'success');
      } else if (data.warning) {
        toast(data.warning, 'error');
      } else {
        toast('暂未查询到支付记录，请完成支付后再试', 'info');
      }
    } catch (err) {
      toast(err.message || '同步失败，请稍后重试', 'error');
      buttons.forEach((b) => {
        b.disabled = false;
        if (b.dataset.original) b.innerHTML = b.dataset.original;
      });
    } finally {
      syncing = false;
    }
  };

  root.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'sync') {
      await manualSync();
      return;
    }
    if (action === 'copy-all') {
      const ok = await copyText((order.cards || []).join('\n'));
      toast(ok ? '全部卡密已复制' : '复制失败，请手动选择文本', ok ? 'success' : 'error');
      return;
    }
    if (action === 'copy') {
      const secret = order.cards[Number(target.dataset.index)];
      if (!secret) return;
      const ok = await copyText(secret);
      toast(ok ? '卡密已复制' : '复制失败，请手动选择文本', ok ? 'success' : 'error');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && order && order.status === 'pending' && !stopped) {
      refresh({ sync: true });
    }
  });

  document.addEventListener('DOMContentLoaded', async () => {
    hydrateIcons();
    if (!/^K[A-Z0-9]+$/.test(orderNo)) {
      renderError('订单号格式不正确');
      return;
    }
    if (!token) {
      renderError('订单链接缺少访问凭证');
      return;
    }
    await refresh({ sync: true, force: returnedFromPay });
  });
})();
