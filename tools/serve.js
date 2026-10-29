/* 一个进程搞定：游戏 + 收集 + 看板（同源，没有跨域问题，也只需要一条隧道）
 * 用法：node tools/serve.js [端口]
 *
 *   /                 → 游戏（不记录）
 *   /play             → 游戏（自动上报到同源 /collect）  ← 发给别人的就是这条
 *   /dashboard        → 数据看板
 *   /stats            → 聚合 JSON
 *   POST /collect     → 收集
 */
var http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
var collector = require('./collect.js');
var backup = require('./backup.js');

var root = path.join(__dirname, '..');
var portArg = process.argv[2];
var port = (portArg && /^\d+$/.test(portArg)) ? parseInt(portArg, 10) : parseInt(process.env.PORT || 8123, 10);
var PUBLIC_DASH = process.argv.indexOf('--public-dashboard') >= 0;
var collect = collector.createHandler();

var mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// 写文件：如果被设成只读（比如从微信收到的文件），先去掉只读再写
function writeTextSafe(file, text) {
  try {
    fs.writeFileSync(file, text, "utf8");
    return true;
  } catch (e) {
    if (e.code !== "EPERM" && e.code !== "EACCES") throw e;
    try { fs.chmodSync(file, 0o666); } catch (e2) { }
    fs.writeFileSync(file, text, "utf8");
    return true;
  }
}

function sendLogin(res, err, code, next) {
  var html = [
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>后台登录</title><style>',
    '*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;',
    'background:#f1f5f9;font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;padding:24px}',
    '.box{width:100%;max-width:360px;background:#fff;border:1px solid #e2e8f0;border-radius:18px;',
    'padding:28px 24px;box-shadow:0 18px 50px rgba(15,23,42,.08)}',
    'h1{margin:0 0 6px;font-size:19px;color:#0f172a}',
    'p.h{margin:0 0 20px;font-size:12px;color:#64748b;line-height:1.7}',
    'input{width:100%;font:inherit;font-size:14px;padding:11px 13px;border:1px solid #e2e8f0;',
    'border-radius:11px;outline:0}',
    'input:focus{border-color:#d97706;box-shadow:0 0 0 3px rgba(245,158,11,.12)}',
    'button{width:100%;margin-top:14px;padding:11px;border:0;border-radius:11px;background:#0f172a;',
    'color:#fff;font:inherit;font-weight:700;cursor:pointer}',
    'button:hover{background:#1e293b}',
    '.err{margin:12px 0 0;padding:9px 12px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:12.5px}',
    '.back{display:block;margin-top:16px;text-align:center;font-size:12px;color:#94a3b8;text-decoration:none}',
    '</style></head><body><form class="box" method="POST" action="/login">',
    '<h1>紫金港改造计划 · 后台</h1>',
    '<p class="h">这里是数据看板和管理页，需要密码。</p>',
    '<input type="hidden" name="next" value="', esc(next || "/admin"), '">',
    '<input type="password" name="password" placeholder="输入后台密码" autofocus autocomplete="current-password">',
    err ? ('<p class="err">' + esc(err) + '</p>') : "",
    '<button type="submit">进入</button>',
    '<a class="back" href="/h5/">← 回游戏</a>',
    '</form></body></html>'
  ].join("\n");
  res.writeHead(code, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(html);
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

// ---- 文案覆盖：base 来自 content.js / events.js，改动存 data/content-edit.json ----
var CONTENT_OVERRIDE = path.join(root, 'data', 'content-edit.json');
var CONFIG_OVERRIDE = path.join(root, 'data', 'config-edit.json');

function loadConfigOverride() {
  try { return JSON.parse(fs.readFileSync(CONFIG_OVERRIDE, 'utf8')); } catch (e) { return null; }
}

function loadOverride() {
  try { return JSON.parse(fs.readFileSync(CONTENT_OVERRIDE, 'utf8')); } catch (e) { return null; }
}

function effectiveContent() {
  var C = require('../game/content.js').CONTENT;
  var content = JSON.parse(JSON.stringify(C));
  var events = JSON.parse(JSON.stringify(require('../game/events.js').EVENTS));
  var o = loadOverride();
  if (o) {
    var flat = o.content || o;                       // 兼容两种格式
    var evList = o.events || o.__events || [];
    Object.keys(flat).forEach(function (k) {
      if (k === '__events') {
        evList.forEach(function (oe) {
          var t = null;
          for (var i = 0; i < events.length; i++) if (events[i].id === oe.id) t = events[i];
          if (!t) return;
          if (oe.title != null) t.title = oe.title;
          if (oe.text != null) t.text = oe.text;
          if (oe.when !== undefined) t.when = oe.when;
          (oe.options || []).forEach(function (o2, i2) {
            if (!t.options[i2]) return;
            if (typeof o2 === 'string') { t.options[i2].label = o2; return; }
            Object.keys(o2).forEach(function (key) { t.options[i2][key] = o2[key]; });
          });
        });
        return;
      }
      var c = content[k];
      if (!c) return;
      (flat[k].tiers || []).forEach(function (t, i2) {
        var b = c.tiers[i2];
        if (!b) return;
        if (t.title != null) b.title = t.title;
        if (t.desc != null) b.desc = t.desc;
        if (t.tags && t.tags.length) b.tags = t.tags;
      });
      (flat[k].caps || []).forEach(function (t, i2) {
        var b = c.caps[i2];
        if (!b) return;
        if (t.name != null) b.name = t.name;
        if (t.desc != null) b.desc = t.desc;
      });
    });
  }
  var Cf = require('../game/config.js');
  return {
    content: content,
    events: events,
    achievements: (o && o.__achievements) ? o.__achievements : JSON.parse(JSON.stringify(Cf.ACHIEVEMENTS)),
    titles: (o && o.__titles) ? o.__titles : JSON.parse(JSON.stringify(Cf.TITLES))
  };
}

function pwSection(savedMsg) {
  var has = AUTH.hasPassword();
  var h = '<hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0">';
  h += '<div style="font-size:13px;font-weight:700;margin-bottom:6px">后台密码 ';
  h += has ? '<span style="color:#059669">已设置</span>' : '<span style="color:#e11d48">未设置（公网进不去后台）</span>';
  h += '</div>';
  h += '<p class="hint" style="margin:0 0 10px">组员打开公网地址后，看数据 / 管后台要输这个密码；玩家玩游戏不需要。</p>';
  h += '<form method="POST" action="/save-password" style="display:flex;gap:8px;flex-wrap:wrap">';
  h += '<input type="password" name="password" placeholder="新密码（至少 4 位）" style="flex:1;min-width:150px;padding:9px 11px;border:1px solid #e2e8f0;border-radius:10px;font:inherit">';
  h += '<button class="btn" type="submit" style="padding:9px 14px">设置 / 修改</button>';
  if (has) h += '<button class="btn" type="submit" name="act" value="clear" style="padding:9px 14px;color:#e11d48" onclick="return confirm(\'关闭密码后，任何人都能看到后台数据。确定？\')">关闭密码</button>';
  h += '</form>';
  h += '<form method="POST" action="/save-password" style="margin-top:10px;font-size:12px;color:#475569">';
  h += '<input type="hidden" name="act" value="force">';
  h += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer">';
  h += '<input type="checkbox" name="on" value="1"' + (AUTH.forceLocal() ? ' checked' : '') + ' onchange="this.form.submit()">';
  h += '<span>本机也要密码（默认关；开了以后连你自己打开后台都要输）</span>';
  h += '</label></form>';
  if (savedMsg) h += '<p class="hint" style="color:#059669;margin-top:10px">' + esc(savedMsg) + '</p>';
  return h;
}

function urlPage(rec, alive, saved, savedMsg) {
  var play = rec ? rec.url + '/play' : '';
  var body = !rec
    ? '<div class="big dead">还没有启动过隧道</div>' +
      '<p class="hint">双击 <b>内测启动.bat</b>，等几秒钟再回来刷新这个页面。</p>'
    : (alive
      ? '<div class="big ok">在线' + (rec.fixed ? '（固定地址）' : '（临时地址）') + '</div>' +
        '<div class="url">' + esc(play) + '</div>' +
        '<div class="row"><button onclick="cp(this)">复制链接</button>' +
        '<a class="btn" href="' + esc(play) + '" target="_blank">打开试试</a>' +
        '<a class="btn" href="/dashboard">看数据</a></div>' +
        '<p class="hint">启动于 ' + esc(rec.at.replace('T', ' ').slice(0, 19)) + '（UTC）。这个窗口关掉后地址就会失效。</p>'
      : '<div class="big dead">已失效</div>' +
        '<div class="url dim">' + esc(play) + '</div>' +
        '<p class="hint">上次的隧道进程已经退出，这个地址打不开了。' +
        '重新双击 <b>内测启动.bat</b>，会生成一个新的地址。</p>');
  body += pwSection(savedMsg);

  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>公网地址</title>' +
    '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:radial-gradient(900px 600px at 50% -10%,#eef2f7,#f1f5f9 60%);color:#0f172a;' +
    'font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;padding:24px}' +
    '.card{max-width:620px;width:100%;background:linear-gradient(180deg,rgba(15,23,42,.04),rgba(255,255,255,.015));' +
    'border:1px solid #e2e8f0;border-radius:20px;padding:26px 24px}' +
    'h1{font-size:15px;margin:0 0 18px;color:#64748b;font-weight:500;letter-spacing:.08em}' +
    '.big{font-size:30px;font-weight:800;margin-bottom:14px}' +
    '.ok{color:#059669}.dead{color:#e11d48}' +
    '.url{font-size:15px;line-height:1.6;word-break:break-all;background:rgba(15,23,42,.06);' +
    'border:1px solid #e2e8f0;border-radius:12px;padding:14px;color:#d97706;margin-bottom:16px}' +
    '.url.dim{color:#94a3b8}' +
    '.row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}' +
    'button,.btn{font:inherit;font-size:14px;padding:11px 18px;border-radius:11px;cursor:pointer;' +
    'text-decoration:none;border:1px solid #cbd5e1;background:rgba(15,23,42,.04);color:#0f172a}' +
    'button{background:linear-gradient(100deg,#d97706,#ea580c);color:#241a05;border:0;font-weight:700}' +
    '.hint{font-size:12.5px;color:#64748b;line-height:1.8;margin:0}' +
    'b{color:#334155}' +
'.cfg{margin-top:22px;border-top:1px solid #e2e8f0;padding-top:16px;display:block}' +
    '.cfgtitle{font-size:13px;color:#64748b;margin-bottom:2px}' +
    '.okmsg{font-size:12.5px;color:#059669;background:rgba(5,150,105,.1);border:1px solid rgba(5,150,105,.35);border-radius:10px;padding:10px 12px;margin:10px 0 0}' +
'.cfg summary{font-size:13px;color:#64748b;cursor:pointer;outline:none}' +
'.cfg label{display:block;font-size:11px;color:#64748b;margin:12px 0 5px}' +
'.cfg input,.cfg textarea{width:100%;box-sizing:border-box;font:inherit;font-size:13px;padding:10px 12px;border-radius:10px;background:rgba(15,23,42,.06);border:1px solid #e2e8f0;color:#0f172a;resize:vertical}' +
'.cfg input:focus,.cfg textarea:focus{outline:0;border-color:rgba(217,119,6,.5)}' +
'</style></head><body><div class="card">' +
    '<h1>当前公网地址</h1>' + body +
    '<script>function cp(b){var t=document.querySelector(".url").textContent.trim();' +
    'navigator.clipboard&&navigator.clipboard.writeText(t).then(function(){b.textContent="已复制";' +
    'setTimeout(function(){b.textContent="复制链接"},1500)})}</script>' +
        '<form class="cfg" method="POST" action="/save-tunnel">' +
    '<div class="cfgtitle">把它改成固定地址（可选）</div>' +
    '<p class="hint" style="margin:10px 0 12px">现在这个地址每次重启都会变。想固定：买域名 → 接进 Cloudflare → 建一条 Tunnel → 把 token 和域名填在下面（步骤见 <b>固定地址教程.md</b>）。</p>' +
    (saved ? '<p class="okmsg">✅ 已保存。现在关掉黑色窗口，重新双击「内测启动.bat」。</p>' : '') +
    '<label>域名</label><input name="hostname" placeholder="game.你的域名.com" value="' + esc((rec && rec.hostname) || '') + '">' +
    '<label>tunnel token</label><textarea name="token" rows="3" placeholder="eyJhIjoi...">' + esc((rec && rec.token) || '') + '</textarea>' +
    '<div class="row" style="margin-top:12px"><button type="submit">保存</button>' +
    '<a class="btn" href="https://one.dash.cloudflare.com/" target="_blank">打开 Cloudflare 后台</a></div>' +
    '</form>' +
'</div></body></html>';
}

var AUTH = require('./auth.js');

// 只有本机（127.0.0.1 / ::1）来的请求算「自己人」
var LOOPBACK = { '127.0.0.1': 1, '::1': 1, '::ffff:127.0.0.1': 1 };
function isLocalReq(req) {
  var ip = (req.socket && req.socket.remoteAddress) || '';
  return !!LOOPBACK[ip];
}

// 公网也能访问的路径（游戏本体 + 数据上报 + 文案/数值读取）
var PUBLIC_EXACT = { '/': 1, '/login': 1, '/logout': 1, '/collect': 1, '/content-edit': 1, '/config-edit': 1, '/api/survey': 1, '/api/config': 1, '/favicon.ico': 1, '/play': 1 };
var PUBLIC_PREFIX = ['/h5/', '/game/', '/render/'];
// 隧道过来的请求，socket 也是 127.0.0.1，所以必须结合 forwarded 头判断
function isRemoteReq(req) {
  var proxied = !!(req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip']);
  return proxied || !isLocalReq(req);
}

function isPublicPath(p) {
  if (PUBLIC_EXACT[p]) return true;
  for (var i = 0; i < PUBLIC_PREFIX.length; i++) if (p.indexOf(PUBLIC_PREFIX[i]) === 0) return true;
  return false;
}

http.createServer(function (req, res) {
  var p = decodeURIComponent((req.url || '/').split('?')[0]);
  // 任何穿越尝试直接拒绝（/h5/../tools/xxx、/game/..\data\xxx 这类）
  if (p.indexOf('..') >= 0 || p.indexOf('\\') >= 0) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('400 bad path');
  }
  var qs = (req.url || '').split('?')[1] || '';

  // ---------- 登录 / 登出 ----------
  if (p === '/login') {
    if (req.method === 'POST') {
      var ip = (req.socket && req.socket.remoteAddress) || '?';
      var lock = AUTH.lockedFor(ip);
      if (lock) return sendLogin(res, '试错太多次，请 ' + lock + ' 秒后再试', 429, '/login');
      var body = '';
      req.on('data', function (c) { body += c; if (body.length > 8192) req.destroy(); });
      req.on('end', function () {
        var pw = '', next = '/admin';
        var ct = String(req.headers['content-type'] || '');
        if (ct.indexOf('application/json') >= 0) {
          try { var o = JSON.parse(body || '{}'); pw = o.password || ''; next = o.next || next; } catch (e) { }
        } else {
          var f = new URLSearchParams(body);
          pw = f.get('password') || '';
          next = f.get('next') || next;
        }
        if (!AUTH.hasPassword()) return sendLogin(res, '还没有设置后台密码，请先在本机打开 /url 设置', 403, next);
        if (!AUTH.checkPassword(pw)) {
          AUTH.noteFail(ip);
          return sendLogin(res, '密码不对', 401, next);
        }
        AUTH.noteOk(ip);
        if (next.indexOf('//') === 0 || next.indexOf('http') === 0) next = '/admin';
        res.writeHead(302, { 'Set-Cookie': AUTH.cookieFor(req), Location: next.indexOf('/') === 0 ? next : '/admin' });
        return res.end();
      });
      return;
    }
    var nx = /(^|&)next=([^&]*)/.exec(qs);
    var nextUrl = nx ? decodeURIComponent(nx[2]) : '/admin';
    return sendLogin(res, /(^|&)err=1(&|$)/.test(qs) ? '密码不对' : '', 200, nextUrl);
  }

  if (p === '/logout') {
    res.writeHead(302, { 'Set-Cookie': AUTH.clearCookie(), Location: '/login' });
    return res.end();
  }

  // 设置/清除后台密码（只给本机）
  if (p === '/save-password') {
    if (isRemoteReq(req)) { res.writeHead(403); return res.end('403'); }
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    var pb = '';
    req.on('data', function (c) { pb += c; if (pb.length > 8192) req.destroy(); });
    req.on('end', function () {
      var f2 = new URLSearchParams(pb);
      var pw2 = String(f2.get('password') || '');
      var act = f2.get('act') || 'set';
      if (act === 'force') {
        AUTH.setForceLocal(f2.get('on') === '1');
        res.writeHead(302, { Location: '/url?saved=1&msg=' + encodeURIComponent('已更新') });
        return res.end();
      }
      var r = act === 'clear' ? AUTH.clearPassword() : AUTH.setPassword(pw2);
      res.writeHead(302, { Location: '/url?saved=1&msg=' + encodeURIComponent(r.ok ? (act === 'clear' ? '已关闭密码（后台仅本机可看）' : '密码已设置') : (r.msg || '失败')) });
      res.end();
    });
    return;
  }

  // ---------- 门禁：非本机 + 非公开路径 + 未登录 → 去登录页 ----------
  if (!isPublicPath(p) && (isRemoteReq(req) || AUTH.forceLocal()) && !AUTH.isAuthed(req) && p !== '/save-password') {
    if (p.indexOf('/api/') === 0) { res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' }); return res.end(JSON.stringify({ ok: false, msg: '需要登录' })); }
    res.writeHead(302, { Location: '/login?next=' + encodeURIComponent(req.url || '/') });
    return res.end();
  }

  var proxied = !!(req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip']);

  // 查当前公网地址（只给本机看）
  if (p === '/url') {
    if (proxied) { res.writeHead(404); return res.end(); }
    var rec = null;
    try { rec = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tunnel.json'), 'utf8')); } catch (e) { }
    var alive = false;
    if (rec) { try { process.kill(rec.pid, 0); alive = true; } catch (e) { } }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    var m = /[?&]msg=([^&]*)/.exec(qs);
    return res.end(urlPage(rec, alive, /(^|&)saved=1(&|$)/.test(qs), m ? decodeURIComponent(m[1]) : ''));
  }

  // 备份管理（只给本机看）
  if (p === '/backups') {
    return fs.readFile(path.join(__dirname, 'backups.html'), function (err, buf) {
      res.writeHead(err ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(err ? 'backups.html missing' : buf);
    });
  }

  if (p === '/api/backups') {
    if (req.method === 'GET') {
      return json(res, 200, { ok: true, items: backup.items(), current: backup.currentStats() });
    }
    if (req.method === 'POST') {
      var body = '';
      req.on('data', function (c) { body += c; if (body.length > 65536) req.destroy(); });
      req.on('end', function () {
        var o = {};
        try { o = JSON.parse(body || '{}'); } catch (e) { return json(res, 400, { ok: false, msg: 'bad json' }); }
        var msg = '';
        // 批量删除备份
        if (Array.isArray(o.files)) {
          var fs2 = o.files.filter(function (x) { return typeof x === 'string' && x; });
          if (!fs2.length) return json(res, 400, { ok: false, msg: '没选中任何备份' });
          if (o.action !== 'delete') return json(res, 400, { ok: false, msg: '批量只支持删除' });
          var gone = 0;
          fs2.forEach(function (f) { if (backup.remove(f)) gone += 1; });
          return json(res, 200, { ok: true, msg: '已删除 ' + gone + ' 份备份', items: backup.items(), current: backup.currentStats() });
        }
        if (o.action === 'snapshot') {
          var name = backup.snapshot({ note: o.note || '', keep: 60 });
          msg = name ? '已备份 ' + name : '没有新数据可备份';
        } else if (o.action === 'restore') {
          if (!backup.exists(o.file)) return json(res, 404, { ok: false, msg: '找不到这份备份' });
          var okr = backup.restore(o.file, { yes: true });
          msg = okr ? '已回档到 ' + o.file : '回档失败';
        } else if (o.action === 'delete') {
          msg = backup.remove(o.file) ? '已删除 ' + o.file : '找不到这份备份';
        } else if (o.action === 'note') {
          msg = backup.setNote(o.file, o.note) ? '备注已保存' : '找不到这份备份';
        } else {
          return json(res, 400, { ok: false, msg: '未知操作' });
        }
        json(res, 200, { ok: true, msg: msg, items: backup.items(), current: backup.currentStats() });
      });
      return;
    }
    res.writeHead(405); return res.end();
  }

  if (p.indexOf('/download/') === 0) {
    var name2 = decodeURIComponent(p.slice('/download/'.length));
    if (!backup.exists(name2)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + name2 + '"'
    });
    return fs.createReadStream(path.join(backup.DIR, name2)).pipe(res);
  }

  // 单局管理页
  if (p === '/runs') {
    return fs.readFile(path.join(__dirname, 'runs.html'), function (err, buf) {
      res.writeHead(err ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(err ? 'runs.html missing' : buf);
    });
  }

  // 按年级看
  if (p === '/grades') {
    return fs.readFile(path.join(__dirname, 'grades.html'), function (err, buf) {
      res.writeHead(err ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(err ? 'grades.html missing' : buf);
    });
  }

  // 旧链接兼容
  if (p === '/players') {
    res.writeHead(302, { Location: '/grades' });
    return res.end();
  }

  if (p === '/api/runs') {
    var runsMod = require('./runs.js');
    if (req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        runs: runsMod.listRuns(),
        flags: runsMod.FLAGS,
        meta: require('./report.js').meta()
      });
    }
    if (req.method === 'POST') {
      var rb = '';
      req.on('data', function (c) { rb += c; if (rb.length > 65536) req.destroy(); });
      req.on('end', function () {
        var o = {};
        try { o = JSON.parse(rb || '{}'); } catch (e) { return json(res, 400, { ok: false, msg: 'bad json' }); }
        // 批量：传 rids 数组，服务端一次处理完
        if (Array.isArray(o.rids)) {
          var ids = o.rids.filter(function (x) { return typeof x === 'string' && x; });
          if (!ids.length) return json(res, 400, { ok: false, msg: '没选中任何一局' });
          if (o.action === 'delete') {
            backup.snapshot({ quiet: true, note: '批量删除对局前（' + ids.length + ' 局）' });
            var dn = 0;
            ids.forEach(function (id) { dn += runsMod.deleteRun(id) || 0; });
            return json(res, 200, { ok: true, msg: '已删除 ' + ids.length + ' 局（' + dn + ' 条事件），删除前已自动备份', runs: runsMod.listRuns(), meta: require('./report.js').meta() });
          }
          if (o.action === 'exclude' || o.action === 'include') {
            var on = o.action === 'exclude';
            ids.forEach(function (id) { runsMod.setExcluded(id, on); });
            return json(res, 200, { ok: true, msg: '已' + (on ? '排除' : '恢复') + ' ' + ids.length + ' 局', runs: runsMod.listRuns(), meta: require('./report.js').meta() });
          }
          return json(res, 400, { ok: false, msg: '批量操作不支持 ' + o.action });
        }
        if (!o.rid) return json(res, 400, { ok: false, msg: '缺少 rid' });
        var msg = '';
        if (o.action === 'delete') {
          backup.snapshot({ quiet: true, note: '删除对局前' });   // 先留一份底
          var n = runsMod.deleteRun(o.rid);
          msg = n ? '已删除这一局（' + n + ' 条事件），删除前已自动备份' : '没找到这一局';
        } else if (o.action === 'exclude') {
          runsMod.setExcluded(o.rid, true);
          msg = '已从统计中排除（数据还在，可以恢复）';
        } else if (o.action === 'include') {
          runsMod.setExcluded(o.rid, false);
          msg = '已恢复进统计';
        } else if (o.action === 'note') {
          runsMod.setNote(o.rid, o.note);
          msg = '备注已保存';
        } else {
          return json(res, 400, { ok: false, msg: '未知操作' });
        }
        json(res, 200, { ok: true, msg: msg, runs: runsMod.listRuns(), meta: require('./report.js').meta() });
      });
      return;
    }
    res.writeHead(405); return res.end();
  }

  // 问卷题库编辑页
  if (p === "/survey") {
    return fs.readFile(path.join(__dirname, "survey.html"), function (err, buf) {
      res.writeHead(err ? 500 : 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(err ? "survey.html missing" : buf);
    });
  }

  // 数值设置
  if (p === "/settings") {
    return fs.readFile(path.join(__dirname, "settings.html"), function (err, buf) {
      res.writeHead(err ? 500 : 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(err ? "settings.html missing" : buf);
    });
  }

  // 问卷题库：读 / 存
  if (p === "/api/survey") {
    var SURVEY_FILE = path.join(root, "data", "survey.json");
    if (req.method === "GET") {
      var sv = null;
      try { sv = JSON.parse(fs.readFileSync(SURVEY_FILE, "utf8")); } catch (e) { }
      if (!sv) sv = { intro: "", outro: "", questions: [] };
      return json(res, 200, sv);
    }
    if (req.method === "POST") {
      var sb = "";
      req.on("data", function (c) { sb += c; if (sb.length > 65536) req.destroy(); });
      req.on("end", function () {
        var o = {};
        try { o = JSON.parse(sb || "{}"); } catch (e) { return json(res, 400, { ok: false, msg: "bad json" }); }
        if (!o || !Array.isArray(o.questions)) return json(res, 400, { ok: false, msg: "缺少 questions" });
        var out = {
          intro: String(o.intro || ""),
          outro: String(o.outro || ""),
          questions: o.questions.slice(0, 20).map(function (q, i) {
            return {
              id: String(q.id || ("q" + (i + 1))),
              type: (q.type === "text") ? "text" : "choice",
              title: String(q.title || ""),
              options: Array.isArray(q.options) ? q.options.slice(0, 12).map(String) : [],
              allowText: !!q.allowText,
              textHint: String(q.textHint || ""),
              placeholder: String(q.placeholder || "")
            };
          })
        };
        try {
          if (!fs.existsSync(path.join(root, "data"))) fs.mkdirSync(path.join(root, "data"));
          writeTextSafe(SURVEY_FILE, JSON.stringify(out, null, 2));
          json(res, 200, { ok: true, msg: "已保存" });
        } catch (e) { json(res, 500, { ok: false, msg: String(e.message) }); }
      });
      return;
    }
    res.writeHead(405); return res.end();
  }

  if (p === "/config-edit") {
    var Cf = require("../game/config.js");
    var cur = loadConfigOverride() || {};
    return json(res, 200, {
      ok: true,
      current: {
        points: cur.points != null ? cur.points : Cf.INIT_POINTS,
        rounds: cur.rounds != null ? cur.rounds : Cf.MAX_ROUNDS,
        stepCost: cur.stepCost || Cf.STEP_COST,
        stepCostDims: cur.stepCostDims || null,
        roundPoints: cur.roundPoints || Cf.ROUND_POINTS,
        relics: cur.relics != null ? cur.relics : Cf.RELICS,
        itemsEnabled: cur.itemsEnabled != null ? cur.itemsEnabled : Cf.ITEMS_ENABLED,
        items: cur.items || Cf.ITEMS,
        carryRatio: cur.carryRatio != null ? cur.carryRatio : Cf.CARRY_RATIO,
        breadthBase: cur.breadthBase != null ? cur.breadthBase : Cf.BREADTH_BASE,
        inits: (function () {
          var o = {};
          Cf.DIMS.forEach(function (d) { o[d.id] = (cur.inits && cur.inits[d.id]) || d.init; });
          return o;
        })()
      },
      dims: Cf.DIMS.map(function (d) { return { id: d.id, name: d.name, init: d.init }; }),
      stepCost: Cf.STEP_COST,
      roundPoints: Cf.ROUND_POINTS,
      items: Cf.ITEMS,
      itemsEnabled: Cf.ITEMS_ENABLED,
      defaults: { points: Cf.INIT_POINTS, rounds: Cf.MAX_ROUNDS, stepCost: Cf.STEP_COST, breadthBase: Cf.BREADTH_BASE, roundPoints: Cf.ROUND_POINTS, carryRatio: Cf.CARRY_RATIO }
    });
  }

  if (p === "/api/config") {
    if (req.method !== "POST") { res.writeHead(405); return res.end(); }
    var cb2 = "";
    req.on("data", function (c) { cb2 += c; if (cb2.length > 65536) req.destroy(); });
    req.on("end", function () {
      var o = {};
      try { o = JSON.parse(cb2 || "{}"); } catch (e) { return json(res, 400, { ok: false, msg: "bad json" }); }
      if (o.reset) {
        try { fs.unlinkSync(CONFIG_OVERRIDE); } catch (e) { }
        return json(res, 200, { ok: true, msg: "已还原" });
      }
      var n = function (v) { return typeof v === "number" && isFinite(v); };
      if (!n(o.points) || o.points < 10 || o.points > 200) return json(res, 400, { ok: false, msg: "点数要在 10~200" });
      if (!n(o.rounds) || o.rounds < 1 || o.rounds > 8) return json(res, 400, { ok: false, msg: "回合一到八" });
      try {
        if (!fs.existsSync(path.join(root, "data"))) fs.mkdirSync(path.join(root, "data"));
        var initsOut = {};
        var Cc = require("../game/config.js");
        Cc.DIMS.forEach(function (d) {
          var v = o.inits && o.inits[d.id];
          var n2 = (typeof v === "number" && v >= 1 && v <= 5) ? Math.round(v) : d.init;
          initsOut[d.id] = n2;
        });
        writeTextSafe(CONFIG_OVERRIDE, JSON.stringify({
          points: Math.round(o.points), rounds: Math.round(o.rounds),
          breadthBase: o.breadthBase,
          carryRatio: (function () {
            var r = +o.carryRatio;
            if (!isFinite(r) || r < 0) r = 1;
            return Math.min(1, Math.round(r * 100) / 100);
          })(),
          roundPoints: (function () {
            var arr = (Object.prototype.toString.call(o.roundPoints) === '[object Array]') ? o.roundPoints : [14, 14, 15, 15];
            var n = Math.max(1, Math.min(8, Math.round(+o.rounds || arr.length)));
            arr = arr.slice(0, n).map(function (v) { return Math.max(0, Math.min(80, Math.round(+v || 0))); });
            while (arr.length < n) arr.push(arr[arr.length - 1] || 0);
            return arr;
          })(),
          itemsEnabled: o.itemsEnabled !== false,
          relics: o.relics !== false,
          items: (function () {
            var src = (Object.prototype.toString.call(o.items) === '[object Array]') ? o.items : null;
            var base = require('../game/config.js').ITEMS;
            return base.map(function (d) {
              var m = null;
              if (src) for (var i = 0; i < src.length; i++) if (src[i].id === d.id) m = src[i];
              return {
                id: d.id, type: d.type,
                name: (m && m.name) || d.name,
                desc: (m && m.desc) || d.desc,
                factor: d.type === 'multiply' ? Math.max(1, Math.min(5, +(m && m.factor) || d.factor || 1.5)) : undefined
              };
            });
          })(),
          stepCost: (function () {
            var arr = (Object.prototype.toString.call(o.stepCost) === '[object Array]') ? o.stepCost : [3, 5, 8, 14];
            return arr.slice(0, 4).map(function (v) { return Math.max(0, Math.min(60, Math.round(+v || 0))); });
          })(),
          // 每个维度单独的价格：没传或者传 null 就表示「所有维度共用一套」
          stepCostDims: (function () {
            var src = o.stepCostDims;
            if (!src || typeof src !== 'object') return null;
            var out = {};
            require('../game/config.js').DIMS.forEach(function (d) {
              var a = src[d.id];
              if (Object.prototype.toString.call(a) !== '[object Array]') return;
              out[d.id] = a.slice(0, 4).map(function (v) { return Math.max(0, Math.min(60, Math.round(+v || 0))); });
            });
            return Object.keys(out).length ? out : null;
          })(),
          inits: initsOut
        }, null, 2));
        json(res, 200, { ok: true, msg: "已保存" });
      } catch (e) { json(res, 500, { ok: false, msg: String(e.message) }); }
    });
    return;
  }


  // 档位信物对照表（30 个图标，改完刷新即可看到）
  if (p === "/relics") {
    return fs.readFile(path.join(__dirname, "relics-test.html"), function (err, buf) {
      res.writeHead(err ? 500 : 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(err ? "relics-test.html missing" : buf);
    });
  }

  // 管理后台（所有入口的中控页）
  if (p === "/admin") {
    return fs.readFile(path.join(__dirname, "admin.html"), function (err, buf) {
      res.writeHead(err ? 500 : 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(err ? "admin.html missing" : buf);
    });
  }

  // 一键导出 CSV
  if (p === "/api/export.csv") {
    var csvFile = backup.csv();
    if (!csvFile) { res.writeHead(404, {"Content-Type":"text/plain; charset=utf-8"}); return res.end("还没有数据"); }
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"runs.csv\""
    });
    return fs.createReadStream(csvFile).pipe(res);
  }

  // 文案编辑器
  if (p === '/edit') {
    return fs.readFile(path.join(__dirname, 'editor.html'), function (err, buf) {
      res.writeHead(err ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(err ? 'editor.html missing' : buf);
    });
  }

  if (p === '/content-edit') {
    try {
      var eff = effectiveContent();
      eff.dims = require('../game/config.js').DIMS.map(function (d) {
        return { id: d.id, name: d.name, sub: d.sub };
      });
      eff.tiers = require('../game/config.js').TIERS;
      eff.items = require('../game/config.js').ITEMS;
      return json(res, 200, eff);
    } catch (e) { return json(res, 500, { ok: false, msg: String(e.message) }); }
  }

  if (p === '/api/content') {
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    var cb = '';
    req.on('data', function (c) { cb += c; if (cb.length > 2 * 1024 * 1024) req.destroy(); });
    req.on('end', function () {
      var o = {};
      try { o = JSON.parse(cb || '{}'); } catch (e) { return json(res, 400, { ok: false, msg: 'bad json' }); }
      if (o.reset) {
        try { fs.unlinkSync(CONTENT_OVERRIDE); } catch (e) { }
        return json(res, 200, { ok: true, msg: '已还原' });
      }
      try {
        if (!fs.existsSync(path.join(root, 'data'))) fs.mkdirSync(path.join(root, 'data'));
        writeTextSafe(CONTENT_OVERRIDE, JSON.stringify(o.data || {}, null, 2));
        json(res, 200, { ok: true, msg: '已保存' });
      } catch (e) { json(res, 500, { ok: false, msg: String(e.message) }); }
    });
    return;
  }

  // 表单提交保存（不依赖 JS；成功后 303 跳回 /url?saved=1）
  if (p === '/save-tunnel' && req.method === 'POST') {
    var fb = '';
    req.on('data', function (c) { fb += c; if (fb.length > 65536) req.destroy(); });
    req.on('end', function () {
      try {
        var form = new URLSearchParams(fb);
        var host = String(form.get('hostname') || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
        var tok = String(form.get('token') || '').trim().replace(/^[\"'`]|[\"'`]$/g, '');
        if (/service\s+install/i.test(tok)) {
          var ps = tok.split(/\s+/);
          tok = ps[ps.length - 1];
        }
        var tf = path.join(root, 'data', 'tunnel.json');
        var cur2 = {};
        try { cur2 = JSON.parse(fs.readFileSync(tf, 'utf8')); } catch (e) { }
        cur2.token = tok;
        cur2.hostname = host;
        cur2.fixed = !!(tok && host);
        if (host) {
          cur2.url = 'https://' + host;
          cur2.play = cur2.url + '/play';
          cur2.dashboard = cur2.url + '/dashboard';
        }
        if (!fs.existsSync(path.join(root, 'data'))) fs.mkdirSync(path.join(root, 'data'), { recursive: true });
        fs.writeFileSync(tf, JSON.stringify(cur2, null, 2), 'utf8');
      } catch (e) { }
      res.writeHead(303, { Location: '/url?saved=1' });
      res.end();
    });
    return;
  }

  // 保存固定隧道配置（后台「公网地址」页用）
  if (p === "/api/tunnel") {
    if (req.method !== "POST") { res.writeHead(405); return res.end(); }
    var tb = "";
    req.on("data", function (c) { tb += c; if (tb.length > 65536) req.destroy(); });
    req.on("end", function () {
      var o = {};
      try { o = JSON.parse(tb || "{}"); } catch (e) { return json(res, 400, { ok: false, msg: "bad json" }); }
      try {
        var tf = path.join(root, "data", "tunnel.json");
        var cur = {};
        try { cur = JSON.parse(fs.readFileSync(tf, "utf8")); } catch (e) { }
        if (o.reset) {
          delete cur.token; delete cur.hostname; delete cur.fixed;
          delete cur.url; delete cur.play; delete cur.dashboard;
          fs.writeFileSync(tf, JSON.stringify(cur, null, 2), "utf8");
          return json(res, 200, { ok: true, msg: "已清除，下次启动会用临时地址" });
        }
        var rawTok = String(o.token || "").trim().replace(/^["'`]|["'`]$/g, "");
        // 允许直接粘贴 Cloudflare 给的那整条命令：cloudflared.exe service install <token>
        if (/service\s+install/i.test(rawTok)) {
          var parts2 = rawTok.split(/\s+/);
          rawTok = parts2[parts2.length - 1];
        }
        cur.token = rawTok;
        cur.hostname = String(o.hostname || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
        cur.fixed = !!(cur.token && cur.hostname);
        if (cur.hostname) {
          cur.url = "https://" + cur.hostname;
          cur.play = cur.url + "/play";
          cur.dashboard = cur.url + "/dashboard";
        }
        fs.writeFileSync(tf, JSON.stringify(cur, null, 2), "utf8");
        json(res, 200, { ok: true, msg: cur.fixed ? "已保存" : "token 和域名都要填才生效", hostname: cur.hostname || "", tokenLen: (cur.token || "").length, fixed: !!cur.fixed });
      } catch (e) { json(res, 500, { ok: false, msg: String(e.message) }); }
    });
    return;
  }

  // 收集 / 看板
  if (p === '/collect' || p === '/stats' || p === '/dashboard') return collect(req, res);

  // 一键进入「带数据上报」的游戏
  if (p === '/play') {
    var loc = '/h5/?collect=' + encodeURIComponent('/collect') + (qs ? '&' + qs : '');
    res.writeHead(302, { Location: loc });
    return res.end();
  }

  if (p === '/') p = '/h5/index.html';
  if (p.slice(-1) === '/') p += 'index.html';

  // 白名单：只对外提供前端资源。data/（玩家数据）、tools/、dist 之外的目录一律不给
  var ALLOW = ['/h5/', '/game/', '/render/', '/dist/', '/assets/'];
  var okPath = false;
  for (var i = 0; i < ALLOW.length; i++) if (p.indexOf(ALLOW[i]) === 0) okPath = true;
  if (!okPath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 ' + p);
  }

  var f = path.normalize(path.join(root, p));
  var rel = path.relative(root, f);
  // 必须真的落在允许的四个目录里，且不能跑出项目根目录
  var okReal = rel && rel.indexOf('..') !== 0 && 
    ['h5', 'game', 'render', 'dist', 'assets'].some(function (d) { return rel === d || rel.indexOf(d + path.sep) === 0; });
  if (!okReal) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('403 forbidden'); }
  fs.readFile(f, function (err, buf) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 ' + p); }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
}).listen(port, function () {   // 不指定 host = 双栈（IPv4 + IPv6），隧道用 localhost 也能连上
  console.log('');
  console.log('  游戏        http://127.0.0.1:' + port + '/h5/');
  console.log('  带上报游戏  http://127.0.0.1:' + port + '/play      ← 自己玩 / 发给别人都用这个');
  console.log('  数据看板    http://127.0.0.1:' + port + '/dashboard');
  console.log('  数据文件    ' + collector.DEFAULT_FILE);
  console.log('');

  // 每 10 分钟检查一次：数据有变化就自动存一份快照（最多留 30 份）
  setInterval(function () { backup.autoSnapshot(); }, 10 * 60 * 1000);
  setTimeout(function () { backup.autoSnapshot(); }, 60 * 1000);
  var nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (name) {
    nets[name].forEach(function (n) {
      if (n.family === 'IPv4' && !n.internal) {
        console.log('  局域网      http://' + n.address + ':' + port + '/play   (' + name + ')');
      }
    });
  });
  console.log('');
});
