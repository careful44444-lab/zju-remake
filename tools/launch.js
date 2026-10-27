/* 内测启动器：一个窗口里同时跑「游戏服务」和「公网隧道」，然后自动打开浏览器。
 * 不用记命令，双击 内测启动.bat 就会执行到这里。 */
var path = require('path');
var http = require('http');
var spawn = require('child_process').spawn;

var root = path.join(__dirname, '..');
var PORT = 8123;
var nodeExe = process.execPath;

function line(s) { console.log(s); }

line('');
line('  ╔══════════════════════════════════════════════╗');
line('  ║   紫金港改造计划 · 内测模式                  ║');
line('  ╚══════════════════════════════════════════════╝');
line('');
line('  本机游戏    http://127.0.0.1:' + PORT + '/play');
line('  数据看板    http://127.0.0.1:' + PORT + '/dashboard');
line('  公网地址    稍等几秒，下面会出现');
line('');
line('  ──────────────────────────────────────────────');
line('   这个窗口不要关。关掉它 = 内测结束。');
line('  ──────────────────────────────────────────────');
line('');

// 端口已被占用就不重复启动，避免 EADDRINUSE 报错吓到人
function portBusy(cb) {
  var req = http.get({ host: '127.0.0.1', port: PORT, path: '/h5/', timeout: 800 }, function (r) {
    r.resume(); cb(true);
  });
  req.on('error', function () { cb(false); });
  req.on('timeout', function () { req.destroy(); cb(false); });
}

var serve = null;
portBusy(function (busy) {
  if (busy) {
    line('  （游戏服务已经在跑了，跳过启动）');
  } else {
    serve = spawn(nodeExe, [path.join(root, 'tools', 'serve.js'), String(PORT)], {
      cwd: root, stdio: 'inherit'
    });
  }

  setTimeout(function () {
    var tunnel = spawn(nodeExe, [path.join(root, 'tools', 'tunnel.js'), String(PORT)], {
      cwd: root, stdio: 'inherit'
    });

    setTimeout(function () {
      if (process.env.NO_OPEN) return;
      try {
        spawn('cmd', ['/c', 'start', '', 'http://127.0.0.1:' + PORT + '/play'], {
          detached: true, stdio: 'ignore'
        }).unref();
      } catch (e) { }
    }, 4500);

    process.on('SIGINT', function () {
      line('');
      line('  正在关闭…');
      try { tunnel.kill(); } catch (e) { }
      if (serve) { try { serve.kill(); } catch (e) { } }
      process.exit(0);
    });
  }, 1200);
});
