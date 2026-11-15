import { db, tx } from './db.js';
import { config } from './config.js';
import { queryRemoteOrder, verifySign } from './epay.js';
import {
  addMinutes,
  centsToMoney,
  createOrderNo,
  nowIso,
  paginate,
  randomToken,
  safeEqual,
  shanghaiDateKey,
} from './util.js';

export class AppError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const ICONS = new Set(['card', 'play', 'game', 'bolt', 'book', 'music', 'cloud', 'star', 'gift']);
const ACCENTS = new Set(['mint', 'violet', 'amber', 'blue', 'rose', 'cyan']);

const parseFeatures = (value) => {
  try {
    const arr = JSON.parse(value || '[]');
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
};

const orderRow = (row) => row || null;

export function releaseExpiredOrders() {
  const now = nowIso();
  return tx(() => {
    const expired = db
      .prepare("SELECT id FROM orders WHERE status = 'pending' AND expires_at <= ?")
      .all(now);
    if (!expired.length) return 0;
    const ids = expired.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(
      `UPDATE cards SET status = 'available', order_id = NULL, reserved_at = NULL
       WHERE status = 'reserved' AND order_id IN (${placeholders})`,
    ).run(...ids);
    db.prepare(
      `UPDATE orders SET status = 'closed', note = COALESCE(note, '超时未支付，已自动关闭')
       WHERE id IN (${placeholders}) AND status = 'pending'`,
    ).run(...ids);
    return ids.length;
  });
}

export function listPublicProducts() {
  releaseExpiredOrders();
  const rows = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM cards c WHERE c.product_id = p.id AND c.status = 'available') AS stock,
        (SELECT COUNT(*) FROM cards c WHERE c.product_id = p.id AND c.status = 'sold') AS sold
       FROM products p
       WHERE p.active = 1
       ORDER BY p.sort_order ASC, p.id ASC`,
    )
    .all();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    priceCents: row.price_cents,
    originalPriceCents: row.original_price_cents,
    badge: row.badge,
    icon: row.icon,
    accent: row.accent,
    features: parseFeatures(row.features),
    stock: row.stock,
    sold: row.sold,
  }));
}

export function getPublicProduct(id) {
  const row = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM cards c WHERE c.product_id = p.id AND c.status = 'available') AS stock
       FROM products p WHERE p.id = ? AND p.active = 1`,
    )
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    priceCents: row.price_cents,
    originalPriceCents: row.original_price_cents,
    badge: row.badge,
    icon: row.icon,
    accent: row.accent,
    features: parseFeatures(row.features),
    stock: row.stock,
  };
}

export function createOrder({ productId, quantity, contact, payType, ip }) {
  releaseExpiredOrders();
  if (ip) {
    const recent = db
      .prepare(
        "SELECT COUNT(*) AS n FROM orders WHERE client_ip = ? AND status = 'pending' AND created_at >= ?",
      )
      .get(ip, new Date(Date.now() - 10 * 60_000).toISOString()).n;
    if (recent >= 12) {
      throw new AppError('下单过于频繁，请稍后再试或先完成已有订单', 429, 'TOO_MANY_ORDERS');
    }
  }
  const product = getPublicProduct(Number(productId));
  if (!product) throw new AppError('商品不存在或已下架', 404, 'PRODUCT_NOT_FOUND');
  const qty = Math.trunc(Number(quantity));
  if (!Number.isFinite(qty) || qty < 1 || qty > 10) {
    throw new AppError('购买数量需在 1 - 10 之间', 400, 'INVALID_QUANTITY');
  }
  if (qty > product.stock) throw new AppError('库存不足，请减少购买数量', 409, 'OUT_OF_STOCK');

  const createdAt = nowIso();
  const expiresAt = addMinutes(createdAt, config.orderTtlMinutes);
  const accessToken = randomToken(24);
  const type = 'alipay';

  return tx(() => {
    const cards = db
      .prepare(
        `SELECT id FROM cards WHERE product_id = ? AND status = 'available' ORDER BY id ASC LIMIT ?`,
      )
      .all(product.id, qty);
    if (cards.length < qty) throw new AppError('库存不足，请稍后再试', 409, 'OUT_OF_STOCK');

    let orderNo = createOrderNo();
    for (let i = 0; i < 6; i += 1) {
      const exists = db.prepare('SELECT 1 FROM orders WHERE order_no = ?').get(orderNo);
      if (!exists) break;
      orderNo = createOrderNo();
    }

    const result = db
      .prepare(
        `INSERT INTO orders
          (order_no, access_token, product_id, product_name, unit_price_cents, quantity, amount_cents, contact, status, pay_type, client_ip, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      )
      .run(
        orderNo,
        accessToken,
        product.id,
        product.name,
        product.priceCents,
        qty,
        product.priceCents * qty,
        contact || null,
        type,
        ip || null,
        createdAt,
        expiresAt,
      );
    const orderId = Number(result.lastInsertRowid);

    const reserve = db.prepare(
      `UPDATE cards SET status = 'reserved', order_id = ?, reserved_at = ? WHERE id = ? AND status = 'available'`,
    );
    for (const card of cards) {
      reserve.run(orderId, createdAt, card.id);
    }

    return {
      id: orderId,
      order_no: orderNo,
      access_token: accessToken,
      product_name: product.name,
      quantity: qty,
      amount_cents: product.priceCents * qty,
      pay_type: type,
      created_at: createdAt,
      expires_at: expiresAt,
    };
  });
}

export function findOrderByNo(orderNo) {
  return orderRow(db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo));
}

export function getOrderById(id) {
  return orderRow(db.prepare('SELECT * FROM orders WHERE id = ?').get(id));
}

export function serializeClientOrder(order) {
  const cards =
    order.status === 'delivered'
      ? db
          .prepare("SELECT id, secret FROM cards WHERE order_id = ? AND status = 'sold' ORDER BY id ASC")
          .all(order.id)
      : [];
  return {
    orderNo: order.order_no,
    status: order.status,
    productName: order.product_name,
    quantity: order.quantity,
    unitPriceCents: order.unit_price_cents,
    amountCents: order.amount_cents,
    contact: order.contact,
    payType: order.pay_type,
    createdAt: order.created_at,
    expiresAt: order.expires_at,
    paidAt: order.paid_at,
    deliveredAt: order.delivered_at,
    lastCheckedAt: order.last_checked_at,
    cards: cards.map((c) => c.secret),
  };
}

export function getClientOrder(orderNo, token) {
  releaseExpiredOrders();
  const order = findOrderByNo(orderNo);
  if (!order) throw new AppError('订单不存在', 404, 'ORDER_NOT_FOUND');
  if (!token || !safeEqual(order.access_token, token)) {
    throw new AppError('订单凭证无效，请从下单链接进入', 403, 'INVALID_TOKEN');
  }
  return order;
}

function deliverOrder(order, { tradeNo, source }) {
  return tx(() => {
    const fresh = getOrderById(order.id);
    if (!fresh) throw new AppError('订单不存在', 404, 'ORDER_NOT_FOUND');
    if (fresh.status === 'delivered') return { order: fresh, delivered: true };
    const now = nowIso();

    let cardIds = db
      .prepare("SELECT id FROM cards WHERE order_id = ? AND status = 'reserved' ORDER BY id ASC")
      .all(fresh.id)
      .map((r) => r.id);

    if (cardIds.length < fresh.quantity) {
      const need = fresh.quantity - cardIds.length;
      const more = db
        .prepare(
          `SELECT id FROM cards WHERE product_id = ? AND status = 'available' ORDER BY id ASC LIMIT ?`,
        )
        .all(fresh.product_id, need)
        .map((r) => r.id);
      cardIds = [...cardIds, ...more];
    }

    const enough = cardIds.length >= fresh.quantity;
    if (enough) {
      const markSold = db.prepare(
        `UPDATE cards SET status = 'sold', order_id = ?, sold_at = ? WHERE id = ?`,
      );
      for (const cardId of cardIds.slice(0, fresh.quantity)) {
        markSold.run(fresh.id, now, cardId);
      }
      // 多余预留（理论上不会出现）释放
      for (const cardId of cardIds.slice(fresh.quantity)) {
        db.prepare(
          `UPDATE cards SET status = 'available', order_id = NULL, reserved_at = NULL WHERE id = ?`,
        ).run(cardId);
      }
    }

    db.prepare(
      `UPDATE orders SET
        status = ?, trade_no = COALESCE(trade_no, ?), paid_at = COALESCE(paid_at, ?),
        delivered_at = ?, last_checked_at = ?,
        note = CASE WHEN ? = 'paid_pending' THEN '已付款，库存不足，等待补货' ELSE NULL END
       WHERE id = ?`,
    ).run(
      enough ? 'delivered' : 'paid_pending',
      tradeNo || null,
      now,
      enough ? now : null,
      now,
      enough ? 'delivered' : 'paid_pending',
      fresh.id,
    );

    return { order: getOrderById(fresh.id), delivered: enough, source };
  });
}

export function fulfillWaitingOrders(productId) {
  const waiting = db
    .prepare("SELECT * FROM orders WHERE product_id = ? AND status = 'paid_pending' ORDER BY paid_at ASC")
    .all(productId);
  let filled = 0;
  for (const order of waiting) {
    const stock = db
      .prepare("SELECT COUNT(*) AS n FROM cards WHERE product_id = ? AND status = 'available'")
      .get(productId).n;
    if (stock < order.quantity) break;
    const result = deliverOrder(order, { tradeNo: order.trade_no, source: 'restock' });
    if (result.delivered) filled += 1;
  }
  return filled;
}

export async function syncOrderWithProvider(order, { force = false } = {}) {
  if (!order) throw new AppError('订单不存在', 404, 'ORDER_NOT_FOUND');
  if (order.status === 'delivered') return { order, synced: false, paid: true };

  const last = order.last_checked_at ? new Date(order.last_checked_at).getTime() : 0;
  if (!force && Date.now() - last < 15_000) {
    return { order, synced: false, paid: order.status === 'delivered' };
  }

  db.prepare('UPDATE orders SET last_checked_at = ? WHERE id = ?').run(nowIso(), order.id);

  try {
    const remote = await queryRemoteOrder(order.order_no);
    const paid = Number(remote.code) === 1 && Number(remote.status) === 1;
    if (!paid) return { order: getOrderById(order.id), synced: true, paid: false, remote };
    const remoteCents = Math.round(Number(remote.money) * 100);
    if (remoteCents !== order.amount_cents) {
      db.prepare("UPDATE orders SET note = ? WHERE id = ?").run(
        `支付金额不符：本地 ${centsToMoney(order.amount_cents)}，平台 ${remote.money}`,
        order.id,
      );
      return { order: getOrderById(order.id), synced: true, paid: false, amountMismatch: true };
    }
    const result = deliverOrder(order, { tradeNo: remote.trade_no || null, source: 'query' });
    return { order: result.order, synced: true, paid: true };
  } catch (err) {
    return { order: getOrderById(order.id), synced: false, paid: false, error: err.message };
  }
}

export function handleNotify(params, ip) {
  const signOk = verifySign(params);
  db.prepare(
    'INSERT INTO payment_logs (order_no, source, sign_ok, payload, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    params.out_trade_no || null,
    'notify',
    signOk ? 1 : 0,
    JSON.stringify(params).slice(0, 8000),
    ip || null,
    nowIso(),
  );

  if (!signOk) throw new AppError('签名校验失败', 400, 'INVALID_SIGN');
  if (String(params.pid) !== String(config.epay.pid)) throw new AppError('商户号不匹配', 400, 'INVALID_PID');
  if (params.trade_status !== 'TRADE_SUCCESS') throw new AppError('非成功状态', 200, 'IGNORED');

  const order = findOrderByNo(String(params.out_trade_no || ''));
  if (!order) throw new AppError('订单不存在', 404, 'ORDER_NOT_FOUND');
  const paidCents = Math.round(Number(params.money) * 100);
  if (paidCents !== order.amount_cents) throw new AppError('支付金额不匹配', 400, 'AMOUNT_MISMATCH');

  deliverOrder(order, { tradeNo: params.trade_no || null, source: 'notify' });
  return order;
}

/* ============================ 管理端 ============================ */

export function dashboardData() {
  releaseExpiredOrders();
  const todayKey = shanghaiDateKey();
  const todayStart = new Date(`${todayKey}T00:00:00+08:00`).toISOString();

  const totalRevenue = db
    .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM orders WHERE status IN ('delivered','paid_pending')")
    .get().n;
  const todayRevenue = db
    .prepare(
      "SELECT COALESCE(SUM(amount_cents), 0) AS n FROM orders WHERE status IN ('delivered','paid_pending') AND paid_at >= ?",
    )
    .get(todayStart).n;
  const totalOrders = db
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE status IN ('delivered','paid_pending')")
    .get().n;
  const todayOrders = db
    .prepare(
      "SELECT COUNT(*) AS n FROM orders WHERE status IN ('delivered','paid_pending') AND paid_at >= ?",
    )
    .get(todayStart).n;
  const cardsSold = db.prepare("SELECT COUNT(*) AS n FROM cards WHERE status = 'sold'").get().n;
  const stock = db.prepare("SELECT COUNT(*) AS n FROM cards WHERE status = 'available'").get().n;
  const pending = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'").get().n;
  const waiting = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'paid_pending'").get().n;

  const recentOrders = db
    .prepare(
      `SELECT o.*, (SELECT COUNT(*) FROM cards c WHERE c.order_id = o.id AND c.status = 'sold') AS cards_count
       FROM orders o ORDER BY o.id DESC LIMIT 8`,
    )
    .all()
    .map(mapAdminOrder);

  const lowStock = db
    .prepare(
      `SELECT * FROM (
         SELECT p.id, p.name, p.icon, p.accent,
           (SELECT COUNT(*) FROM cards c WHERE c.product_id = p.id AND c.status = 'available') AS stock
         FROM products p WHERE p.active = 1
       ) WHERE stock <= 10 ORDER BY stock ASC LIMIT 5`,
    )
    .all();

  const products = productStats();

  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = shanghaiDateKey(d);
    const start = new Date(`${key}T00:00:00+08:00`).toISOString();
    const end = new Date(`${key}T23:59:59.999+08:00`).toISOString();
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS revenue, COUNT(*) AS orders
         FROM orders WHERE status IN ('delivered','paid_pending') AND paid_at BETWEEN ? AND ?`,
      )
      .get(start, end);
    days.push({ date: key.slice(5), revenue: row.revenue, orders: row.orders });
  }

  const demoCards = db
    .prepare("SELECT COUNT(*) AS n FROM cards WHERE batch = 'DEMO' AND status = 'available'")
    .get().n;

  return {
    stats: {
      totalRevenue,
      todayRevenue,
      totalOrders,
      todayOrders,
      cardsSold,
      stock,
      pending,
      waiting,
      demoCards,
    },
    recentOrders,
    lowStock,
    products,
    days,
    callbackBase: config.publicBaseUrl,
  };
}

function mapAdminOrder(row) {
  return {
    id: row.id,
    orderNo: row.order_no,
    productId: row.product_id,
    productName: row.product_name,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    amountCents: row.amount_cents,
    contact: row.contact,
    status: row.status,
    tradeNo: row.trade_no,
    payType: row.pay_type,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    deliveredAt: row.delivered_at,
    note: row.note,
    cardsCount: row.cards_count ?? 0,
  };
}

export function listAdminOrders({ status = 'all', q = '', page = 1, pageSize = 12 }) {
  const where = [];
  const params = [];
  if (['pending', 'delivered', 'paid_pending', 'closed'].includes(status)) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(o.order_no LIKE ? OR o.product_name LIKE ? OR o.contact LIKE ? OR o.trade_no LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM orders o ${whereSql}`).get(...params).n;
  const p = paginate(total, page, pageSize);
  const rows = db
    .prepare(
      `SELECT o.*, (SELECT COUNT(*) FROM cards c WHERE c.order_id = o.id AND c.status = 'sold') AS cards_count
       FROM orders o ${whereSql} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, p.pageSize, p.offset)
    .map(mapAdminOrder);
  return { ...p, items: rows };
}

export function adminOrderDetail(id) {
  const order = getOrderById(Number(id));
  if (!order) throw new AppError('订单不存在', 404, 'ORDER_NOT_FOUND');
  const cards = db
    .prepare('SELECT id, secret, status, batch, created_at, sold_at FROM cards WHERE order_id = ? ORDER BY id')
    .all(order.id);
  return { order: mapAdminOrder({ ...order, cards_count: cards.filter((c) => c.status === 'sold').length }), cards };
}

export async function resyncAdminOrder(id) {
  const order = getOrderById(Number(id));
  if (!order) throw new AppError('订单不存在', 404, 'ORDER_NOT_FOUND');
  return syncOrderWithProvider(order, { force: true });
}

export function manualMarkPaid(id) {
  const order = getOrderById(Number(id));
  if (!order) throw new AppError('订单不存在', 404, 'ORDER_NOT_FOUND');
  return deliverOrder(order, { tradeNo: `MANUAL-${Date.now()}`, source: 'manual' });
}

export function closeOrder(id) {
  const order = getOrderById(Number(id));
  if (!order) throw new AppError('订单不存在', 404, 'ORDER_NOT_FOUND');
  if (order.status !== 'pending') {
    throw new AppError('只有待支付订单可以关闭；已付款订单请勿关闭', 400, 'INVALID_STATUS');
  }
  return tx(() => {
    db.prepare(
      "UPDATE cards SET status = 'available', order_id = NULL, reserved_at = NULL WHERE order_id = ? AND status = 'reserved'",
    ).run(order.id);
    db.prepare("UPDATE orders SET status = 'closed', note = '管理员关闭订单' WHERE id = ?").run(order.id);
    return getOrderById(order.id);
  });
}

export function productStats() {
  return db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM cards c WHERE c.product_id = p.id AND c.status = 'available') AS stock,
        (SELECT COUNT(*) FROM cards c WHERE c.product_id = p.id AND c.status = 'reserved') AS reserved,
        (SELECT COUNT(*) FROM cards c WHERE c.product_id = p.id AND c.status = 'sold') AS sold
       FROM products p ORDER BY p.sort_order ASC, p.id ASC`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description,
      priceCents: row.price_cents,
      originalPriceCents: row.original_price_cents,
      badge: row.badge,
      icon: row.icon,
      accent: row.accent,
      features: parseFeatures(row.features),
      active: !!row.active,
      stock: row.stock,
      reserved: row.reserved,
      sold: row.sold,
      createdAt: row.created_at,
    }));
}

export function createProduct(payload, cardLines = []) {
  const name = String(payload.name || '').trim();
  const category = String(payload.category || '').trim() || '其他';
  const description = String(payload.description || '').trim();
  const priceCents = Math.round(Number(payload.priceCents));
  const originalPriceCents = payload.originalPriceCents ? Math.round(Number(payload.originalPriceCents)) : null;

  if (name.length < 2 || name.length > 60) throw new AppError('商品名称需为 2 - 60 个字符');
  if (category.length > 20) throw new AppError('分类不能超过 20 个字符');
  if (description.length > 300) throw new AppError('商品描述不能超过 300 个字符');
  if (!Number.isFinite(priceCents) || priceCents < 1 || priceCents > 10_000_000) {
    throw new AppError('售价需在 0.01 - 100000 元之间');
  }
  if (originalPriceCents !== null && (!Number.isFinite(originalPriceCents) || originalPriceCents < priceCents)) {
    throw new AppError('原价不能低于售价');
  }
  const features = Array.isArray(payload.features)
    ? payload.features.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
    : [];
  const badge = String(payload.badge || '').trim().slice(0, 8);
  const icon = ICONS.has(payload.icon) ? payload.icon : 'card';
  const accent = ACCENTS.has(payload.accent) ? payload.accent : 'mint';
  const active = payload.active === false ? 0 : 1;
  const now = nowIso();

  return tx(() => {
    const result = db
      .prepare(
        `INSERT INTO products (name, category, description, price_cents, original_price_cents, badge, icon, accent, features, active, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        name,
        category,
        description,
        priceCents,
        originalPriceCents,
        badge || null,
        icon,
        accent,
        JSON.stringify(features),
        active,
        100,
        now,
        now,
      );
    const productId = Number(result.lastInsertRowid);
    const added = insertCards(productId, cardLines, 'INIT');
    return { product: productStats().find((p) => p.id === productId), cardsAdded: added };
  });
}

export function updateProduct(id, payload) {
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(id));
  if (!current) throw new AppError('商品不存在', 404, 'PRODUCT_NOT_FOUND');
  const name = payload.name !== undefined ? String(payload.name).trim() : current.name;
  const category = payload.category !== undefined ? String(payload.category).trim() || '其他' : current.category;
  const description =
    payload.description !== undefined ? String(payload.description).trim() : current.description;
  const priceCents =
    payload.priceCents !== undefined ? Math.round(Number(payload.priceCents)) : current.price_cents;
  const originalPriceCents =
    payload.originalPriceCents !== undefined
      ? payload.originalPriceCents
        ? Math.round(Number(payload.originalPriceCents))
        : null
      : current.original_price_cents;
  const features =
    payload.features !== undefined
      ? Array.isArray(payload.features)
        ? payload.features.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
        : []
      : parseFeatures(current.features);
  const badge = payload.badge !== undefined ? String(payload.badge || '').trim().slice(0, 8) : current.badge;
  const icon = payload.icon !== undefined && ICONS.has(payload.icon) ? payload.icon : current.icon;
  const accent = payload.accent !== undefined && ACCENTS.has(payload.accent) ? payload.accent : current.accent;
  const active = payload.active !== undefined ? (payload.active ? 1 : 0) : current.active;

  if (name.length < 2 || name.length > 60) throw new AppError('商品名称需为 2 - 60 个字符');
  if (!Number.isFinite(priceCents) || priceCents < 1) throw new AppError('售价不合法');
  if (originalPriceCents !== null && originalPriceCents < priceCents) throw new AppError('原价不能低于售价');

  db.prepare(
    `UPDATE products SET name=?, category=?, description=?, price_cents=?, original_price_cents=?, badge=?, icon=?, accent=?, features=?, active=?, updated_at=? WHERE id=?`,
  ).run(
    name,
    category,
    description,
    priceCents,
    originalPriceCents,
    badge || null,
    icon,
    accent,
    JSON.stringify(features),
    active,
    nowIso(),
    current.id,
  );
  return productStats().find((p) => p.id === current.id);
}

export function setProductActive(id, active) {
  const result = db
    .prepare('UPDATE products SET active = ?, updated_at = ? WHERE id = ?')
    .run(active ? 1 : 0, nowIso(), Number(id));
  if (!result.changes) throw new AppError('商品不存在', 404, 'PRODUCT_NOT_FOUND');
}

export function insertCards(productId, lines, batch) {
  const clean = [];
  const seen = new Set();
  for (const raw of lines) {
    const value = String(raw).trim().slice(0, 500);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    clean.push(value);
    if (clean.length > 5000) break;
  }
  if (!clean.length) return 0;
  const now = nowIso();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO cards (product_id, secret, status, batch, created_at) VALUES (?, ?, 'available', ?, ?)`,
  );
  let added = 0;
  for (const value of clean) {
    added += Number(stmt.run(productId, value, batch || null, now).changes || 0);
  }
  return added;
}

export function restockProduct(productId, lines, batch) {
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(Number(productId));
  if (!product) throw new AppError('商品不存在', 404, 'PRODUCT_NOT_FOUND');
  const added = tx(() =>
    insertCards(product.id, lines, batch || `B${shanghaiDateKey().replace(/-/g, '')}`),
  );
  const filled = added ? fulfillWaitingOrders(product.id) : 0;
  return { added, filled, stock: productStats().find((p) => p.id === product.id).stock };
}

export function listCards({ status = 'all', productId = '', q = '', batch = '', page = 1, pageSize = 15 }) {
  const where = [];
  const params = [];
  if (['available', 'reserved', 'sold'].includes(status)) {
    where.push('c.status = ?');
    params.push(status);
  }
  if (productId) {
    where.push('c.product_id = ?');
    params.push(Number(productId));
  }
  if (batch) {
    where.push('c.batch = ?');
    params.push(batch);
  }
  if (q) {
    where.push('(c.secret LIKE ? OR o.order_no LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const base = `FROM cards c LEFT JOIN orders o ON o.id = c.order_id LEFT JOIN products p ON p.id = c.product_id ${whereSql}`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(...params).n;
  const p = paginate(total, page, pageSize);
  const items = db
    .prepare(
      `SELECT c.*, o.order_no AS order_no, p.name AS product_name, p.icon AS product_icon, p.accent AS product_accent
       ${base} ORDER BY c.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, p.pageSize, p.offset);
  return { ...p, items };
}

export function deleteCards(ids) {
  const clean = [...new Set(ids.map((n) => Math.trunc(Number(n))).filter((n) => n > 0))].slice(0, 500);
  if (!clean.length) return 0;
  const placeholders = clean.map(() => '?').join(',');
  const result = db
    .prepare(`DELETE FROM cards WHERE status = 'available' AND id IN (${placeholders})`)
    .run(...clean);
  return Number(result.changes || 0);
}

export function clearDemoCards() {
  const result = db.prepare("DELETE FROM cards WHERE batch = 'DEMO' AND status = 'available'").run();
  return Number(result.changes || 0);
}

export function exportCardsCsv({ status = 'all', productId = '', q = '', batch = '' } = {}) {
  const where = [];
  const params = [];
  if (['available', 'reserved', 'sold'].includes(status)) {
    where.push('c.status = ?');
    params.push(status);
  }
  if (productId) {
    where.push('c.product_id = ?');
    params.push(Number(productId));
  }
  if (batch) {
    where.push('c.batch = ?');
    params.push(batch);
  }
  if (q) {
    where.push('(c.secret LIKE ? OR o.order_no LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT c.id, p.name AS product_name, c.secret, c.status, c.batch, o.order_no, c.created_at, c.sold_at
       FROM cards c LEFT JOIN orders o ON o.id = c.order_id LEFT JOIN products p ON p.id = c.product_id
       ${whereSql} ORDER BY c.id DESC LIMIT 5000`,
    )
    .all(...params);
}

export function listBatches(productId) {
  return db
    .prepare(
      `SELECT batch, COUNT(*) AS total, SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) AS available,
              MIN(created_at) AS created_at
       FROM cards WHERE product_id = ? AND batch IS NOT NULL
       GROUP BY batch ORDER BY MAX(id) DESC LIMIT 8`,
    )
    .all(Number(productId));
}

export function resetProductDemoStock() {
  return clearDemoCards();
}
