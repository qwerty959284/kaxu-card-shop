(function () {
  const form = document.getElementById('epay-form');
  if (!form) return;
  const submit = () => {
    try {
      form.submit();
    } catch {
      /* 浏览器可能拦截，保留手动按钮 */
    }
  };
  if (document.readyState === 'complete') {
    setTimeout(submit, 120);
  } else {
    window.addEventListener('load', () => setTimeout(submit, 120));
  }
})();
