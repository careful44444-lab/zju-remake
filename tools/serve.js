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

function urlPage(rec, alive) {
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

  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>公网地址</title>' +
    '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:radial-gradient(900px 600px at 50% -10%,#18222c,#0b0f14 60%);color:#e9eff6;' +
    'font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;padding:24px}' +
    '.card{max-width:620px;width:100%;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.015));' +
    'border:1px solid #232e39;border-radius:20px;padding:26px 24px}' +
    'h1{font-size:15px;margin:0 0 18px;color:#8fa3b4;font-weight:500;letter-spacing:.08em}' +
    '.big{font-size:30px;font-weight:800;margin-bottom:14px}' +
    '.ok{color:#6fe0bd}.dead{color:#ff8d7e}' +
    '.url{font-size:15px;line-height:1.6;word-break:break-all;background:rgba(0,0,0,.35);' +
    'border:1px solid #26313b;border-radius:12px;padding:14px;color:#ffe08a;margin-bottom:16px}' +
    '.url.dim{color:#7b8896}' +
    '.row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}' +
    'button,.btn{font:inherit;font-size:14px;padding:11px 18px;border-radius:11px;cursor:pointer;' +
    'text-decoration:none;border:1px solid #2b3540;background:rgba(255,255,255,.04);color:#e9eff6}' +
    'button{background:linear-gradient(100deg,#ffe08a,#ffb347);color:#241a05;border:0;font-weight:700}' +
    '.hint{font-size:12.5px;color:#8294a3;line-height:1.8;margin:0}' +
    'b{color:#cfe0ea}' +
'.cfg{margin-top:22px;border-top:1px solid #232e39;padding-top:16px}' +
'.cfg summary{font-size:13px;color:#8fa3b4;cursor:pointer;outline:none}' +
'.cfg label{display:block;font-size:11px;color:#8294a3;margin:12px 0 5px}' +
'.cfg input,.cfg textarea{width:100%;box-sizing:border-box;font:inherit;font-size:13px;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid #26313b;color:#e9eff6;resize:vertical}' +
'.cfg input:focus,.cfg textarea:focus{outline:0;border-color:rgba(255,215,106,.5)}' +
'</style></head><body><div class="card">' +
    '<h1>当前公网地址</h1>' + body +
    '<script>function cp(b){var t=document.querySelector(".url").textContent.trim();' +
    'navigator.clipboard&&navigator.clipboard.writeText(t).then(function(){b.textContent="已复制";' +
    'setTimeout(function(){b.textContent="复制链接"},1500)})}</script>' +
'<script>var sv=document.getElementById("tSave");if(sv)sv.onclick=function(){' +
'var h=document.getElementById("tHost").value,t=document.getElementById("tTok").value;' +
'fetch("/api/tunnel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({hostname:h,token:t})})' +
'.then(function(r){return r.json()}).then(function(r){document.getElementById("tMsg").textContent=(r.msg||"")+"。重启「内测启动.bat」后生效。"})};</script>' +
        '<details class="cfg"' + (rec && rec.fixed ? '' : ' open') + '>' +
    '<summary>把它改成固定地址（可选）</summary>' +
    '<p class="hint" style="margin:10px 0 12px">现在这个地址每次重启都会变。想固定：买域名 → 接进 Cloudflare → 建一条 Tunnel → 把 token 和域名填在下面（步骤见 <b>固定地址教程.md</b>）。</p>' +
    '<label>域名</label><input id="tHost" placeholder="game.你的域名.com" value="' + esc((rec && rec.hostname) || '') + '">' +
    '<label>tunnel token</label><textarea id="tTok" rows="3" placeholder="eyJhIjoi...">' + esc((rec && rec.token) || '') + '</textarea>' +
    '<div class="row" style="margin-top:12px"><button id="tSave">保存</button>' +
    '<a class="btn" href="https://one.dash.cloudflare.com/" target="_blank">打开 Cloudflare 后台</a></div>' +
    '<p class="hint" id="tMsg"></p></details>' +
'</div></body></html>';
}

http.createServer(function (req, res) {
  var p = decodeURIComponent((req.url || '/').split('?')[0]);
  var qs = (req.url || '').split('?')[1] || '';

  // 看板 / 统计默认只对本地开放（公网隧道只能玩游戏，看不到别人的数据）
  var proxied = !!(req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip']);
  if ((p === '/dashboard' || p === '/stats') && proxied && !PUBLIC_DASH) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 看板只在本机开放。要在公网看，启动时加 --public-dashboard');
  }

  // 查当前公网地址（只给本机看）
  if (p === '/url') {
    if (proxied) { res.writeHead(404); return res.end(); }
    var rec = null;
    try { rec = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tunnel.json'), 'utf8')); } catch (e) { }
    var alive = false;
    if (rec) { try { process.kill(rec.pid, 0); alive = true; } catch (e) { } }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(urlPage(rec, alive));
  }

  // 备份管理（只给本机看）
  if (p === '/backups') {
    if (proxied) { res.writeHead(403); return res.end('403'); }
    return fs.readFile(path.join(__dirname, 'backups.html'), function (err, buf) {
      res.writeHead(err ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(err ? 'backups.html missing' : buf);
    });
  }

  if (p === '/api/backups') {
    if (proxied) { res.writeHead(403); return res.end('403'); }
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
    if (proxied) { res.writeHead(403); return res.end('403'); }
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
    if (proxied) { res.writeHead(403); return res.end('403'); }
    return fs.readFile(path.join(__dirname, 'runs.html'), function (err, buf) {
      res.writeHead(err ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(err ? 'runs.html missing' : buf);
    });
  }

  // 按年级看
  if (p === '/grades') {
    if (proxied) { res.writeHead(403); return res.end('403'); }
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
    if (proxied) { res.writeHead(403); return res.end('403'); }
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

  // 数值设置
  if (p === "/settings") {
    if (proxied) { res.writeHead(403); return res.end("403"); }
    return fs.readFile(path.join(__dirname, "settings.html"), function (err, buf) {
      res.writeHead(err ? 500 : 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(err ? "settings.html missing" : buf);
    });
  }

  if (p === "/config-edit") {
    if (proxied) { res.writeHead(403); return res.end("403"); }
    var Cf = require("../game/config.js");
    var cur = loadConfigOverride() || {};
    return json(res, 200, {
      ok: true,
      current: {
        points: cur.points != null ? cur.points : Cf.INIT_POINTS,
        rounds: cur.rounds != null ? cur.rounds : Cf.MAX_ROUNDS,
        stepCost: cur.stepCost || Cf.STEP_COST,
        roundPoints: cur.roundPoints || Cf.ROUND_POINTS,
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
    if (proxied) { res.writeHead(403); return res.end("403"); }
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
        fs.writeFileSync(CONFIG_OVERRIDE, JSON.stringify({
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
          inits: initsOut
        }, null, 2), "utf8");
        json(res, 200, { ok: true, msg: "已保存" });
      } catch (e) { json(res, 500, { ok: false, msg: String(e.message) }); }
    });
    return;
  }

  // 管理后台（所有入口的中控页）
  if (p === "/admin") {
    if (proxied) { res.writeHead(403); return res.end("403"); }
    return fs.readFile(path.join(__dirname, "admin.html"), function (err, buf) {
      res.writeHead(err ? 500 : 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(err ? "admin.html missing" : buf);
    });
  }

  // 一键导出 CSV
  if (p === "/api/export.csv") {
    if (proxied) { res.writeHead(403); return res.end("403"); }
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
    if (proxied) { res.writeHead(403); return res.end('403'); }
    return fs.readFile(path.join(__dirname, 'editor.html'), function (err, buf) {
      res.writeHead(err ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(err ? 'editor.html missing' : buf);
    });
  }

  if (p === '/content-edit') {
    if (proxied) { res.writeHead(403); return res.end('403'); }
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
    if (proxied) { res.writeHead(403); return res.end('403'); }
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
        fs.writeFileSync(CONTENT_OVERRIDE, JSON.stringify(o.data || {}, null, 2), 'utf8');
        json(res, 200, { ok: true, msg: '已保存' });
      } catch (e) { json(res, 500, { ok: false, msg: String(e.message) }); }
    });
    return;
  }

  // 保存固定隧道配置（后台「公网地址」页用）
  if (p === "/api/tunnel") {
    if (proxied) { res.writeHead(403); return res.end("403"); }
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
        cur.token = String(o.token || "").trim();
        cur.hostname = String(o.hostname || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
        cur.fixed = !!(cur.token && cur.hostname);
        if (cur.hostname) {
          cur.url = "https://" + cur.hostname;
          cur.play = cur.url + "/play";
          cur.dashboard = cur.url + "/dashboard";
        }
        fs.writeFileSync(tf, JSON.stringify(cur, null, 2), "utf8");
        json(res, 200, { ok: true, msg: cur.fixed ? "已保存，下次启动「内测启动.bat」就生效" : "已保存（token 和域名都要填才生效）" });
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
  var ALLOW = ['/h5/', '/game/', '/render/', '/dist/'];
  var okPath = false;
  for (var i = 0; i < ALLOW.length; i++) if (p.indexOf(ALLOW[i]) === 0) okPath = true;
  if (!okPath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 ' + p);
  }

  var f = path.normalize(path.join(root, p));
  if (f.indexOf(root) !== 0) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(f, function (err, buf) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 ' + p); }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
}).listen(port, '0.0.0.0', function () {
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
