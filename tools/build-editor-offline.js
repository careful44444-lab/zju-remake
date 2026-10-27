/* 打包「离线文案编辑器」：单文件 HTML，双击即用，不需要服务器 / 不需要 Node
 *
 *   node tools/build-editor-offline.js
 *   → dist/文案编辑器.html
 *
 * 原理：复用 tools/editor.html 的界面，但把它的网络请求换成内置数据 + 本地导出。
 */
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var C = require('../game/config.js');
var CONTENT = require('../game/content.js').CONTENT;
var EVENTS = require('../game/events.js').EVENTS;

var DIMS = C.DIMS.map(function (d) { return { id: d.id, name: d.name, sub: d.sub }; });
var TIERS = C.TIERS;
var ITEMS = C.ITEMS;

// ---- 服务端 /content-edit 返回的形状 ----
function serverShape() {
  return {
    ok: true,
    content: JSON.parse(JSON.stringify(CONTENT)),
    events: JSON.parse(JSON.stringify(EVENTS)),
    achievements: JSON.parse(JSON.stringify(C.ACHIEVEMENTS)),
    titles: JSON.parse(JSON.stringify(C.TITLES)),
    dims: DIMS,
    tiers: TIERS,
    items: ITEMS
  };
}

// ---- 导出的扁平格式（跟 data/content-edit.json 一致，可直接给游戏用）----
function flatOf(shape) {
  var out = {};
  Object.keys(shape.content).forEach(function (k) {
    out[k] = {
      tiers: shape.content[k].tiers.map(function (t) { return { title: t.title, desc: t.desc, tags: t.tags }; }),
      caps: shape.content[k].caps.map(function (c) { return { name: c.name, desc: c.desc }; })
    };
  });
  out.__achievements = shape.achievements;
  out.__titles = shape.titles;
  out.__events = shape.events.map(function (e) {
    return { id: e.id, title: e.title, text: e.text, options: e.options };
  });
  return out;
}

var BASE = serverShape();
var BASE_FLAT = flatOf(BASE);

var boot = [
  '<script>',
  'window.__IS_OFFLINE_EDITOR__ = true;',
  'window.__BASE_FLAT__ = ' + JSON.stringify(BASE_FLAT) + ';',
  'window.__EDITOR_DATA__ = ' + JSON.stringify(BASE) + ';',
  '',
  '// 屏蔽 file:// 下会报错的历史 API，以及所有网络请求',
  'try { history.replaceState = function () {}; } catch (e) { }',
  'window.fetch = function (url, opts) {',
  '  var u = String(url || "");',
  '  if (u.indexOf("/content-edit") >= 0) {',
  '    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(window.__EDITOR_DATA__); } });',
  '  }',
  '  if (u.indexOf("/api/content") >= 0) {',
  '    var body = {};',
  '    try { body = JSON.parse((opts && opts.body) || "{}"); } catch (e) { }',
  '    if (body.reset) {',
  '      // 「导出改动清单」走这条',
  '      download("文案改动清单-" + stamp() + ".md", buildDiffMd(), "text/markdown");',
  '      return Promise.resolve({ json: function () { return Promise.resolve({ ok: true, msg: "已下载改动清单" }); } });',
  '    }',
  '    download("文案修改-" + stamp() + ".json", JSON.stringify(body.data || {}, null, 2), "application/json");',
  '    return Promise.resolve({ json: function () { return Promise.resolve({ ok: true, msg: "已下载修改文件" }); } });',
  '  }',
  '  return Promise.resolve({ ok: false, json: function () { return Promise.resolve({}); } });',
  '};',
  '',
  'function stamp() {',
  '  var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };',
  '  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());',
  '}',
  '',
  'function download(name, text, mime) {',
  '  try {',
  '    var head = (mime.indexOf("markdown") >= 0) ? "\\ufeff" : "";',
  '    var blob = new Blob([head + text], { type: mime + ";charset=utf-8" });',
  '    var a = document.createElement("a");',
  '    a.href = URL.createObjectURL(blob);',
  '    a.download = name;',
  '    document.body.appendChild(a);',
  '    a.click();',
  '    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);',
  '  } catch (e) {',
  '    alert("下载失败：" + e.message + "\\n可以把下面的内容复制出来发给我");',
  '  }',
  '}',
  '',
  '// 当前草稿 → 扁平格式（编辑器内部 buildPayload 的镜像）',
  'function currentFlat() {',
  '  var out = JSON.parse(JSON.stringify(window.__BASE_FLAT__));',
  '  // 从 DOM 读当前值太重，直接读编辑器保存到 window 的引用（见下方 hook）',
  '  if (window.__CURRENT_FLAT__) return window.__CURRENT_FLAT__;',
  '  return out;',
  '}',
  '',
  'function buildDiffMd() {',
  '  var base = window.__BASE_FLAT__, cur = window.__CURRENT_FLAT__ || base;',
  '  var lines = ["# 文案改动清单", "", "生成时间：" + new Date().toLocaleString("zh-CN"), ""];',
  '  var n = 0;',
  '  var dimName = {};',
  '  (window.__EDITOR_DATA__.dims || []).forEach(function (d) { dimName[d.id] = d.name; });',
  '',
  '  Object.keys(base).forEach(function (k) {',
  '    if (k.indexOf("__") === 0) return;',
  '    var b = base[k], c = cur[k];',
  '    if (!c) return;',
  '    b.tiers.forEach(function (t, i) {',
  '      var t2 = c.tiers[i] || {};',
  '      var head = "## " + (dimName[k] || k) + " · T" + (i + 1) + " " + (t.title || "");',
  '      var chunk = [];',
  '      if ((t.title || "") !== (t2.title || "")) chunk.push("- 标题：`" + (t.title || "") + "` → **" + (t2.title || "") + "**");',
  '      if ((t.desc || "") !== (t2.desc || "")) chunk.push("- 描述：\\n  - 原：" + (t.desc || "") + "\\n  - 新：" + (t2.desc || ""));',
  '      var tg = (t.tags || []).join(" / "), tg2 = (t2.tags || []).join(" / ");',
  '      if (tg !== tg2) chunk.push("- 标签：" + tg + " → " + tg2);',
  '      if (chunk.length) { lines.push(head, ""); lines = lines.concat(chunk); lines.push(""); n++; }',
  '    });',
  '    (b.caps || []).forEach(function (cp, i) {',
  '      var c2 = (c.caps || [])[i] || {};',
  '      if ((cp.name || "") !== (c2.name || "") || (cp.desc || "") !== (c2.desc || "")) {',
  '        lines.push("## " + (dimName[k] || k) + " · 封神专精 " + (i + 1), "");',
  '        if ((cp.name || "") !== (c2.name || "")) lines.push("- 名称：`" + cp.name + "` → **" + c2.name + "**");',
  '        if ((cp.desc || "") !== (c2.desc || "")) lines.push("- 描述：" + cp.desc + " → " + c2.desc);',
  '        lines.push(""); n++;',
  '      }',
  '    });',
  '  });',
  '',
  '  (base.__events || []).forEach(function (be, i) {',
  '    var ce = (cur.__events || [])[i] || {};',
  '    var chunk = [];',
  '    if ((be.title || "") !== (ce.title || "")) chunk.push("- 标题：`" + be.title + "` → **" + ce.title + "**");',
  '    if ((be.text || "") !== (ce.text || "")) chunk.push("- 正文：\\n  - 原：" + be.text + "\\n  - 新：" + ce.text);',
  '    (be.options || []).forEach(function (o, j) {',
  '      var o2 = (ce.options || [])[j] || {};',
  '      if ((o.label || "") !== (o2.label || "")) chunk.push("- 选项 " + (j + 1) + "：`" + o.label + "` → **" + o2.label + "**");',
  '      if ((o.result || "") !== (o2.result || "")) chunk.push("- 选项 " + (j + 1) + " 结果：\\n  - 原：" + (o.result || "") + "\\n  - 新：" + (o2.result || ""));',
  '    });',
  '    if (chunk.length) { lines.push("## 事件卡 · " + (be.title || be.id), ""); lines = lines.concat(chunk); lines.push(""); n++; }',
  '  });',
  '',
  '  if (!n) lines.push("（没有检测到改动）");',
  '  return lines.join("\\n");',
  '}',
  '</script>'
].join('\n');

// ---- 组装 ----
var html = fs.readFileSync(path.join(__dirname, 'editor.html'), 'utf8');

html = html
  .replace('<title>文案编辑</title>', '<title>文案编辑（离线版）</title>')
  .replace('<body>', '<body>\n' + boot)
  .replace('<button id="btnSave" class="primary">保存</button>', '<button id="btnSave" class="primary">导出修改</button>')
  .replace('<button id="btnReset">全部还原</button>', '<button id="btnReset">导出改动清单</button>')
  .replace('  <button onclick="window.open(\'/h5/\',\'_blank\')">打开游戏</button>\n', '')
  .replace('<span class="sub" id="stat">修改会存到 data/content-edit.json，游戏刷新即生效</span>',
    '<span class="sub" id="stat">离线版 · 改完点「导出修改」，把下载的文件发回给负责人</span>');

// 让编辑器每次交互后把当前草稿暴露给 diff
html = html.replace('load().catch(function(e){',
  'window.__hookDraft = function(){ try { window.__CURRENT_FLAT__ = buildPayload(); } catch(e){} };\n' +
  'document.addEventListener("input", window.__hookDraft, true);\n' +
  'document.addEventListener("change", window.__hookDraft, true);\n' +
  'setTimeout(window.__hookDraft, 800);\n\n' +
  'load().catch(function(e){');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
var out = path.join(root, 'dist', '文案编辑器.html');
fs.writeFileSync(out, html, 'utf8');

var kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('打包完成：' + out + '  (' + kb + ' KB)');
console.log('发给成员：双击用浏览器打开 → 改 → 点「导出修改」→ 把下载的 .json 发回来');
console.log('另一份「导出改动清单」是给人看的 Markdown，方便先自己过一遍');
