import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './src/config.js';
import { db } from './src/db.js';
import {
  AppError,
  adminOrderDetail,
  clearDemoCards,
  closeOrder,
  createOrder,
  createProduct,
  dashboardData,
  deleteCards,
  deleteProduct,
  exportCardsCsv,
  findOrderByNo,
  getClientOrder,
  handleNotify,
  listAdminOrders,
  listBatches,
  listCards,
  listPublicProducts,
  manualMarkPaid,
  productStats,
  releaseExpiredOrders,
  restockProduct,
  resyncAdminOrder,
  serializeClientOrder,
  setProductActive,
  syncOrderWithProvider,
  updateProduct,
} from './src/shop.js';
import {
  cleanupSessions,
  clearSessionCookie,
  login,
  logout,
  requireAdmin,
  requireCsrf,
  sessionCookie,
} from './src/auth.js';
import { isLocalBaseUrl, renderPaymentPage } from './src/epay.js';
import { clientIp, csvEscape, safeEqual, shanghaiDateKey } from './src/util.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const gatewayOrigin = new URL(config.epay.gateway).origin;

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "font-src 'self' data:",
      `form-action 'self' ${gatewayOrigin}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join('; '),
  );
}

function send(res, status, body, contentType = 'text/plain; charset=utf-8', headers = {}) {
  securityHeaders(res);
  res.writeHead(status, { 'Content-Type': contentType, ...headers });
  res.end(body);
}

function json(res, status, payload) {
  send(res, status, JSON.stringify(payload), 'application/json; charset=utf-8', {
    'Cache-Control': 'no-store',
  });
}

function html(res, status, body) {
  send(res, status, body, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
}

function requestBaseUrl(req) {
  if (config.publicBaseUrl) return config.publicBaseUrl;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  const host =
    String(req.headers['x-forwarded-host'] || '').split(',')[0].trim() ||
    req.headers.host ||
    `127.0.0.1:${config.port}`;
  return `${proto}://${host}`;
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new AppError('请求内容过大', 413, 'BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new AppError('请求格式错误', 400, 'INVALID_JSON');
  }
}

async function readParams(req, url) {
  if (req.method === 'GET') return Object.fromEntries(url.searchParams.entries());
  const type = String(req.headers['content-type'] || '');
  const buf = await readBody(req);
  if (!buf.length) return {};
  const text = buf.toString('utf8');
  if (type.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new AppError('请求格式错误', 400, 'INVALID_JSON');
    }
  }
  return Object.fromEntries(new URLSearchParams(text).entries());
}

function parseIntOr(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseLines(text, max = 5000) {
  if (typeof text !== 'string') return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizeProductPayload(body) {
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  let features;
  if (has('features')) {
    features =
      typeof body.features === 'string'
        ? body.features.split(/[,，、|]/).map((x) => x.trim()).filter(Boolean)
        : Array.isArray(body.features)
          ? body.features
          : [];
  }
  let priceCents;
  if (has('priceCents')) priceCents = body.priceCents;
  else if (has('price')) priceCents = Math.round(Number(body.price) * 100);
  let originalPriceCents;
  if (has('originalPriceCents')) originalPriceCents = body.originalPriceCents;
  else if (has('originalPrice')) {
    originalPriceCents = body.originalPrice ? Math.round(Number(body.originalPrice) * 100) : null;
  }
  return {
    name: body.name,
    category: body.category,
    description: body.description,
    priceCents,
    originalPriceCents,
    badge: body.badge,
    icon: body.icon,
    accent: body.accent,
    features,
    active: body.active,
  };
}

function adminOrderPayload(result) {
  if (!result) return null;
  const order = result.order || result;
  return {
    id: order.id,
    orderNo: order.order_no,
    productName: order.product_name,
    quantity: order.quantity,
    amountCents: order.amount_cents,
    status: order.status,
    payType: order.pay_type,
    tradeNo: order.trade_no,
    paidAt: order.paid_at,
    note: order.note,
  };
}

/* ============================== API ============================== */

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const ip = clientIp(req);

  if (pathname === '/api/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'kaxu-card-shop',
      paymentsConfigured: Boolean(config.epay.key && config.epay.pid),
      time: new Date().toISOString(),
    });
  }

  if (pathname === '/api/store' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      site: { name: config.site.name, domain: config.site.domain },
      products: listPublicProducts(),
      payTypes: config.paymentMethods.map((id) => ({
        id,
        label: id === 'wxpay' ? '微信支付' : '支付宝',
      })),
    });
  }

  if (pathname === '/api/orders' && req.method === 'POST') {
    const body = await readJson(req);
    const order = createOrder({
      productId: body.productId,
      quantity: body.quantity,
      contact: String(body.contact || '').trim().slice(0, 80),
      payType: body.payType,
      ip,
    });
    const baseUrl = requestBaseUrl(req);
    return json(res, 201, {
      ok: true,
      order: {
        orderNo: order.order_no,
        token: order.access_token,
        amountCents: order.amount_cents,
        quantity: order.quantity,
        productName: order.product_name,
        payType: order.pay_type,
        expiresAt: order.expires_at,
      },
      payUrl: `/pay/${order.order_no}?token=${encodeURIComponent(order.access_token)}`,
      orderUrl: `${baseUrl}/order/${order.order_no}?token=${encodeURIComponent(order.access_token)}`,
    });
  }

  const orderMatch = pathname.match(/^\/api\/orders\/([A-Z0-9]+)$/);
  if (orderMatch && req.method === 'GET') {
    const token = url.searchParams.get('token') || '';
    const order = getClientOrder(orderMatch[1], token);
    let current = order;
    if (url.searchParams.get('sync') === '1' && order.status !== 'delivered') {
      const result = await syncOrderWithProvider(order, { force: url.searchParams.get('force') === '1' });
      current = result.order;
    }
    return json(res, 200, { ok: true, order: serializeClientOrder(current) });
  }

  const syncMatch = pathname.match(/^\/api\/orders\/([A-Z0-9]+)\/sync$/);
  if (syncMatch && req.method === 'POST') {
    const body = await readJson(req);
    const order = getClientOrder(syncMatch[1], String(body.token || ''));
    const result = await syncOrderWithProvider(order, { force: true });
    return json(res, 200, {
      ok: true,
      paid: result.paid,
      synced: result.synced,
      warning: result.error || (result.amountMismatch ? '支付金额与订单金额不一致，请联系客服' : ''),
      order: serializeClientOrder(result.order),
    });
  }

  if (pathname === '/api/pay/notify' && (req.method === 'GET' || req.method === 'POST')) {
    const params = await readParams(req, url);
    try {
      handleNotify(params, ip);
      return send(res, 200, 'success', 'text/plain; charset=utf-8');
    } catch (err) {
      const message = err instanceof AppError ? err.message : 'fail';
      return send(res, err.status || 400, err.code === 'IGNORED' ? 'success' : message, 'text/plain; charset=utf-8');
    }
  }

  /* ----------------------------- 管理端 ----------------------------- */

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const body = await readJson(req);
    const result = login(body.username, body.password, req);
    res.setHeader('Set-Cookie', sessionCookie(result.token, req, config.sessionHours * 3600));
    return json(res, 200, {
      ok: true,
      admin: result.admin,
      csrf: result.csrf,
      expiresAt: result.expiresAt,
    });
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    logout(req);
    res.setHeader('Set-Cookie', clearSessionCookie(req));
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/me' && req.method === 'GET') {
    const session = requireAdmin(req);
    return json(res, 200, {
      ok: true,
      admin: { username: session.username },
      csrf: session.csrf,
      expiresAt: session.expiresAt,
      callbackBase: requestBaseUrl(req),
      callbackWarning: isLocalBaseUrl(requestBaseUrl(req))
        ? '当前回调地址是本机地址，支付平台无法访问。部署到公网域名后，请在 .env 设置 PUBLIC_BASE_URL。'
        : '',
      epay: {
        pid: config.epay.pid,
        gateway: config.epay.gateway,
        configured: Boolean(config.epay.key && config.epay.pid),
      },
    });
  }

  if (pathname.startsWith('/api/admin/')) {
    const session = requireAdmin(req);
    const mutating = !['GET', 'HEAD'].includes(req.method);
    if (mutating) requireCsrf(req, session);
    return handleAdminApi(req, res, url, session);
  }

  throw new AppError('接口不存在', 404, 'NOT_FOUND');
}

async function handleAdminApi(req, res, url, session) {
  const pathname = url.pathname;

  if (pathname === '/api/admin/dashboard' && req.method === 'GET') {
    return json(res, 200, { ok: true, ...dashboardData() });
  }

  if (pathname === '/api/admin/orders' && req.method === 'GET') {
    const data = listAdminOrders({
      status: url.searchParams.get('status') || 'all',
      q: (url.searchParams.get('q') || '').trim().slice(0, 80),
      page: parseIntOr(url.searchParams.get('page'), 1),
      pageSize: 12,
    });
    return json(res, 200, { ok: true, ...data });
  }

  const orderDetailMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
  if (orderDetailMatch && req.method === 'GET') {
    return json(res, 200, { ok: true, ...adminOrderDetail(Number(orderDetailMatch[1])) });
  }

  const orderActionMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)\/(resync|mark-paid|close)$/);
  if (orderActionMatch && req.method === 'POST') {
    const id = Number(orderActionMatch[1]);
    const action = orderActionMatch[2];
    if (action === 'resync') {
      const result = await resyncAdminOrder(id);
      return json(res, 200, {
        ok: true,
        paid: result.paid,
        warning: result.error || (result.amountMismatch ? '支付金额与订单金额不一致' : ''),
        order: adminOrderPayload(result),
      });
    }
    if (action === 'mark-paid') {
      const result = manualMarkPaid(id);
      return json(res, 200, {
        ok: true,
        delivered: result.delivered,
        order: adminOrderPayload(result),
        message: result.delivered ? '已手动补单并发放卡密' : '已标记付款，但库存不足，请先补充卡密',
      });
    }
    const order = closeOrder(id);
    return json(res, 200, { ok: true, order: adminOrderPayload(order) });
  }

  if (pathname === '/api/admin/products' && req.method === 'GET') {
    return json(res, 200, { ok: true, items: productStats() });
  }

  if (pathname === '/api/admin/products' && req.method === 'POST') {
    const body = await readJson(req);
    const result = createProduct(normalizeProductPayload(body), parseLines(body.cardsText || ''));
    return json(res, 201, { ok: true, ...result });
  }

  const productMatch = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
  if (productMatch && req.method === 'PATCH') {
    const body = await readJson(req);
    const product = updateProduct(Number(productMatch[1]), normalizeProductPayload(body));
    return json(res, 200, { ok: true, product });
  }

  if (productMatch && req.method === 'DELETE') {
    const result = deleteProduct(Number(productMatch[1]));
    return json(res, 200, { ok: true, ...result });
  }

  const productActiveMatch = pathname.match(/^\/api\/admin\/products\/(\d+)\/active$/);
  if (productActiveMatch && req.method === 'POST') {
    const body = await readJson(req);
    setProductActive(Number(productActiveMatch[1]), Boolean(body.active));
    return json(res, 200, { ok: true });
  }

  const restockMatch = pathname.match(/^\/api\/admin\/products\/(\d+)\/restock$/);
  if (restockMatch && req.method === 'POST') {
    const body = await readJson(req);
    const result = restockProduct(
      Number(restockMatch[1]),
      parseLines(body.cardsText || ''),
      String(body.batch || '').trim().slice(0, 40),
    );
    return json(res, 200, { ok: true, ...result });
  }

  const batchesMatch = pathname.match(/^\/api\/admin\/products\/(\d+)\/batches$/);
  if (batchesMatch && req.method === 'GET') {
    return json(res, 200, { ok: true, items: listBatches(Number(batchesMatch[1])) });
  }

  if (pathname === '/api/admin/cards' && req.method === 'GET') {
    const data = listCards({
      status: url.searchParams.get('status') || 'all',
      productId: url.searchParams.get('productId') || '',
      q: (url.searchParams.get('q') || '').trim().slice(0, 100),
      batch: (url.searchParams.get('batch') || '').trim().slice(0, 40),
      page: parseIntOr(url.searchParams.get('page'), 1),
      pageSize: 15,
    });
    return json(res, 200, { ok: true, ...data });
  }

  if (pathname === '/api/admin/cards/export' && req.method === 'GET') {
    const rows = exportCardsCsv({
      status: url.searchParams.get('status') || 'all',
      productId: url.searchParams.get('productId') || '',
      q: (url.searchParams.get('q') || '').trim().slice(0, 100),
      batch: (url.searchParams.get('batch') || '').trim().slice(0, 40),
    });
    const statusText = { available: '未售', reserved: '锁定', sold: '已售' };
    const header = ['ID', '商品', '卡密', '状态', '批次', '订单号', '入库时间', '售出时间'];
    const lines = [header.map(csvEscape).join(',')];
    for (const row of rows) {
      lines.push(
        [
          row.id,
          row.product_name,
          row.secret,
          statusText[row.status] || row.status,
          row.batch || '',
          row.order_no || '',
          row.created_at,
          row.sold_at || '',
        ]
          .map((v) => {
            const s = String(v ?? '');
            return csvEscape(/^[=+\-@]/.test(s) ? `'${s}` : s);
          })
          .join(','),
      );
    }
    const filename = `cards-${shanghaiDateKey()}.csv`;
    return send(res, 200, `\uFEFF${lines.join('\r\n')}`, 'text/csv; charset=utf-8', {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    });
  }

  const cardDeleteMatch = pathname.match(/^\/api\/admin\/cards\/(\d+)$/);
  if (cardDeleteMatch && req.method === 'DELETE') {
    const count = deleteCards([Number(cardDeleteMatch[1])]);
    return json(res, 200, { ok: true, deleted: count });
  }

  if (pathname === '/api/admin/cards/bulk-delete' && req.method === 'POST') {
    const body = await readJson(req);
    const count = deleteCards(Array.isArray(body.ids) ? body.ids : []);
    return json(res, 200, { ok: true, deleted: count });
  }

  if (pathname === '/api/admin/demo-clear' && req.method === 'POST') {
    const count = clearDemoCards();
    return json(res, 200, { ok: true, deleted: count });
  }

  throw new AppError('接口不存在', 404, 'NOT_FOUND');
}

/* ============================ 静态页面 ============================ */

function serveFile(req, res, filePath, { download = false } = {}) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  securityHeaders(res);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-store' : 'no-cache',
    ...(download ? { 'Content-Disposition': 'attachment' } : {}),
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (decoded.includes('\0')) return false;
  const target = path.resolve(config.publicDir, `.${decoded}`);
  if (!target.startsWith(config.publicDir + path.sep) && target !== config.publicDir) return false;
  if (path.basename(target).startsWith('.')) return false;
  return serveFile(req, res, target);
}

function notFoundPage(res) {
  html(
    res,
    404,
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>页面不存在 · ${config.site.name}</title><link rel="stylesheet" href="/assets/css/store.css"></head><body class="error-page"><div><p class="error-code">404</p><h1>这张卡，好像不存在</h1><p>你访问的页面可能已被移除，或者链接有误。</p><a class="btn btn-primary" href="/">返回首页</a></div></body></html>`,
  );
}

/* ============================== 路由 ============================== */

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    if (pathname === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
      return serveFile(req, res, path.join(config.publicDir, 'index.html'));
    }
    if ((pathname === '/admin' || pathname === '/admin/') && (req.method === 'GET' || req.method === 'HEAD')) {
      return serveFile(req, res, path.join(config.publicDir, 'admin.html'));
    }
    const orderPage = pathname.match(/^\/order\/[A-Z0-9]+$/);
    if (orderPage && (req.method === 'GET' || req.method === 'HEAD')) {
      return serveFile(req, res, path.join(config.publicDir, 'order.html'));
    }
    const payMatch = pathname.match(/^\/pay\/([A-Z0-9]+)$/);
    if (payMatch && req.method === 'GET') {
      if (!config.epay.key) {
        return html(
          res,
          503,
          '<div style="font-family:sans-serif;padding:48px;background:#070b10;color:#eee;min-height:100vh"><h1>支付通道未配置</h1><p>管理员尚未配置 EPAY_KEY，暂时无法发起支付。</p><a style="color:#6ff2bf" href="/">返回首页</a></div>',
        );
      }
      const token = url.searchParams.get('token') || '';
      const order = findOrderByNo(payMatch[1]);
      if (!order) return notFoundPage(res);
      if (order.status !== 'pending') {
        res.writeHead(302, {
          Location: `/order/${order.order_no}?token=${encodeURIComponent(order.access_token)}`,
        });
        return res.end();
      }
      const payType = url.searchParams.get('type') || order.pay_type;
      if (!token || !safeEqual(order.access_token, token)) {
        return html(res, 403, '<p>支付链接无效，请返回订单页重新发起支付。</p>');
      }
      if (new Date(order.expires_at).getTime() <= Date.now()) {
        releaseExpiredOrders();
        res.writeHead(302, { Location: `/order/${order.order_no}?token=${encodeURIComponent(order.access_token)}` });
        return res.end();
      }
      return html(
        res,
        200,
        renderPaymentPage(order, {
          baseUrl: requestBaseUrl(req),
          payType,
          ip: clientIp(req),
          device: /Mobile|Android|iPhone/i.test(req.headers['user-agent'] || '') ? 'mobile' : 'pc',
        }),
      );
    }

    if (pathname === '/favicon.ico') {
      return serveFile(req, res, path.join(config.publicDir, 'favicon.svg'));
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (serveStatic(req, res, pathname)) return;
    }

    if (pathname.startsWith('/api/')) return json(res, 404, { ok: false, error: '接口不存在' });
    return notFoundPage(res);
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    const message = err instanceof AppError ? err.message : '服务器开小差了，请稍后再试';
    if (!(err instanceof AppError)) console.error(`[error] ${req.method} ${pathname}`, err);
    if (res.headersSent) {
      res.end();
      return;
    }
    if (pathname.startsWith('/api/')) {
      return json(res, status, { ok: false, error: message, code: err.code || 'INTERNAL_ERROR' });
    }
    return html(
      res,
      status,
      `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>出错了</title></head><body style="font-family:sans-serif;padding:48px"><h1>${status}</h1><p>${message}</p><a href="/">返回首页</a></body></html>`,
    );
  } finally {
    if (config.isProduction && Date.now() - started > 1500) {
      console.log(`[slow] ${req.method} ${pathname} ${Date.now() - started}ms`);
    }
  }
});

/* ============================ 后台任务 ============================ */

let reconciling = false;
async function reconcilePendingOrders() {
  if (reconciling) return;
  reconciling = true;
  try {
    const rows = db
      .prepare(
        `SELECT * FROM orders
         WHERE status = 'pending' AND created_at >= ?
           AND (last_checked_at IS NULL OR last_checked_at <= ?)
         ORDER BY id ASC LIMIT 8`,
      )
      .all(new Date(Date.now() - 3 * 3_600_000).toISOString(), new Date(Date.now() - 2 * 60_000).toISOString());
    for (const order of rows) {
      await syncOrderWithProvider(order, { force: true });
    }
  } catch (err) {
    console.error('[reconcile]', err.message);
  } finally {
    reconciling = false;
  }
}

setInterval(() => {
  try {
    releaseExpiredOrders();
  } catch (err) {
    console.error('[expire]', err.message);
  }
}, 60_000).unref();

setInterval(cleanupSessions, 30 * 60_000).unref();
setInterval(reconcilePendingOrders, 2 * 60_000).unref();

server.listen(config.port, config.host, () => {
  const base = config.publicBaseUrl || `http://127.0.0.1:${config.port}`;
  console.log('');
  console.log('  卡序 · 数字卡密商城已启动');
  console.log(`  前台  ${base}`);
  console.log(`  后台  ${base}/admin`);
  console.log(`  回调  ${base}/api/pay/notify`);
  if (!config.epay.key) {
    console.log('  警告  未配置 EPAY_KEY，支付通道不可用');
  }
  if (isLocalBaseUrl(base)) {
    console.log('  提示  当前是本机地址，线上支付回调需要配置 PUBLIC_BASE_URL 或使用 Render');
  }
  console.log('');
});

function shutdown(signal) {
  console.log(`\n收到 ${signal}，正在关闭...`);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
