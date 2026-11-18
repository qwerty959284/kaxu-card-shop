import crypto from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';
import { centsToMoney, nowIso } from './util.js';
import { confirmSelfhostPayment, findOrderByNo } from './shop.js';

const PAY_TYPES = new Set(['alipay', 'wxpay', 'qqpay']);

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
    if (path === '/api.php' && (act === 'order' || act === 'query')) {
      result = queryOrder(body);
    } else if (path === '/api.php' && (act === 'orders' || act === 'orderlist')) {
      result = queryOrders(body);
    } else if (
      path === '/notify.php' ||
      (path === '/api.php' && ['notify', 'report', 'pay', 'callback'].includes(act))
    ) {
      result = reportPayment(body);
    } else if (path === '/submit.php') {
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
