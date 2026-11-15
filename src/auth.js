import { db } from './db.js';
import { config } from './config.js';
import { hashPassword, verifyPassword } from './password.js';
import { AppError } from './shop.js';
import { addHours, nowIso, parseCookies, randomToken, sha256, safeEqual } from './util.js';

const COOKIE = 'kx_session';
const attempts = new Map();
const DUMMY_HASH = hashPassword(randomToken(18));

function cookieOptions(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = proto === 'https' || (config.isProduction && !proto);
  return { secure };
}

export function sessionCookie(token, req, maxAgeSeconds) {
  const { secure } = cookieOptions(req);
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(req) {
  const { secure } = cookieOptions(req);
  const parts = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function rateKey(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
  return ip;
}

export function login(username, password, req) {
  const key = rateKey(req);
  const now = Date.now();
  const entry = attempts.get(key);
  if (entry && entry.reset > now && entry.count >= 8) {
    const wait = Math.ceil((entry.reset - now) / 60_000);
    throw new AppError(`尝试次数过多，请 ${wait} 分钟后再试`, 429, 'TOO_MANY_ATTEMPTS');
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(String(username || '').trim());
  const ok = admin
    ? verifyPassword(String(password || ''), admin.password_hash)
    : (verifyPassword(String(password || ''), DUMMY_HASH), false);

  if (!ok) {
    const current = entry && entry.reset > now ? entry : { count: 0, reset: now + 15 * 60_000 };
    current.count += 1;
    attempts.set(key, current);
    throw new AppError('账号或密码不正确', 401, 'INVALID_CREDENTIALS');
  }

  attempts.delete(key);
  const token = randomToken(32);
  const csrf = randomToken(24);
  const createdAt = nowIso();
  const expiresAt = addHours(createdAt, config.sessionHours);
  db.prepare(
    'INSERT INTO sessions (token_hash, admin_id, csrf, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    sha256(token),
    admin.id,
    csrf,
    createdAt,
    expiresAt,
    key,
    String(req.headers['user-agent'] || '').slice(0, 300),
  );
  return { token, csrf, expiresAt, admin: { id: admin.id, username: admin.username } };
}

export function getSession(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE];
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.*, a.username FROM sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = ?`,
    )
    .get(sha256(token));
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
    return null;
  }
  return {
    id: row.id,
    adminId: row.admin_id,
    username: row.username,
    csrf: row.csrf,
    expiresAt: row.expires_at,
  };
}

export function requireAdmin(req) {
  const session = getSession(req);
  if (!session) throw new AppError('登录已失效，请重新登录', 401, 'UNAUTHORIZED');
  return session;
}

export function requireCsrf(req, session) {
  const header = String(req.headers['x-csrf-token'] || '');
  if (!header || !safeEqual(header, session.csrf)) {
    throw new AppError('安全校验失败，请刷新页面后重试', 403, 'CSRF_FAILED');
  }
}

export function logout(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function cleanupSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
}
