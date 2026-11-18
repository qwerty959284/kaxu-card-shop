/* 卡序 · 联系管理员留言弹窗 */
(function () {
  const { icon, api, toast, escapeHtml } = window.KX;
  let modal = null;
  let form = null;
  let orderInput = null;
  let contactInput = null;
  let messageInput = null;
  let errorBox = null;
  let errorText = null;
  let submitBtn = null;

  function build() {
    modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'supportModal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal-card support-modal" role="dialog" aria-modal="true" aria-labelledby="supportTitle">
        <button class="modal-close" type="button" data-support-close aria-label="关闭">
          ${icon('close', 15)}
        </button>
        <div class="support-head">
          <span class="support-head-icon">${icon('mail', 21)}</span>
          <div>
            <small>CONTACT ADMIN</small>
            <h3 id="supportTitle">联系管理员</h3>
          </div>
        </div>
        <p class="support-intro">留言会直接进入后台消息中心。请尽量附上订单号，方便管理员核对支付和发货状态。</p>
        <form id="supportForm">
          <div class="support-grid">
            <label class="field">
              <span class="field-label">订单号 <small>选填</small></span>
              <input class="input" id="supportOrder" type="text" maxlength="40" placeholder="K2026...">
            </label>
            <label class="field">
              <span class="field-label">联系方式 <small>选填</small></span>
              <input class="input" id="supportContact" type="text" maxlength="80" placeholder="QQ / 邮箱 / 手机号">
            </label>
          </div>
          <label class="field" style="margin-top:14px">
            <span class="field-label">留言内容 <small>5-500 字</small></span>
            <textarea class="textarea" id="supportMessage" maxlength="500" placeholder="请描述你遇到的问题，例如：已付款但订单没有发货、卡密无效等"></textarea>
          </label>
          <div class="support-error" id="supportError" hidden>
            ${icon('alert', 13)}
            <span id="supportErrorText"></span>
          </div>
          <button class="btn btn-primary btn-block" type="submit" id="supportSubmit">
            ${icon('arrowRight', 16)} 发送留言
          </button>
        </form>
      </div>`;
    document.body.appendChild(modal);
    form = modal.querySelector('#supportForm');
    orderInput = modal.querySelector('#supportOrder');
    contactInput = modal.querySelector('#supportContact');
    messageInput = modal.querySelector('#supportMessage');
    errorBox = modal.querySelector('#supportError');
    errorText = modal.querySelector('#supportErrorText');
    submitBtn = modal.querySelector('#supportSubmit');

    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
      if (event.target.closest('[data-support-close]')) close();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = messageInput.value.trim();
      if (message.length < 5) {
        errorText.textContent = '请至少填写 5 个字的留言内容';
        errorBox.hidden = false;
        messageInput.focus();
        return;
      }
      errorBox.hidden = true;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner spinner-dark"></span> 正在发送…`;
      try {
        await api('/api/support', {
          method: 'POST',
          body: {
            orderNo: orderInput.value.trim(),
            contact: contactInput.value.trim(),
            message,
          },
        });
        toast('留言已发送，管理员会尽快处理');
        close();
      } catch (err) {
        errorText.textContent = err.message || '发送失败，请稍后再试';
        errorBox.hidden = false;
        submitBtn.disabled = false;
        submitBtn.innerHTML = `${icon('arrowRight', 16)} 发送留言`;
      }
    });
  }

  function open(options = {}) {
    if (!modal) build();
    orderInput.value = options.orderNo || '';
    contactInput.value = options.contact || '';
    messageInput.value = '';
    errorBox.hidden = true;
    submitBtn.disabled = false;
    submitBtn.innerHTML = `${icon('arrowRight', 16)} 发送留言`;
    modal.hidden = false;
    document.body.classList.add('no-scroll');
    setTimeout(() => messageInput.focus(), 60);
  }

  function close() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-support]');
    if (!trigger) return;
    event.preventDefault();
    open({
      orderNo: trigger.dataset.order || '',
      contact: trigger.dataset.contact || '',
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.hidden) close();
  });

  window.KX.openSupport = open;
})();
