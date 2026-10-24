let KV_BINDING;
let DB;
const banPath = [
  'login', 'admin', '__total_count',
  // static files
  'admin.html', 'login.html',
  'daisyui@5.css', 'tailwindcss@4.js',
  'qr-code-styling.js', 'zxing.js',
  'robots.txt', 'wechat.svg',
  'favicon.svg',
];

// 解析多链接：支持数组 / JSON 数组字符串 / 换行或逗号分隔字符串
function parseTargets(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(t => String(t).trim()).filter(Boolean);
  }
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr.map(t => String(t).trim()).filter(Boolean);
    }
  } catch (e) { /* 非 JSON，继续往下解析 */ }
  return String(raw).split(/[\r\n,]+/).map(t => t.trim()).filter(Boolean);
}

// 平台跳转示意图映射：URL 参数 from 的平台值 -> 对应图片
const PLATFORM_JUMP_IMAGES = {
  kuaishou: '/images/kuaishou-jumpwx.gif',
  douyin: '/images/douyin-jumpwx.gif',
  sms: '/images/sms-jumpwx.gif',
  weibo: '/images/weibo-jumpwx.gif',
  xhs: '/images/xhs-jumpwx.gif',
  zhihu: '/images/zhihu-jumpwx.gif',
  common: '/images/common-jumpwx.gif',
};
// 无参数访问默认使用快手跳转图
const DEFAULT_JUMP_IMAGE = '/images/kuaishou-jumpwx.gif';

// 隐蔽渠道编码：URL 参数 s 使用 axbX 形式，X 为平台字母（axbd=抖音、axbk=快手…）
const SOURCE_CODE_TO_PLATFORM = {
  d: 'douyin',
  k: 'kuaishou',
  s: 'sms',
  w: 'weibo',
  x: 'xhs',
  z: 'zhihu',
  c: 'common',
};

// 解析渠道编码，返回平台名；无法识别返回 null
function parseSourceCode(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  return SOURCE_CODE_TO_PLATFORM[v.slice(-1)] || null;
}

// HTML 转义：防止短链目标中的特殊字符破坏页面结构（XSS 防护）
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 微信协议（weixin://）无法被浏览器直接打开，直接 302 会白屏，
// 这里渲染一个引导中转页：点击按钮或 3 秒后自动尝试打开微信。
function wechatInterstitialHtml(weixinUrl, name, jumpImg) {
  // JSON 字符串形式安全嵌入 <script>，并将 < 转义为 \u003c 防止闭合 script 标签
  const safeUrl = JSON.stringify(weixinUrl).replace(/</g, '\\u003c');
  const linkText = escapeHtml(weixinUrl);
  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<title>跳转中</title>
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
*{padding:0;margin:0}
@media (max-width:768px){
  body{width:100%;height:100vh;background:#fff;overflow:hidden}
}
@media screen and (max-width:3000px) and (min-width:768px){
  body{background:#fff;overflow:hidden;margin:0 auto}
}
.ssl_tips_container{display:flex;justify-content:center;padding:15px 0}
.ssl_tips{display:flex;align-items:center}
.ssl_logo{display:inline-block;width:22px;height:22px;margin-right:5px;border-radius:5px;vertical-align:middle;object-fit:contain}
.ssl_text{font-size:14px;color:#999}
.jump_gif{width:50%;margin:40px auto 0;text-align:center}
.jump_gif img{width:100%;height:auto;display:block}
.jump_text{text-align:center;font-size:16px;color:#666;margin-top:30px}
.jump_button_tips{text-align:center;color:#ccc;margin-top:10px;font-size:15px}
.jump_button{width:50%;height:40px;line-height:40px;text-align:center;color:#fff;background:#0ccf67;border-radius:15px;margin:20px auto 0;font-size:16px;animation:breathe 1s ease-in-out infinite;transform-origin:center}
.a-jump{text-decoration:none;-webkit-tap-highlight-color:rgba(255,0,0,0)}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
</style>
<meta name="description" content="">
<meta name="referrer" content="no-referrer">
</head>
<body>
 <div class="ssl_tips_container">
   <div class="ssl_tips">
     <img class="ssl_logo" src="/images/ssl.png" alt="SSL" />
     <span class="ssl_text">本页面已启用SSL安全加密</span>
   </div>
 </div>
 <div class="jump_gif">
   <img src="${jumpImg}" alt="跳转示意" />
 </div>
 <div class="jump_text">正在自动跳转...</div>
 <div class="jump_button_tips">如没有自动跳转请点击按钮</div>
 <a href="${linkText}" id="jumpBtn" class="a-jump">
   <div class="jump_button">点击跳转</div>
 </a>
<script>
  (function () {
    var weixinUrl = ${safeUrl};
    function openWechat() {
      try {
        window.location.href = weixinUrl;
      } catch (e) {}
    }
    var btn = document.getElementById('jumpBtn');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openWechat();
      });
    }
    // 页面加载完成后自动执行跳转
    function autoJump() {
      openWechat();
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      autoJump();
    } else {
      window.addEventListener('load', autoJump);
    }
  })();
</script>
</body>
</html>`;
}


// 数据库初始化
async function initDatabase() {
  // 创建表
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS mappings (
      path TEXT PRIMARY KEY,
      target TEXT NOT NULL,
      name TEXT,
      expiry TEXT,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 检查是否需要添加新列
  const tableInfo = await DB.prepare("PRAGMA table_info(mappings)").all();
  const columns = tableInfo.results.map(col => col.name);

  // 添加 isWechat 列（如果不存在）
  if (!columns.includes('isWechat')) {
    await DB.prepare(`
      ALTER TABLE mappings 
      ADD COLUMN isWechat INTEGER DEFAULT 0
    `).run();
  }

  // 添加 qrCodeData 列（如果不存在）
  if (!columns.includes('qrCodeData')) {
    await DB.prepare(`
      ALTER TABLE mappings 
      ADD COLUMN qrCodeData TEXT
    `).run();
  }

  // 添加 targets 列（多链接轮询：JSON 数组）
  if (!columns.includes('targets')) {
    await DB.prepare(`
      ALTER TABLE mappings 
      ADD COLUMN targets TEXT
    `).run();
  }

  // 添加 idx 列（轮询游标）
  if (!columns.includes('idx')) {
    await DB.prepare(`
      ALTER TABLE mappings 
      ADD COLUMN idx INTEGER DEFAULT 0
    `).run();
  }

  // 添加索引
  await DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_expiry ON mappings(expiry)
  `).run();

  await DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_created_at ON mappings(created_at)
  `).run();

  // 组合索引：用于启用状态和过期时间的组合查询
  await DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_enabled_expiry ON mappings(enabled, expiry)
  `).run();
}

// Cookie 相关函数
function verifyAuthCookie(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const authToken = cookie.split(';').find(c => c.trim().startsWith('token='));
  if (!authToken) return false;
  return authToken.split('=')[1].trim() === env.PASSWORD;
}

function setAuthCookie(password) {
  return {
    'Set-Cookie': `token=${password}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
    'Content-Type': 'application/json'
  };
}

function clearAuthCookie() {
  return {
    'Set-Cookie': 'token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
    'Content-Type': 'application/json'
  };
}

// 数据库操作相关函数
async function listMappings(page = 1, pageSize = 10) {
  const offset = (page - 1) * pageSize;
  
  // 使用单个查询获取分页数据和总数
  const results = await DB.prepare(`
    WITH filtered_mappings AS (
      SELECT * FROM mappings 
      WHERE path NOT IN (${banPath.map(() => '?').join(',')})
    )
    SELECT 
      filtered.*,
      (SELECT COUNT(*) FROM filtered_mappings) as total_count
    FROM filtered_mappings as filtered
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...banPath, pageSize, offset).all();

  if (!results.results || results.results.length === 0) {
    return {
      mappings: {},
      total: 0,
      page,
      pageSize,
      totalPages: 0
    };
  }

  const total = results.results[0].total_count;
  const mappings = {};

  for (const row of results.results) {
    mappings[row.path] = {
      target: row.target,
      targets: parseTargets(row.targets || row.target),
      idx: row.idx || 0,
      name: row.name,
      expiry: row.expiry,
      enabled: row.enabled === 1,
      isWechat: row.isWechat === 1,
      qrCodeData: row.qrCodeData
    };
  }

  return {
    mappings,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

// target 参数：单链接或多链接（数组 / 多行字符串），统一转为多链接数组存储
async function createMapping(path, target, name, expiry, enabled = true, isWechat = false, qrCodeData = null) {
  if (!path || typeof path !== 'string') {
    throw new Error('Invalid input');
  }

  const targets = parseTargets(target);
  if (targets.length === 0) {
    throw new Error('Invalid input');
  }

  // 检查短链名是否在禁用列表中
  if (banPath.includes(path)) {
    throw new Error('该短链名已被系统保留，请使用其他名称');
  }

  if (expiry && isNaN(Date.parse(expiry))) {
    throw new Error('Invalid expiry date');
  }

  // 如果是微信二维码，必须提供二维码数据
  if (isWechat && !qrCodeData) {
    throw new Error('微信二维码必须提供原始二维码数据');
  }

  await DB.prepare(`
    INSERT INTO mappings (path, target, targets, idx, name, expiry, enabled, isWechat, qrCodeData)
    VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)
  `).bind(
    path,
    targets[0],
    JSON.stringify(targets),
    name || null,
    expiry || null,
    enabled ? 1 : 0,
    isWechat ? 1 : 0,
    qrCodeData
  ).run();
}

async function deleteMapping(path) {
  if (!path || typeof path !== 'string') {
    throw new Error('Invalid input');
  }

  // 检查是否在禁用列表中
  if (banPath.includes(path)) {
    throw new Error('系统保留的短链名无法删除');
  }

  await DB.prepare('DELETE FROM mappings WHERE path = ?').bind(path).run();
}

async function updateMapping(originalPath, newPath, target, name, expiry, enabled = true, isWechat = false, qrCodeData = null) {
  if (!originalPath || !newPath) {
    throw new Error('Invalid input');
  }

  // 检查新短链名是否在禁用列表中
  if (banPath.includes(newPath)) {
    throw new Error('该短链名已被系统保留，请使用其他名称');
  }

  if (expiry && isNaN(Date.parse(expiry))) {
    throw new Error('Invalid expiry date');
  }

  // 如果没有提供新的目标，保留原有的 targets
  let targets;
  if (target) {
    targets = parseTargets(target);
    if (targets.length === 0) throw new Error('Invalid input');
  } else {
    const existingMapping = await DB.prepare(`
      SELECT targets, target
      FROM mappings
      WHERE path = ?
    `).bind(originalPath).first();
    targets 
