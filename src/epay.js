import crypto from 'node:crypto';
import { config } from './config.js';
import { centsToMoney } from './util.js';

export const PAY_TYPES = {
  alipay: { label: '支付宝', color: '#1677ff' },
};

/**
 * 易支付 MD5 签名：
 * 1. 过滤空值与 sign / sign_type
 * 2. 参数名 ASCII 升序
 * 3. a=b&c=d 拼接（值不做 URL 编码）
 * 4. 末尾拼接商户密钥后 MD5，小写
 */
export function createSign(params, key = config.epay.key) {
  const pairs = Object.entries(params)
    .filter(([k, v]) => k !== 'sign' && k !== 'sign_type' && v !== '' && v !== null && v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`);
  return crypto.createHash('md5').update(pairs.join('&') + key).digest('hex');
}

export function verifySign(params) {
  const provided = String(params.sign || '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(provided)) return false;
  const expected = createSign(params);
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function buildPayment(order, { baseUrl, ip, device = 'pc' }) {
  const type = 'alipay';
  const params = {
    pid: config.epay.pid,
    type,
    out_trade_no: order.order_no,
    notify_url: `${baseUrl}/api/pay/notify`,
    return_url: `${baseUrl}/order/${order.order_no}?token=${encodeURIComponent(order.access_token)}&paid=1`,
    name: `${order.product_name} x${order.quantity}`,
    money: centsToMoney(order.amount_cents),
    sitename: config.site.name,
    clientip: ip || '127.0.0.1',
    device,
    param: '',
  };
  params.sign = createSign(params);
  params.sign_type = 'MD5';
  return { action: `${config.epay.gateway}/submit.php`, params };
}

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function renderPaymentPage(order, options) {
  const { action, params } = buildPayment(order, options);
  const inputs = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
    .join('\n        ');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>正在跳转支付 · ${config.site.name}</title>
  <link rel="stylesheet" href="/assets/css/store.css">
</head>
<body class="pay-redirect-page">
  <main class="pay-redirect">
    <div class="pay-spinner" aria-hidden="true"></div>
    <p class="pay-redirect-title">正在前往安全支付</p>
    <p class="pay-redirect-sub">订单 ${escapeHtml(order.order_no)} · ¥${centsToMoney(order.amount_cents)}</p>
    <form id="epay-form" method="post" action="${escapeHtml(action)}">
      ${inputs}
      <button type="submit" class="btn btn-primary">如果没有自动跳转，点此继续</button>
    </form>
    <p class="pay-redirect-note">支付过程由易彩豆在线支付提供，本站不保存你的支付账户信息。</p>
  </main>
  <script src="/assets/js/pay.js"></script>
</body>
</html>`;
}

export const isLocalBaseUrl = (url) => /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(url);

/**
 * 主动查询易支付订单，用于回调失败时补单。
 * 文档：/xpay/epay/api.php?act=order&pid=&key=&out_trade_no=
 */
export async function queryRemoteOrder(outTradeNo) {
  const url = new URL(`${config.epay.gateway}/api.php`);
  url.searchParams.set('act', 'order');
  url.searchParams.set('pid', config.epay.pid);
  url.searchParams.set('key', config.epay.key);
  url.searchParams.set('out_trade_no', outTradeNo);

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`支付平台返回 HTTP ${res.status}`);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('支付平台返回了无法解析的数据');
  }
  return data;
}

export function parsePayType() {
  return 'alipay';
}
