/* 打包「离线问卷编辑器」：单文件 HTML，双击即用，不需要服务器 / 不需要 Node
 *
 *   node tools/build-survey-offline.js
 *   → dist/问卷编辑器.html
 *
 * 原理：复用 tools/survey.html 的界面，把它的网络请求换成「内置题库 + 本地导出」。
 * 组员改完点「导出 JSON」，把文件发回来即可。
 */
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var SURVEY = { intro: '', outro: '', questions: [] };
try {
  SURVEY = JSON.parse(fs.readFileSync(path.join(root, 'data', 'survey.json'), 'utf8'));
} catch (e) {
  console.error('读不到 data/survey.json，先用默认空题库');
}

var html = fs.readFileSync(path.join(__dirname, 'survey.html'), 'utf8');

// ---- 注入：内置题库 + 屏蔽网络 + 导出 ----
var boot = [
  '<script>',
  'window.__IS_OFFLINE_SURVEY__ = true;',
  'window.__SURVEY_BASE__ = ' + JSON.stringify(SURVEY) + ';',
  '',
  '// 离线时把「保存」变成「导出」：所有网络请求都拦下来',
  'window.fetch = function (url, opts) {',
  '  var u = String(url || "");',
  '  if (u.indexOf("/api/survey") >= 0) {',
  '    if (opts && opts.method === "POST") {',
  '      var body = {};',
  '      try { body = JSON.parse(opts.body || "{}"); } catch (e) { }',
  '      window.__CURRENT__ = body;',
  '      download("问卷-" + stamp() + ".json", JSON.stringify(body, null, 2));',
  '      return Promise.resolve({ ok: true, json: function () {',
  '        return Promise.resolve({ ok: true, msg: "已导出，把这个文件发回给项目负责人" });',
  '      } });',
  '    }',
  '    var cur = window.__CURRENT__ || window.__SURVEY_BASE__;',
  '    return Promise.resolve({ ok: true, json: function () {',
  '      return Promise.resolve(JSON.parse(JSON.stringify(cur)));',
  '    } });',
  '  }',
  '  return Promise.resolve({ ok: false, json: function () { return Promise.resolve({}); } });',
  '};',
  '',
  'function stamp() {',
  '  var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };',
  '  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());',
  '}',
  '',
  'function download(name, text) {',
  '  try {',
  '    var blob = new Blob([text], { type: "application/json;charset=utf-8" });',
  '    var a = document.createElement("a");',
  '    a.href = URL.createObjectURL(blob);',
  '    a.download = name;',
  '    document.body.appendChild(a);',
  '    a.click();',
  '    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);',
  '  } catch (e) { alert("下载失败：" + e.message); }',
  '}',
  '',
  '// 离线版没有服务器，把「← 后台」藏掉，并改一下顶部说明',
  'document.addEventListener("DOMContentLoaded", function () {',
  '  var back = document.querySelector(\'button[onclick*="/admin"]\');',
  '  if (back) back.style.display = "none";',
  '  var sub = document.querySelector(".sub");',
  '  if (sub) sub.textContent = "离线版 · 改完点「导出 JSON」，把文件发回给项目负责人";',
  '  var s1 = document.getElementById("btnSave"), s2 = document.getElementById("btnSave2");',
  '  if (s1) s1.textContent = "保存并导出";',
  '  if (s2) s2.textContent = "保存并导出";',
  '});',
  '</script>'
].join('\n');

html = html.replace('</head>', boot + '\n</head>');

var out = path.join(root, 'dist', '问卷编辑器.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html, 'utf8');

var kb = Math.round(Buffer.byteLength(html) / 1024);
console.log('打包完成：' + out + '  (' + kb + ' KB, ' + (SURVEY.questions || []).length + ' 题)');
