import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { hashPassword } from './password.js';
import { nowIso, randomCode } from './util.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(config.dbFile);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '其他',
    description TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    original_price_cents INTEGER,
    badge TEXT,
    icon TEXT NOT NULL DEFAULT 'card',
    accent TEXT NOT NULL DEFAULT 'mint',
    features TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    contact TEXT,
    view_password_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    trade_no TEXT,
    pay_type TEXT NOT NULL DEFAULT 'alipay',
    client_ip TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    paid_at TEXT,
    delivered_at TEXT,
    last_checked_at TEXT,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    secret TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    batch TEXT,
    created_at TEXT NOT NULL,
    reserved_at TEXT,
    sold_at TEXT
  );

  CREATE TABLE IF NOT EXISTS payment_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT,
    source TEXT NOT NULL,
    sign_ok INTEGER NOT NULL DEFAULT 0,
    payload TEXT,
    ip TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT,
    contact TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    ip TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_support_status_created ON support_messages(status, created_at);

  CREATE INDEX IF NOT EXISTS idx_cards_product_status ON cards(product_id, status, id);
  CREATE INDEX IF NOT EXISTS idx_cards_order ON cards(order_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_product_secret ON cards(product_id, secret);
`);

// 兼容已存在的数据库：新增订单查询密码字段
const orderColumns = db.prepare('PRAGMA table_info(orders)').all();
if (!orderColumns.some((column) => column.name === 'view_password_hash')) {
  db.exec('ALTER TABLE orders ADD COLUMN view_password_hash TEXT');
}

/** 同步事务封装（node:sqlite 没有 better-sqlite3 的 transaction 辅助） */
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }
}

function demoSecret(prefix) {
  return `${prefix}-${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`;
}

const SEED_PRODUCTS = [
  {
    name: '云栖视频 VIP 月卡',
    category: '影视会员',
    description: '支持手机、平板、TV 全端登录，激活后 30 天有效，热门影视抢先看。',
    price: 990,
    original: 2500,
    badge: '热销',
    icon: 'play',
    accent: 'mint',
    features: ['4K 超清', '全端通用', '即买即用'],
    stock: 18,
    prefix: 'YQ',
    sort: 10,
  },
  {
    name: '星轨游戏 1000 点券',
    category: '游戏点卡',
    description: '输入游戏内 UID 即可兑换 1000 点券，国服全服通用，官方正规渠道。',
    price: 8800,
    original: 10000,
    badge: '官方',
    icon: 'game',
    accent: 'violet',
    features: ['国服通用', '秒到账', '官方渠道'],
    stock: 9,
    prefix: 'XG',
    sort: 20,
  },
  {
    name: '流光加速器 30 天',
    category: '工具软件',
    description: '全球多线节点，游戏与流媒体低延迟加速，支持 Windows、macOS 与移动端。',
    price: 1500,
    original: 2500,
    badge: '口碑',
    icon: 'bolt',
    accent: 'amber',
    features: ['全球节点', '低延迟', '多端可用'],
    stock: 14,
    prefix: 'LG',
    sort: 30,
  },
  {
    name: '墨读年度会员',
    category: '阅读教育',
    description: '全场电子书与有声书畅读，365 天有效，支持离线缓存与多设备进度同步。',
    price: 6800,
    original: 12800,
    badge: '超值',
    icon: 'book',
    accent: 'blue',
    features: ['全场畅读', '365 天', '多端同步'],
    stock: 7,
    prefix: 'MD',
    sort: 40,
  },
  {
    name: '青柠音乐季卡',
    category: '影音娱乐',
    description: '无损音质与专属曲库，手机、电脑、音箱三端同步，激活后 90 天有效。',
    price: 2500,
    original: 4500,
    badge: '',
    icon: 'music',
    accent: 'rose',
    features: ['无损音质', '三端同步', '90 天'],
    stock: 11,
    prefix: 'QN',
    sort: 50,
  },
  {
    name: '极昼云盘 1TB 月卡',
    category: '工具软件',
    description: '1TB 私有云空间，极速下载与在线预览，激活后 30 天有效。',
    price: 1200,
    original: 2000,
    badge: '',
    icon: 'cloud',
    accent: 'cyan',
    features: ['1TB 空间', '极速下载', '30 天'],
    stock: 8,
    prefix: 'JZ',
    sort: 60,
  },
];

export function seedDatabase() {
  const adminCount = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (adminCount === 0) {
    if (!config.admin.initialPassword || config.admin.initialPassword.length < 8) {
      throw new Error(
        '首次启动需要设置 ADMIN_INITIAL_PASSWORD（至少 8 位）。请在 .env 或部署平台的环境变量中配置后重试。',
      );
    }
    db.prepare('INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)').run(
      config.admin.username,
      hashPassword(config.admin.initialPassword),
      nowIso(),
    );
  }

  const settingsCount = db.prepare('SELECT COUNT(*) AS n FROM settings WHERE key = ?').get('payment_methods').n;
  if (settingsCount === 0) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
      'payment_methods',
      JSON.stringify(config.paymentMethods),
    );
  }

  const productCount = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (productCount > 0) return;

  const createdAt = nowIso();
  const insertProduct = db.prepare(`
    INSERT INTO products (name, category, description, price_cents, original_price_cents, badge, icon, accent, features, active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `);
  const insertCard = db.prepare(`
    INSERT OR IGNORE INTO cards (product_id, secret, status, batch, created_at)
    VALUES (?, ?, 'available', 'DEMO', ?)
  `);

  tx(() => {
    for (const p of SEED_PRODUCTS) {
      const result = insertProduct.run(
        p.name,
        p.category,
        p.description,
        p.price,
        p.original,
        p.badge || null,
        p.icon,
        p.accent,
        JSON.stringify(p.features),
        p.sort,
        createdAt,
        createdAt,
      );
      const productId = Number(result.lastInsertRowid);
      for (let i = 0; i < p.stock; i += 1) {
        insertCard.run(productId, demoSecret(p.prefix), createdAt);
      }
    }
  });
}

seedDatabase();
