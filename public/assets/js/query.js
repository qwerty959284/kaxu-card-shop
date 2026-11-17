/* 卡序 · 订单查询 */
(function () {
  const { $, icon, money, dateTime, escapeHtml, api, hydrateIcons } = window.KX;
  const form = $('#lookupForm');
  const queryInput = $('#lookupQuery');
  const passwordInput = $('#lookupPassword');
  const submitBtn = $('#lookupBtn');
  const errorBox = $('#lookupError');
  const errorText = $('#lookupErrorText');
  const results = $('#lookupResults');

  const statusLabel = {
    pending: '待支付',
    delivered: '已发货',
    paid_pending: '待补货',
    closed: '已关闭',
  };

  const params = new URLSearchParams(location.search);
  if (params.get('order')) queryInput.value = params.get('order');

  const showError = (message) => {
    errorText.textContent = message;
    errorBox.hidden = false;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const query = queryInput.value.trim();
    const password = passwordInput.value.trim();
    if (query.length < 4) {
      showError('请输入完整的订单号、联系方式或卡密');
      queryInput.focus();
      return;
    }
    if (!/^\d{4,12}$/.test(password)) {
      showError('请输入下单时设置的 4-12 位数字查询密码');
      passwordInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner spinner-dark"></span> 正在查询…`;
    try {
      const data = await api('/api/orders/lookup', {
        method: 'POST',
        body: { query, password },
      });
      if (!data.items.length) {
        results.innerHTML = '';
        showError('没有找到匹配的订单，请检查订单号、联系方式或查询密码');
        return;
      }
      results.innerHTML = `
        <div class="query-result-title">找到 ${data.items.length} 笔订单</div>
        ${data.items
          .map(
            (item) => `
          <a class="query-result" href="${escapeHtml(item.orderUrl)}">
            <div class="query-result-main">
              <strong>${escapeHtml(item.productName)}</strong>
              <span>${escapeHtml(item.orderNo)} · ×${item.quantity} · ${dateTime(item.createdAt)}</span>
            </div>
            <div class="query-result-side">
              <b>${money(item.amountCents)}</b>
              <em class="query-status status-${escapeHtml(item.status)}">${statusLabel[item.status] || escapeHtml(item.status)}</em>
            </div>
            ${icon('arrowRight', 15)}
          </a>`,
          )
          .join('')}`;
      hydrateIcons(results);
      results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      results.innerHTML = '';
      showError(err.message || '查询失败，请稍后再试');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `查询订单 ${icon('search', 16)}`;
    }
  });

  hydrateIcons();
})();
