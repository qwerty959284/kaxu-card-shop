# 部署指南：GitHub + Render

本文把项目从本地目录变成公网可访问的网址。全程只需要 GitHub 账号和 Render 账号（免费）。

---

## 0. 先理解：为什么不用 GitHub Pages

GitHub Pages 只托管**静态文件**（HTML/CSS/JS）。本项目还需要：

- Node.js 服务（登录、下单、后台 API）
- SQLite 数据库（订单、卡密、管理员）
- 支付平台回调 `/api/pay/notify`

所以 GitHub Pages 打开只会看到页面，无法下单、登录后台或自动发货。

正确结构是：

```text
GitHub 仓库（存代码）
        ↓ 自动构建
Render Web Service（运行 Node + 公网 HTTPS 网址）
        ↓
https://你的服务.onrender.com
```

GitHub 负责代码版本管理，Render 负责运行并给你网址。

---

## 1. 建 GitHub 仓库并推送

### 方式 A：网页上传（最简单）

1. GitHub 右上角 **+ → New repository**
2. 仓库名建议 `kaxu-card-shop`，可见性选 **Private** 或 **Public**
3. 创建后点击 **uploading an existing file**
4. 把 `card-shop/` 里的文件上传（注意：**不要上传** `.env` 和 `data/` 里的 `.db`）
5. Commit

### 方式 B：命令行（推荐）

先在 GitHub 创建空仓库，不要勾选 README。

```powershell
cd card-shop

git init -b main
git add .
git commit -m "feat: KAXU digital card shop"
git remote add origin https://github.com/你的用户名/kaxu-card-shop.git
git push -u origin main
```

检查敏感文件没有被提交：

```powershell
git status --ignored
git ls-files | Select-String -Pattern "\.env$|shop\.db"
```

最后一条应该没有输出。

> 本目录已经在本地初始化 Git 并完成首次提交，你只需要添加 remote 后 push。

---

## 2. 部署到 Render

1. 打开 <https://dashboard.render.com/>，用 GitHub 登录。
2. 点击 **New → Blueprint**。
3. 选择刚才的 GitHub 仓库，Render 会自动读取根目录的 `render.yaml`。
4. 在环境变量弹窗中填写：
   - `EPAY_KEY`：易彩豆商户密钥
   - `ADMIN_INITIAL_PASSWORD`：后台初始密码（至少 8 位）
5. 点击 **Apply / Deploy**。
6. 等待构建完成（通常 2–5 分钟）。Render 会给出：

```text
https://kaxu-card-shop.onrender.com
```

如果名字被占用，Render 会自动生成带后缀的域名。

7. 访问 `https://你的地址/admin` 登录后台。

第一次打开免费实例可能需要等待几十秒（免费实例会休眠）。

---

## 3. 配置商户号与回调

`render.yaml` 已预置：

```ini
EPAY_GATEWAY=https://pay.521cd.cn/xpay/epay
EPAY_PID=10169
```

如果你用自己的商户号，在 Render 的 **Environment** 里把 `EPAY_PID` 改成实际 PID，并修改 `EPAY_KEY`。

Render 会自动注入 `RENDER_EXTERNAL_URL`，本项目会把它当作支付回调基础地址，所以不需要手填 `PUBLIC_BASE_URL`。回调地址是：

```text
https://你的地址/api/pay/notify
```

进入后台「概览」，可以看到当前使用的回调地址；如果显示 `127.0.0.1`，说明环境变量没有生效，手动添加：

```ini
PUBLIC_BASE_URL=https://你的地址
```

---

## 4. 数据持久化（正式营业必读）

Render **免费实例的文件系统是临时的**：重新部署、重启、实例迁移后，`data/shop.db` 会丢失。表现是订单、已售卡密、后台改动消失，但演示数据会重新生成。

### 方案 A：Render Starter + 持久磁盘（简单，约 $7/月）

1. 把 `render.yaml` 里的 `plan: free` 改成 `plan: starter`。
2. 取消文件末尾 `disk:` 的注释：

```yaml
    disk:
      name: data
      mountPath: /app/data
      sizeGB: 1
```

3. 推送后 Render 会重新部署；磁盘挂载在 `/app/data`，数据库文件是 `/app/data/shop.db`。
4. 注意：磁盘只能挂载到一个实例，不能同时开多个副本。

### 方案 B：Railway + Volume

1. 在 Railway 新建项目，选择 **Deploy from GitHub repo**。
2. Railway 自动识别 `Dockerfile`。
3. 在服务里添加 Volume，挂载路径 `/app/data`。
4. 环境变量同样配置 `ADMIN_INITIAL_PASSWORD`、`EPAY_KEY`、`EPAY_PID`。
5. 生成公网域名，设置 `PUBLIC_BASE_URL=https://你的域名`（Railway 也会提供 `RAILWAY_PUBLIC_DOMAIN`，本项目已兼容）。

### 方案 C：自己的 VPS / 宝塔 / 1Panel

```bash
git clone https://github.com/你的用户名/kaxu-card-shop.git
cd kaxu-card-shop
cp .env.example .env
# 编辑 .env
node server.js
```

用 systemd/PM2 守护进程，Nginx 反代到 `127.0.0.1:8787`，配置 HTTPS。

---

## 5. 自定义域名

Render：

1. 服务 → **Settings → Custom Domains**
2. 添加 `shop.example.com`
3. 按提示在 DNS 添加 CNAME 到 `xxx.onrender.com`
4. 证书自动签发
5. 在环境变量设置 `PUBLIC_BASE_URL=https://shop.example.com` 并重新部署

---

## 6. 部署后检查清单

- [ ] 打开首页，商品和库存正常显示
- [ ] `/admin` 能登录
- [ ] 后台「概览」显示的回调地址是公网 HTTPS 地址
- [ ] 创建一个测试订单，选择支付宝，能跳转收银台
- [ ] 支付后订单页自动显示卡密
- [ ] 后台「卡密售出」能看到订单和支付方式
- [ ] 用手机打开，布局正常
- [ ] 清理演示卡密，上架真实商品
- [ ] 修改初始管理员密码

修改密码：

```powershell
node scripts/reset-admin.js ADMIN "新密码"
```

在 Render 上执行命令：服务 → **Shell** → 运行上面的命令。注意：如果使用免费实例，Shell 里的文件修改也会在重启后丢失；正式环境请使用持久磁盘。

---

## 7. 常见问题

### 部署后 502 / 构建失败

查看 Render 的 **Logs**。最常见原因：

- 没有填 `ADMIN_INITIAL_PASSWORD`，首次启动被项目主动拒绝
- `EPAY_KEY` 为空（能启动，但支付不可用）
- Node 版本低于 22.13

### 支付跳转后没有自动发货

1. 确认回调地址是公网 HTTPS，不是 `127.0.0.1`
2. 在订单页点「我已完成支付」触发主动查单
3. 后台「卡密售出」→ 订单详情 →「同步支付状态」
4. 如果支付平台确实已收款，可「手动补单」
5. 检查 Render 日志是否有 `[reconcile]` 错误

### 免费实例休眠

Render 免费 Web Service 在无访问时休眠，首次访问需要几十秒唤醒。支付回调也可能因休眠延迟。正式营业建议 Starter 或 Railway/VPS。

### 数据丢了

免费实例重启导致。升级持久磁盘后，把数据库放在 `/app/data/shop.db`，并定期备份。

### 能直接用 GitHub Pages 吗？

不能。GitHub Pages 没有 Node 运行时、没有数据库、不能接收支付回调。不要把本项目配成 Pages。
