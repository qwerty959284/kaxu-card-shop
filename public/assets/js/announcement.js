/* 卡序 · 首页公告弹窗 */
(function () {
  const { icon } = window.KX;
  let timer = null;

  const closeModal = (backdrop, button) => {
    if (button.disabled) return;
    if (timer) clearInterval(timer);
    timer = null;
    backdrop.classList.add('is-closing');
    document.body.classList.remove('announce-open');
    setTimeout(() => backdrop.remove(), 180);
  };

  const show = (announcement) => {
    if (!announcement || !announcement.enabled || !announcement.title || !announcement.content) return;
    if (document.querySelector('.announce-backdrop')) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'announce-backdrop';
    backdrop.innerHTML = `
      <div class="announce-card" role="dialog" aria-modal="true" aria-labelledby="announceTitle">
        <span class="announce-eyebrow">${icon('bell', 14)} 站点公告</span>
        <h2 id="announceTitle"></h2>
        <div class="announce-body" id="announceBody"></div>
        <div class="announce-foot">
          <span class="announce-tip">请阅读后再关闭</span>
          <button class="btn btn-primary btn-block announce-close" type="button" disabled>3 秒后可关闭</button>
        </div>
      </div>`;

    backdrop.querySelector('#announceTitle').textContent = announcement.title;
    backdrop.querySelector('#announceBody').textContent = announcement.content;

    const button = backdrop.querySelector('.announce-close');
    let remaining = 3;
    button.textContent = `${remaining} 秒后可关闭`;
    timer = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        button.textContent = `${remaining} 秒后可关闭`;
        return;
      }
      clearInterval(timer);
      timer = null;
      button.disabled = false;
      button.textContent = '关闭公告';
      button.focus({ preventScroll: true });
    }, 1000);

    button.addEventListener('click', () => closeModal(backdrop, button));
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) closeModal(backdrop, button);
    });
    const onKey = (event) => {
      if (event.key !== 'Escape' || button.disabled) return;
      document.removeEventListener('keydown', onKey);
      closeModal(backdrop, button);
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(backdrop);
    document.body.classList.add('announce-open');
  };

  const load = async () => {
    try {
      const response = await fetch('/api/announcement', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) return;
      const data = await response.json();
      show(data.announcement);
    } catch {
      /* 公告加载失败不影响购物 */
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load, { once: true });
  } else {
    load();
  }

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) load();
  });
})();
