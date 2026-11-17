import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(path.join(ROOT, '.env'));

const number = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : '';
const autoBaseUrl = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || railwayDomain;
const paymentMethods = (process.env.PAYMENT_METHODS || 'alipay,wxpay')
  .split(',')
  .map((method) => method.trim().toLowerCase())
  .filter((method) => method === 'alipay' || method === 'wxpay');

export const config = {
  root: ROOT,
  publicDir: path.join(ROOT, 'public'),
  dataDir: path.join(ROOT, 'data'),
  dbFile: process.env.DB_FILE ? path.resolve(ROOT, process.env.DB_FILE) : path.join(ROOT, 'data', 'shop.db'),
  port: number(process.env.PORT, 8787),
  host: process.env.HOST || '0.0.0.0',
  publicBaseUrl: (autoBaseUrl || '').replace(/\/+$/, ''),
  isProduction: process.env.NODE_ENV === 'production',
  sessionHours: number(process.env.SESSION_HOURS, 12),
  orderTtlMinutes: number(process.env.ORDER_TTL_MINUTES, 30),
  paymentMethods: paymentMethods.length ? paymentMethods : ['alipay'],
  admin: {
    username: process.env.ADMIN_USER || 'ADMIN',
    initialPassword: process.env.ADMIN_INITIAL_PASSWORD || '',
  },
  epay: {
    gateway: (process.env.EPAY_GATEWAY || 'https://pay.521cd.cn/xpay/epay').replace(/\/+$/, ''),
    pid: process.env.EPAY_PID || '10169',
    key: process.env.EPAY_KEY || '',
  },
  site: {
    name: '卡序',
    domain: 'KAXU.STORE',
  },
};
