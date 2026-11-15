import { config } from '../src/config.js';
import { db } from '../src/db.js';
import { hashPassword } from '../src/password.js';
import { nowIso } from '../src/util.js';

const [username, password] = process.argv.slice(2);

if (!username || !password) {
  console.error('用法: node scripts/reset-admin.js <账号> <新密码>');
  console.error('示例: node scripts/reset-admin.js ADMIN "MyNewPassword123"');
  process.exit(1);
}

if (String(password).length < 8) {
  console.error('新密码至少 8 位');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);

if (existing) {
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(password), existing.id);
  db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(existing.id);
  console.log(`已重置管理员 ${username} 的密码，并让所有会话失效。`);
} else {
  db.prepare('INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)').run(
    username,
    hashPassword(password),
    nowIso(),
  );
  console.log(`已创建管理员 ${username}。`);
}

console.log(`数据库: ${config.dbFile}`);
db.close();
