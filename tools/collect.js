/* 收集服务。两种用法：
 * 1) 独立跑：node tools/collect.js [端口]   → http://127.0.0.1:8787/
 * 2) 被 serve.js 挂载：require('./collect.js').createHandler()  → 游戏和收集同源
 *
 * 路由：
 *   POST /collect    {app, ver, batch:[...]} 或单个 event → 追加 data/events.jsonl
 *   GET  /stats      聚合 JSON
 *   GET  /dashboard  看板页面
 */
var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var DEFAULT_FILE = path.join(ROOT, 'data', 'events.jsonl');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}
function json(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function createHandler(opt) {
  opt = opt || {};
  var file = opt.file || DEFAULT_FILE;
  var dataDir = path.dirname(file);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // 去重：客户端是「至少一次」语义（网络失败会重发），用 eid 兜底
  var seen = {};
  (function loadSeen() {
    if (!fs.existsSync(file)) return;
    fs.readFileSync(file, 'utf8').split('\n').forEach(function (l) {
      if (!l.trim()) return;
      try { var e = JSON.parse(l); if (e && e.eid) seen[e.eid] = 1; } catch (err) { }
    });
  })();

  return function (req, res) {
    var u = (req.url || '/').split('?')[0];

    if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

    if (req.method === 'GET' && u === '/dashboard') {
      fs.readFile(path.join(__dirname, 'dashboard.html'), function (err, buf) {
        if (err) return json(res, 500, { ok: false, error: 'dashboard.html missing' });
        cors(res);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(buf);
      });
      return;
    }

    if (req.method === 'GET' && u === '/stats') {
      try { return json(res, 200, require('./report.js').aggregate(file)); }
      catch (e) { return json(res, 500, { ok: false, error: String(e && e.message) }); }
    }

    if (req.method === 'POST' && u === '/collect') {
      var chunks = [], size = 0;
      req.on('data', function (c) {
        size += c.length;
        if (size > 2 * 1024 * 1024) { req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', function () {
        var body = Buffer.concat(chunks).toString('utf8');
        var list = [];
        try {
          var o = JSON.parse(body);
          if (Array.isArray(o)) list = o;
          else if (o && Array.isArray(o.batch)) list = o.batch;
          else if (o && o.ev) list = [o];
        } catch (e) { return json(res, 400, { ok: false, error: 'bad json' }); }
        if (!list.length) return json(res, 200, { ok: true, n: 0 });

        var fresh = [];
        list.forEach(function (e) {
          if (!e || !e.ev) return;
          if (e.eid && seen[e.eid]) return;
          if (e.eid) seen[e.eid] = 1;
          fresh.push(e);
        });
        if (!fresh.length) return json(res, 200, { ok: true, n: 0, dup: list.length });

        var lines = fresh.map(function (e) { return JSON.stringify(e); }).join('\n') + '\n';
        fs.appendFile(file, lines, function (err) {
          if (err) return json(res, 500, { ok: false, error: String(err.message) });
          console.log(new Date().toISOString() + '  +' + fresh.length + ' events');
          json(res, 200, { ok: true, n: fresh.length });
        });
      });
      return;
    }

    json(res, 404, { ok: false, path: u });
  };
}

module.exports = { createHandler: createHandler, DEFAULT_FILE: DEFAULT_FILE };

// 独立运行
if (require.main === module) {
  var port = parseInt(process.argv[2] || process.env.PORT || 8787, 10);
  var handler = createHandler();
  http.createServer(function (req, res) {
    var u = (req.url || '/').split('?')[0];
    if (req.method === 'GET' && u === '/') { res.writeHead(302, { Location: '/dashboard' }); return res.end(); }
    handler(req, res);
  }).listen(port, '0.0.0.0', function () {
    console.log('collector  http://127.0.0.1:' + port + '/collect');
    console.log('dashboard  http://127.0.0.1:' + port + '/dashboard');
    console.log('data       ' + DEFAULT_FILE);
  });
}
