import crypto from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';
import { centsToMoney, nowIso } from './util.js';
import { confirmSelfhostPayment, findOrderByNo } from './shop.js';

const PAY_TYPES = new Set(['alipay', 'wxpay', 'qqpay']);

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const PAY_NAMES = { wxpay: '微信', alipay: '支付宝', qqpay: 'QQ 钱包' };

export function renderSelfhostPaymentPage(order, { payType, qrcodes = [] } = {}) {
  const types = ['wxpay', 'alipay', 'qqpay'];
  const available = new Set(qrcodes.filter((item) => item.has).map((item) => item.type));
  const requested = types.includes(payType) ? payType : 'wxpay';
  const selected = requested;
  const amount = centsToMoney(order.amount_cents);
  const orderUrl = `/order/${order.order_no}?token=${encodeURIComponent(order.access_token)}`;
  const buttons = types
    .map((type) => {
      const isCurrent = type === selected;
      const enabled = isCurrent && available.has(type);
      const title = enabled
        ? ''
        : (isCurrent ? '该方式还未上传收款码' : `订单指定支付方式为${PAY_NAMES[selected]}`);
      return `<button type="button" class="selfpay-tab${isCurrent ? ' is-active' : ''}${available.has(type) ? '' : ' is-empty'}" data-type="${type}"${enabled ? '' : ' disabled'}${title ? ` title="${title}"` : ''}>${PAY_NAMES[type]}</button>`;
    })
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>支付订单 · ${escapeHtml(config.site.name)}</title>
  <style>
    :root { color-scheme: dark; --mint:#6ff2bf; --line:rgba(255,255,255,.1); --muted:#8b9aa8; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; background:radial-gradient(900px 600px at 50% -10%, rgba(111,242,191,.08), transparent 60%), #070b10; color:#eaf2f0; font-family:Inter,"SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
    .selfpay-card { width:min(420px,100%); padding:28px; border:1px solid var(--line); border-radius:20px; background:linear-gradient(180deg,#111a22,#0b1117); box-shadow:0 24px 70px rgba(0,0,0,.45); }
    .selfpay-head { display:flex; align-items:center; justify-content:space-between; gap:10px; color:var(--muted); font-size:11px; }
    .selfpay-head b { color:#dff8ef; font-weight:600; letter-spacing:.04em; }
    .selfpay-amount { margin:22px 0 4px; font-size:38px; font-weight:700; letter-spacing:-.03em; }
    .selfpay-sub { margin:0; color:var(--muted); font-size:11.5px; line-height:1.6; }
    .selfpay-tabs { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:20px 0 16px; }
    .selfpay-tab { padding:10px 6px; border:1px solid var(--line); border-radius:10px; background:transparent; color:#aab8c4; font:inherit; font-size:11px; cursor:pointer; }
    .selfpay-tab.is-active { border-color:rgba(111,242,191,.5); background:rgba(111,242,191,.08); color:var(--mint); }
    .selfpay-tab.is-empty { opacity:.45; }
    .selfpay-tab:disabled { cursor:not-allowed; }
    .selfpay-qr { position:relative; display:grid; place-items:center; min-height:236px; padding:14px; border:1px solid var(--line); border-radius:14px; background:#fff; }
    .selfpay-qr img { display:block; width:min(240px,100%); height:auto; }
    .selfpay-empty { display:none; padding:18px; color:#5c6672; font-size:12px; text-align:center; line-height:1.7; }
    .selfpay-qr.is-empty img { display:none; }
    .selfpay-qr.is-empty .selfpay-empty { display:block; }
    .selfpay-note { margin:14px 0 0; color:var(--muted); font-size:10.5px; line-height:1.7; text-align:center; }
    .selfpay-status { display:flex; align-items:center; justify-content:center; gap:7px; margin-top:16px; color:#cfe7df; font-size:11px; }
    .selfpay-dot { width:6px; height:6px; border-radius:50%; background:var(--mint); box-shadow:0 0 0 4px rgba(111,242,191,.12); animation:pulse 1.8s ease-in-out infinite; }
    .selfpay-actions { display:flex; gap:8px; margin-top:16px; }
    .selfpay-actions a, .selfpay-actions button { flex:1; display:inline-flex; align-items:center; justify-content:center; min-height:40px; border:1px solid var(--line); border-radius:10px; background:transparent; color:#cfe7df; font:inherit; font-size:11.5px; text-decoration:none; cursor:pointer; }
    .selfpay-actions button { border-color:rgba(111,242,191,.35); background:rgba(111,242,191,.08); color:var(--mint); }
    .selfpay-error { margin-top:14px; padding:10px 12px; border:1px solid rgba(255,122,133,.25); border-radius:9px; background:rgba(255,122,133,.06); color:#ff9ca4; font-size:11px; line-height:1.6; display:none; }
    @keyframes pulse { 50% { opacity:.35; } }
    @media (max-width:480px) { body { padding:14px; } .selfpay-card { padding:20px; } .selfpay-amount { font-size:32px; } }
  </style>
</head>
<body>
  <main class="selfpay-card">
    <div class="selfpay-head"><b>${escapeHtml(config.site.name)} · 订单支付</b><span>${escapeHtml(order.order_no)}</span></div>
    <div class="selfpay-amount">¥${escapeHtml(amount)}</div>
    <p class="selfpay-sub" id="selfpaySub">请使用 ${PAY_NAMES[selected]} 扫码支付，付款金额必须与上方金额一致。</p>
    <div class="selfpay-tabs">${buttons}</div>
    <div class="selfpay-qr${available.has(selected) ? '' : ' is-empty'}" id="selfpayQr">
      <img id="selfpayImage" src="/api/qrcodes/${selected}" alt="${PAY_NAMES[selected]}收款码">
      <div class="selfpay-empty">该支付方式还未上传收款码，请联系管理员；或返回商店重新选择支付方式下单。</div>
    </div>
    <p class="selfpay-note">付款后系统会自动确认，通常 3 - 10 秒到账；请勿关闭本页。金额不一致会导致无法自动发货。</p>
    <div class="selfpay-status"><span class="selfpay-dot"></span><span id="selfpayStatus">正在等待到账…</span></div>
    <div class="selfpay-actions">
      <button type="button" id="selfpayCheck">我已完成支付</button>
      <a href="${escapeHtml(orderUrl)}">查看订单</a>
    </div>
    <div class="selfpay-error" id="selfpayError"></div>
  </main>
<script>
  var orderNo = ${JSON.stringify(order.order_no)};
  var orderToken = ${JSON.stringify(order.access_token)};
  var orderUrl = ${JSON.stringify(orderUrl)};
  var names = { wxpay: '微信', alipay: '支付宝', qqpay: 'QQ 钱包' };
  var hasQr = ${JSON.stringify(Object.fromEntries(types.map((type) => [type, available.has(type)])))};
  var current = ${JSON.stringify(selected)};
  var qr = document.getElementById('selfpayQr');
  var image = document.getElementById('selfpayImage');
  var sub = document.getElementById('selfpaySub');
  var statusEl = document.getElementById('selfpayStatus');
  var errorEl = document.getElementById('selfpayError');
  var finished = false;

  function select(type) {
    if (!hasQr[type]) return;
    current = type;
    document.querySelectorAll('.selfpay-tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-type') === type);
    });
    image.src = '/api/qrcodes/' + type + '?t=' + Date.now();
    image.alt = names[type] + '收款码';
    qr.classList.remove('is-empty');
    sub.textContent = '请使用 ' + names[type] + ' 扫码支付，付款金额必须与上方金额一致。';
  }

  document.querySelectorAll('.selfpay-tab').forEach(function (btn) {
    btn.addEventListener('click', function () { select(btn.getAttribute('data-type')); });
  });

  function finish(message) {
    if (finished) return;
    finished = true;
    statusEl.textContent = message;
    setTimeout(function () { location.href = orderUrl; }, 900);
  }

  async function check() {
    if (finished) return;
    try {
      var res = await fetch('/api/orders/' + orderNo + '?token=' + encodeURIComponent(orderToken), { headers: { Accept: 'application/json' } });
      var data = await res.json();
      if (data.order && data.order.status === 'delivered') { finish('支付成功，正在跳转订单页…'); return; }
      if (data.order && (data.order.status === 'closed' || data.order.status === 'cancelled')) { finish('订单已关闭，正在返回订单页…'); return; }
      statusEl.textContent = '正在等待到账…';
    } catch (err) {
      statusEl.textContent = '网络波动，正在重试…';
    }
  }

  document.getElementById('selfpayCheck').addEventListener('click', async function () {
    errorEl.style.display = 'none';
    await check();
    if (!finished) {
      errorEl.textContent = '还没有收到付款，请确认金额一致、收款码正确，稍等几秒再试。';
      errorEl.style.display = 'block';
    }
  });

  check();
  setInterval(check, 3000);
</script>
</body>
</html>`;
}


export function selfhostSign(params, key = config.selfhost.key) {
  const pairs = Object.entries(params)
    .filter(([k, v]) => k !== 'sign' && k !== 'sign_type' && v !== '' && v !== null && v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`);
  return crypto.createHash('md5').update(pairs.join('&') + key).digest('hex');
}

export function verifySelfhostSign(params) {
  const provided = String(params.sign || '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(provided)) return false;
  const variants = [params, { ...params }, { ...params }];
  delete variants[1].act;
  delete variants[2].act;
  delete variants[2].pid;
  delete variants[2].key;
  return variants.some((variant) => {
    const expected = selfhostSign(variant);
    try {
      return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

export function normalizePayType(value) {
  const text = String(value || '').toLowerCase();
  if (/wx|wechat|weixin/.test(text)) return 'wxpay';
  if (/ali/.test(text)) return 'alipay';
  if (/qq/.test(text)) return 'qqpay';
  return PAY_TYPES.has(text) ? text : text;
}

function logGateway({ method, path, params, ip, note }) {
  try {
    const safe = { ...(params || {}) };
    delete safe.key;
    db.prepare(
      'INSERT INTO gateway_logs (method, path, params, ip, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      method || '',
      path || '',
      JSON.stringify(safe).slice(0, 12000),
      ip || null,
      note || '',
      nowIso(),
    );
  } catch {
    // 日志失败不能影响收款
  }
}

function isPaid(order) {
  return order.status === 'delivered' || order.status === 'paid_pending';
}

function serializeOrder(order) {
  return {
    trade_no: order.trade_no || '',
    out_trade_no: order.order_no,
    type: order.pay_type,
    name: order.product_name,
    money: centsToMoney(order.amount_cents),
    status: isPaid(order) ? 1 : 0,
    addtime: order.created_at,
    endtime: order.paid_at || '',
    order_status: order.status,
    quantity: order.quantity,
  };
}

function moneyToCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function credentialOk(params) {
  if (!config.selfhost.key) return false;
  const pidOk = String(params.pid || '') === String(config.selfhost.pid);
  const keyOk = String(params.key || '') === String(config.selfhost.key);
  if (pidOk && keyOk) return true;
  if (params.sign) return verifySelfhostSign(params);
  return false;
}

function pendingCandidates({ moneyCents, type }) {
  const now = nowIso();
  const rows = db
    .prepare(
      `SELECT * FROM orders
       WHERE status = 'pending' AND amount_cents = ? AND expires_at > ?
       ORDER BY created_at ASC LIMIT 3`,
    )
    .all(moneyCents, now);
  if (!type) return rows;
  return rows.filter((row) => normalizePayType(row.pay_type) === type);
}

/**
 * 兼容易支付/FoxPay 监控端的商户接口。
 * act=order / act=orders 用于监控端校验订单；act=notify / act=report 用于上报收款。
 */
export function handleSelfhostRequest({ method, path, params, ip }) {
  const act = String(params.act || '').toLowerCase();
  const body = params || {};
  let result;

  if (!config.selfhost.key) {
    logGateway({ method, path, params, ip, note: 'not-configured' });
    return {
      status: 503,
      contentType: 'application/json; charset=utf-8',
      body: { code: 503, msg: '自建支付未配置商户密钥' },
    };
  }

  try {
    // 兼容多种路径：/api.php、/xpay/epay/api.php、/api/pay/notify、/notify.php、/submit.php
    const isApiPath = path.includes('/api.php');
    const isNotifyPath = path === '/notify.php' || path === '/api/pay/notify';
    const isSubmitPath = path === '/submit.php';

    if (isApiPath && (act === 'order' || act === 'query')) {
      result = queryOrder(body);
    } else if (isApiPath && (act === 'orders' || act === 'orderlist')) {
      result = queryOrders(body);
    } else if (
      isNotifyPath ||
      (isApiPath && ['notify', 'report', 'pay', 'callback'].includes(act))
    ) {
      result = reportPayment(body);
    } else if (isSubmitPath) {
      result = {
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: '该商城不使用页面跳转下单，请通过商城前台下单。',
      };
    } else {
      logGateway({ method, path, params, ip, note: `unknown-act:${act || '-'}` });
      result = {
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: { code: 1, msg: 'ok', note: 'unknown act logged' },
      };
    }
  } catch (err) {
    const status = err.status || 500;
    logGateway({ method, path, params, ip, note: `error:${err.message}` });
    result = {
      status,
      contentType: path === '/notify.php' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
      body: path === '/notify.php' ? err.message || 'fail' : { code: status === 502 ? 502 : status, msg: err.message || 'fail' },
    };
  }

  if (path === '/notify.php' && result.status === 200 && typeof result.body !== 'string') {
    result = { ...result, contentType: 'text/plain; charset=utf-8', body: 'success' };
  }

  logGateway({
    method,
    path,
    params,
    ip,
    note: `act:${act || '-'} -> ${result.status}`,
  });
  return result;
}

function queryOrder(params) {
  if (!credentialOk(params)) throw httpError('商户密钥错误', 401);
  const orderNo = String(params.out_trade_no || params.order_no || params.trade_no || '').trim();
  const order = orderNo ? findOrderByNo(orderNo) : null;
  if (!order) throw httpError('订单不存在', 404);
  return {
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: { code: 1, msg: '查询成功', ...serializeOrder(order) },
  };
}

function queryOrders(params) {
  if (!credentialOk(params)) throw httpError('商户密钥错误', 401);
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 100);
  const type = params.type ? normalizePayType(params.type) : '';
  const rows = db
    .prepare(
      `SELECT * FROM orders
       WHERE status = 'pending' AND expires_at > ?
       ORDER BY created_at ASC LIMIT ?`,
    )
    .all(nowIso(), limit);
  const list = rows
    .filter((row) => !type || normalizePayType(row.pay_type) === type)
    .map(serializeOrder);
  return {
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: { code: 1, msg: 'success', data: list, list, orders: list },
  };
}

function reportPayment(params) {
  if (!credentialOk(params)) throw httpError('商户密钥错误', 401);
  const statusText = String(params.trade_status || params.status || 'TRADE_SUCCESS');
  if (statusText !== 'TRADE_SUCCESS' && statusText !== '1' && statusText !== 'success') {
    throw httpError('非成功状态', 400);
  }

  const orderNo = String(params.out_trade_no || params.order_no || '').trim();
  const type = params.type ? normalizePayType(params.type) : '';
  const moneyCents = moneyToCents(params.money ?? params.amount ?? params.total_fee);
  let order = orderNo ? findOrderByNo(orderNo) : null;

  if (!order) {
    if (moneyCents === null) throw httpError('缺少订单号或金额', 400);
    const candidates = pendingCandidates({ moneyCents, type });
    if (candidates.length === 0) {
      throw httpError('没有找到匹配对应支付方式和金额的待支付订单，可能已过期', 502);
    }
    if (candidates.length > 1) {
      throw httpError('同金额待支付订单不止一个，请手动补单', 502);
    }
    order = candidates[0];
  }

  if (order.status === 'closed') throw httpError('订单已关闭或已过期', 502);
  if (new Date(order.expires_at).getTime() <= Date.now()) {
    throw httpError('订单已过期，请重新下单', 502);
  }
  if (moneyCents !== null && moneyCents !== order.amount_cents) {
    throw httpError('支付金额与订单金额不匹配', 502);
  }
  if (isPaid(order)) {
    return {
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: { code: 1, msg: 'success', already: true, ...serializeOrder(order) },
    };
  }

  const tradeNo = String(params.trade_no || params.transaction_id || `SELF-${Date.now()}`).slice(0, 80);
  const delivered = confirmSelfhostPayment(order, { tradeNo, source: 'selfhost' });
  return {
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: {
      code: 1,
      msg: 'success',
      delivered: delivered.delivered,
      order_status: delivered.order.status,
      ...serializeOrder(delivered.order),
    },
  };
}

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function selfhostConfig() {
  return {
    enabled: Boolean(config.selfhost.key),
    pid: config.selfhost.pid,
    key: config.selfhost.key,
    address: config.publicBaseUrl,
  };
}
