# 卡序 KAXU · 数字卡密商城

一个可直接运行、可部署的数字卡密自动发货站：前台商城、右上角管理员入口、后台**卡密售出 / 卡密补充 / 卡密管理 / 卡密创建**，以及**支付宝 + 微信 + QQ钱包**的易彩豆在线支付接入。

> **关于 GitHub Pages**
> GitHub Pages 只能托管静态 HTML/CSS/JS，不能运行 Node 服务、SQLite 数据库和支付回调。本项目已准备 **Docker + Render Blueprint**，把代码放在 GitHub，由 Render 构建并生成 `https://xxx.onrender.com` 公网网址。详见 [DEPLOY.md](DEPLOY.md)。

---

## 部署到 GitHub + Render

1. 把本目录推到 GitHub 仓库。
2. 打开 [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**，选择该仓库。
3. Render 会读取根目录的 `render.yaml`，创建 Web Service。
4. 按提示填写两个密钥：
   - `EPAY_KEY`：易彩豆商户密钥
   - `ADMIN_INITIAL_PASSWORD`：后台初始密码（至少 8 位）
5. 等待构建完成，Render 会给出公网地址，例如：
   `https://kaxu-card-shop.onrender.com`
6. 打开 `/admin` 登录后台，把 `EPAY_PID` 改成你的商户 ID（默认已写 `10169`）。

Render 会自动提供 `RENDER_EXTERNAL_URL`，本项目会把它作为支付回调的基础地址，因此不需要手填域名。

> **免费实例的磁盘是临时的**：重新部署或重启后，订单/卡密/管理员改动会丢失。正式营业请使用 Render Starter + 1GB 持久磁盘（`render.yaml` 里有注释示例），或部署到带持久卷的 Railway/VPS。

更细的步骤（建仓库、推送、持久化、自定义域名、回调检查）见 **[DEPLOY.md](DEPLOY.md)**。

---

## 本地运行

要求：Node.js **22.13+**（使用内置 `node:sqlite`，没有 npm 依赖）。

```powershell
cd card-shop
Copy-Item .env.example .env
# 编辑 .env，填写 ADMIN_INITIAL_PASSWORD、EPAY_PID、EPAY_KEY
node server.js
```

打开：

- 前台：<http://127.0.0.1:8787>
- 后台：<http://127.0.0.1:8787/admin>

管理员账号由 `ADMIN_USER` 指定（默认 `ADMIN`），密码来自 `ADMIN_INITIAL_PASSWORD`，**只在数据库第一次初始化时写入**。之后改密码用：

```powershell
node scripts/reset-admin.js ADMIN "你的新密码"
```

数据库首次启动会自动创建在 `data/shop.db`，并写入 6 个演示商品与演示卡密。正式营业前请在后台「概览」清理演示卡密，或替换演示商品。

---

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PORT` | 否 | 监听端口，默认 `8787`；Render 会自动注入 |
| `PUBLIC_BASE_URL` | 否 | 对外访问地址，如 `https://shop.example.com`；Render 会自动使用 `RENDER_EXTERNAL_URL` |
| `ADMIN_USER` | 否 | 管理员账号，默认 `ADMIN` |
| `ADMIN_INITIAL_PASSWORD` | 首次启动必填 | 管理员初始密码，至少 8 位 |
| `PAYMENT_METHODS` | 否 | 首次初始化时启用的支付方式，默认 `alipay,wxpay,qqpay`；之后以后台「通道控制」为准 |
| `EPAY_GATEWAY` | 否 | 易彩豆网关，默认 `https://pay.521cd.cn/xpay/epay` |
| `EPAY_PID` | 是 | 易彩豆商户 ID |
| `EPAY_KEY` | 是 | 易彩豆商户密钥，**不要提交到 Git** |
| `SESSION_HOURS` | 否 | 后台登录有效期，默认 12 小时 |
| `ORDER_TTL_MINUTES` | 否 | 订单支付时限，默认 30 分钟 |
| `DB_FILE` | 否 | 自定义 SQLite 路径 |

`.env` 已被 `.gitignore` 忽略；GitHub 仓库里只保留 `.env.example`。部署到 Render 时，密钥通过平台环境变量注入。

---

## 支付

### 自建收款码（默认）

后台「自建支付」页面上传微信 / 支付宝 / QQ 钱包收款码后，前台 `/pay/:orderNo` 直接展示商城自己的收款码，不再跳转第三方收银台。

- 监控软件的「商户地址」填商城公网地址，「商户 ID」「商户密钥」填后台显示的两项；
- 软件通过 `act=orders` 拉取待支付订单，通过 `act=notify` 上报收款；
- 回调按「订单号 + 金额 + 支付方式」匹配，金额一致才自动发货；
- 同金额多笔待支付订单会拒绝自动匹配并提示手动补单，避免串单；
- 「当前支付通道」可切回易彩豆收银台，作为过渡或备用。

### 易彩豆（备用）

对应文档：<https://pay.521cd.cn/doc/epay_submit>

| 用途 | 接口 |
| --- | --- |
| 页面跳转支付（支付宝 / 微信 / QQ钱包） | `POST /xpay/epay/submit.php` |
| 异步通知 | 本站 `/api/pay/notify`，返回 `success` |
| 主动查单补发 | `GET /xpay/epay/api.php?act=order&...` |

签名规则：过滤空值与 `sign`、`sign_type`，参数名 ASCII 升序，拼接 `a=b&c=d`，末尾直接拼接商户密钥，MD5 小写。

### 回调地址

自建支付的回调不需要单独配置；监控软件会把收款上报到「商户地址」对应的 `/api.php`。易彩豆回调地址为：

```text
https://你的域名/api/pay/notify
```

Render 会自动使用 `RENDER_EXTERNAL_URL`；自定义服务器请设置 `PUBLIC_BASE_URL`。后台「概览」会显示当前使用的回调地址，并提示是否为本机地址。

即使回调丢失，订单页也会主动查单，后台每 2 分钟会补偿查询待支付订单，后台也支持手动同步/补单。

---

## 功能

### 前台
商品分类、库存与价格、购买弹窗、支付宝/微信/QQ钱包选择、下单锁卡、查询密码、专属订单页、支付状态轮询、卡密一键复制、订单倒计时、订单查询、联系管理员留言、首页公告弹窗（3 秒后可关闭）。

### 后台
- **卡密售出**：订单流水、状态筛选、按订单/联系方式/卡密/支付单号搜索、详情、同步支付状态、手动补单、关闭未支付订单。
- **卡密补充**：批量粘贴、自动去重、批次备注；已付款待补货订单自动补发。
- **卡密管理**：按商品/状态/关键词筛选、脱敏显示、复制、删除、批量删除、导出 CSV。
- **卡密创建**：创建商品并导入首批卡密，支持图标、主题色、卖点、上下架、实时预览；可编辑已有商品、快捷补货、删除无订单商品。
- **留言中心**：查看客户联系管理员的留言，标记已读/未读、删除。
- **公告**：发布/编辑首页弹窗公告，可启用或停用；访客每次打开首页都会看到。
- **通道控制**：后台直接开关支付宝/微信/QQ钱包支付，全部关闭时前台暂停销售。

### 发货机制
1. 下单时按数量把 `available` 卡密锁定为 `reserved`，订单 30 分钟有效。
2. 支付成功（回调验签 / 主动查单）后标记为 `sold` 并绑定订单。
3. 超时订单自动关闭并释放卡密。
4. 已付款但库存不足时进入「待补货」，补货后自动优先发放。
5. 金额全程用「分」存储，签名金额使用两位小数字符串。

---

## 常用命令

```powershell
# 启动
node server.js

# 开发模式
node --watch server.js

# 重置管理员密码（同时让该账号所有会话失效）
node scripts/reset-admin.js ADMIN "你的新密码"

# 备份数据库
Copy-Item data/shop.db "shop-backup-$(Get-Date -Format yyyyMMdd).db"
```

Windows 也可以双击 `start.bat`。

---

## 目录结构

```text
card-shop/
├─ server.js                 # HTTP 服务、路由、安全头、补偿任务
├─ src/
│  ├─ config.js              # 环境变量与配置
│  ├─ db.js                  # SQLite 表结构、演示数据
│  ├─ auth.js                # 管理员会话、CSRF、登录限流
│  ├─ epay.js                # 易彩豆签名、支付表单、查单
│  ├─ shop.js                # 商品 / 订单 / 卡密 / 库存
│  ├─ password.js            # scrypt 密码哈希
│  └─ util.js
├─ public/                   # 前台、订单页、后台、CSS/JS
├─ scripts/reset-admin.js
├─ Dockerfile                # Render / Railway / VPS 通用
├─ render.yaml               # Render Blueprint 一键部署
├─ .github/workflows/ci.yml  # GitHub Actions 冒烟测试
├─ DEPLOY.md                 # GitHub + Render 部署步骤
└─ data/shop.db              # 运行时生成，已被 Git 忽略
```

---

## 安全与上线清单

1. 不要提交 `.env`、`data/*.db`；仓库已用 `.gitignore` 排除。
2. 上线后立即改掉初始管理员密码，并确认 `ADMIN_INITIAL_PASSWORD` 只存在于部署平台环境变量。
3. 易彩豆密钥如曾出现在公开聊天/仓库，建议在商户后台重置。
4. 正式营业使用持久磁盘/持久卷，免费实例重启会丢数据。
5. 数字商品发货后不可撤回；退款与售后需线下处理，本项目不包含退款接口。
6. 本站不保存支付账户信息，支付全程在易彩豆收银台完成。
