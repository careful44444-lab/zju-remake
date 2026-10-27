/* 把本地服务暴露到公网，拿到一个 https 链接发给人。
 * 原理：Cloudflare 的 quick tunnel，不需要账号、不需要域名、不需要路由器设置。
 *
 * 用法：
 *   node tools/tunnel.js                  # 默认转发 http://127.0.0.1:8123
 *   node tools/tunnel.js 8123
 *   node tools/tunnel.js --download       # 没装 cloudflared 时自动下载到 tools/bin/
 *
 * 注意：quick tunnel 每次重启都会换一个新域名，链接有效期 = 这个进程开着的时间。
 */
var fs = require('fs');
var path = require('path');
var https = require('https');
var { spawn, spawnSync } = require('child_process');

var port = 8123;
var wantDownload = false;
process.argv.slice(2).forEach(function (a) {
  if (a === '--download') wantDownload = true;
  else if (/^\d+$/.test(a)) port = parseInt(a, 10);
});

var binDir = path.join(__dirname, 'bin');
var exePath = path.join(binDir, 'cloudflared.exe');

function which(cmd) {
  var r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout) return r.stdout.split(/\r?\n/)[0].trim();
  return null;
}

function findCloudflared() {
  if (process.platform === 'win32' && fs.existsSync(exePath)) return exePath;
  return which('cloudflared');
}

function download(cb) {
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
  var url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
  console.log('正在下载 cloudflared（约 40MB）…');

  var got = 0, lastPct = -1;
  var file = fs.createWriteStream(exePath);
  file.on('error', cb);

  function follow(u, depth) {
    if (depth > 6) return cb(new Error('重定向太多'));
    https.get(u, { headers: { 'User-Agent': 'zju-remake' } }, function (res) {
      // GitHub 的 release 下载会 302 到 objects.githubusercontent.com，必须继续跟
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return follow(res.headers.location, depth + 1);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return cb(new Error('HTTP ' + res.statusCode));
      }
      var total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', function (c) {
        got += c.length;
        var pct = total ? Math.floor(got / total * 100) : 0;
        if (pct !== lastPct && (pct % 10 === 0 || pct === 100)) {
          lastPct = pct;
          process.stdout.write('\r  下载中 ' + pct + '%   ');
        }
      });
      res.on('error', cb);
      res.pipe(file);
      file.on('finish', function () {
        file.close(function () {
          process.stdout.write('\r  下载完成      \n');
          cb(null);
        });
      });
    }).on('error', cb);
  }
  follow(url, 0);
}

// 读取固定隧道的配置（后台「公网地址」页填的 token + 域名）
function loadCfg() {
  try {
    var f = path.join(__dirname, "..", "data", "tunnel.json");
    var j = JSON.parse(fs.readFileSync(f, "utf8"));
    if (j && j.token) return j;
  } catch (e) { }
  if (process.env.CLOUDFLARE_TUNNEL_TOKEN) {
    return { token: process.env.CLOUDFLARE_TUNNEL_TOKEN, hostname: process.env.CLOUDFLARE_TUNNEL_HOST || "" };
  }
  return null;
}

// 固定域名模式：cloudflared tunnel run --token xxx
function startNamed(exe, cfg) {
  var host = (cfg.hostname || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  console.log("启动固定隧道 →  " + (host ? "https://" + host : "(域名未填)"));
  var child = spawn(exe, ["tunnel", "--no-autoupdate", "run", "--token", cfg.token], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    var dataDir = path.join(__dirname, "..", "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    var base = host ? "https://" + host : "";
    fs.writeFileSync(path.join(dataDir, "tunnel.json"), JSON.stringify({
      token: cfg.token,
      hostname: host,
      fixed: true,
      url: base,
      play: base ? base + "/play" : "",
      dashboard: base ? base + "/dashboard" : "",
      at: new Date().toISOString(),
      pid: process.pid,
      childPid: child.pid
    }, null, 2));
  } catch (e) { }

  console.log("");
  console.log("  ┌─────────────────────────────────────────────");
  console.log("  │  固定地址：" + (host ? base + "/play" : "（先去后台填域名）"));
  console.log("  │  这个地址以后不会变了。");
  console.log("  └─────────────────────────────────────────────");
  console.log("");

  function relay(b) { process.stdout.write(b); }
  child.stdout.on("data", relay);
  child.stderr.on("data", relay);
  child.on("exit", function (c) { console.log("隧道退出：" + c); process.exit(c || 0); });
  process.on("SIGINT", function () { child.kill(); process.exit(0); });
}

function start(exe) {
  console.log('启动隧道：' + exe + '  →  http://127.0.0.1:' + port);
  var child = spawn(exe, ['tunnel', '--url', 'http://127.0.0.1:' + port, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  var printed = false;
  function scan(buf) {
    var s = buf.toString();
    var m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !printed) {
      printed = true;
      var base = m[0];

      // 落盘：终端关掉了也能从这里找回来（serve.js 的 /url 会读这个文件）
      try {
        var dataDir = path.join(__dirname, '..', 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(path.join(dataDir, 'tunnel.json'), JSON.stringify({
          url: base,
          play: base + '/play',
          dashboard: base + '/dashboard',
          at: new Date().toISOString(),
          pid: process.pid,
          childPid: child.pid
        }, null, 2));
      } catch (e) { }

      console.log('');
      console.log('  ┌─────────────────────────────────────────────');
      console.log('  │  公网地址已就绪：');
      console.log('  │  ' + base + '/play');
      console.log('  │');
      console.log('  │  发给别人这条 → 他玩，数据进你的 data/events.jsonl');
      console.log('  │  地址忘了？    → http://127.0.0.1:' + port + '/url');
      console.log('  └─────────────────────────────────────────────');
      console.log('');
    }
    if (!printed && /error|failed/i.test(s)) process.stdout.write(s);
  }
  child.stdout.on('data', scan);
  child.stderr.on('data', scan);
  child.on('exit', function (c) { console.log('隧道退出：' + c); process.exit(c || 0); });
  process.on('SIGINT', function () { child.kill(); process.exit(0); });
}

var exe = findCloudflared();
if (!exe && wantDownload) {
  download(function (err) {
    if (err) { console.error('下载失败：' + err.message); process.exit(1); }
    start(exePath);
  });
} else if (!exe) {
  console.log('');
  console.log('没找到 cloudflared。三选一：');
  console.log('  1) 自动下载（推荐）   node tools/tunnel.js --download');
  console.log('  2) winget 安装        winget install --id Cloudflare.cloudflared');
  console.log('  3) 手动下载           https://github.com/cloudflare/cloudflared/releases');
  console.log('');
  console.log('装好之后重新跑 node tools/tunnel.js 就行。');
  process.exit(1);
} else {
  var cfg = loadCfg();
  if (cfg) startNamed(exe, cfg); else start(exe);
}
