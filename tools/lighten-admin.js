/* 把后台页面（tools/*.html 与 serve.js 里的 /url 页）从深色转成浅色
 *   node tools/lighten-admin.js
 * 幂等：重复跑不会二次破坏（映射都是单向且结果值不在源值集合里）。
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

// 深色 → 浅色（长字符串在前，避免子串误伤）
var MAP = [
  // 背景层
  ['#0b0f14', '#f1f5f9'], ['#0a0d11', '#f1f5f9'], ['#0e1319', '#f8fafc'],
  ['#0f1318', '#f8fafc'], ['#141a21', '#ffffff'], ['#1b232c', '#ffffff'],
  ['#0f141a', '#ffffff'], ['#11161c', '#ffffff'], ['#16212b', '#eef2f7'],
  ['#18222c', '#eef2f7'], ['#1a222b', '#f1f5f9'], ['#0f1a24', '#ffffff'],
  ['#0b1218', '#f8fafc'],

  // 边框 / 分隔
  ['#232e39', '#e2e8f0'], ['#26313b', '#e2e8f0'], ['#2b3540', '#cbd5e1'],
  ['#1c242d', '#e2e8f0'], ['#222b34', '#e2e8f0'], ['#2c3742', '#cbd5e1'],
  ['#2a3744', '#e2e8f0'], ['#1e262f', '#e2e8f0'],

  // 正文 / 次级文字
  ['#e8eef5', '#0f172a'], ['#e9eff6', '#0f172a'], ['#f2f7fb', '#0f172a'],
  ['#cfdae4', '#334155'], ['#cfe0ea', '#334155'], ['#c7d3de', '#334155'],
  ['#a9b8c6', '#475569'], ['#9fb0bf', '#475569'], ['#b9c7d3', '#475569'],
  ['#8294a3', '#64748b'], ['#8b9aa8', '#64748b'], ['#8fa3b4', '#64748b'],
  ['#7f8e9c', '#64748b'], ['#6c7a88', '#94a3b8'], ['#72808c', '#94a3b8'],
  ['#5d6a77', '#94a3b8'], ['#6a7784', '#94a3b8'], ['#7b8896', '#94a3b8'],

  // 强调色
  ['#ffe08a', '#d97706'], ['#ffd76a', '#d97706'], ['#ffb347', '#ea580c'],
  ['#6fe0bd', '#059669'], ['#9ef0d5', '#047857'],
  ['#ff8d7e', '#e11d48'], ['#ffb3a8', '#be123c'], ['#ff7a6b', '#e11d48'],

  // 半透明层
  ['rgba(255,255,255,.012)', 'rgba(15,23,42,.02)'],
  ['rgba(255,255,255,.02)', 'rgba(15,23,42,.02)'],
  ['rgba(255,255,255,.03)', 'rgba(15,23,42,.03)'],
  ['rgba(255,255,255,.04)', 'rgba(15,23,42,.04)'],
  ['rgba(255,255,255,.05)', 'rgba(15,23,42,.04)'],
  ['rgba(255,255,255,.06)', 'rgba(15,23,42,.05)'],
  ['rgba(255,255,255,.08)', 'rgba(15,23,42,.06)'],
  ['rgba(255,255,255,.09)', 'rgba(15,23,42,.08)'],
  ['rgba(255,255,255,.1)', 'rgba(15,23,42,.06)'],
  ['rgba(255,255,255,.12)', 'rgba(15,23,42,.07)'],
  ['rgba(0,0,0,.12)', 'rgba(15,23,42,.03)'],
  ['rgba(0,0,0,.18)', 'rgba(15,23,42,.03)'],
  ['rgba(0,0,0,.2)', 'rgba(15,23,42,.04)'],
  ['rgba(0,0,0,.25)', 'rgba(15,23,42,.04)'],
  ['rgba(0,0,0,.3)', 'rgba(15,23,42,.05)'],
  ['rgba(0,0,0,.32)', 'rgba(15,23,42,.05)'],
  ['rgba(0,0,0,.35)', 'rgba(15,23,42,.06)'],
  ['rgba(0,0,0,.4)', 'rgba(15,23,42,.07)'],
  ['rgba(0,0,0,.45)', 'rgba(15,23,42,.08)'],
  ['rgba(20,26,33,.95)', '#ffffff'],
  ['rgba(20,26,33,.96)', '#ffffff'],
  ['rgba(11,15,20,.96)', '#ffffff'],
  ['rgba(20,26,33,.9)', '#ffffff'],

  // 带主题色的半透明
  ['rgba(255,215,106,', 'rgba(217,119,6,'],
  ['rgba(111,224,189,', 'rgba(5,150,105,'],
  ['rgba(255,141,126,', 'rgba(225,29,72,'],
  ['rgba(255,171,71,', 'rgba(217,119,6,']
];

function mapText(s) {
  for (var i = 0; i < MAP.length; i++) s = s.split(MAP[i][0]).join(MAP[i][1]);
  return s;
}

var files = [
  'tools/dashboard.html', 'tools/runs.html', 'tools/grades.html',
  'tools/backups.html', 'tools/settings.html', 'tools/editor.html',
  'tools/admin.html', 'tools/serve.js'
];

var total = 0;
files.forEach(function (rel) {
  var p = path.join(root, rel);
  if (!fs.existsSync(p)) { console.log('  跳过（不存在）: ' + rel); return; }
  var before = fs.readFileSync(p, 'utf8');
  var after = mapText(before);
  if (after !== before) {
    fs.writeFileSync(p, after, 'utf8');
    var diff = 0;
    var a = before.split('\n'), b = after.split('\n');
    for (var i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diff++;
    total += diff;
    console.log('  改写 ' + rel + '  (' + diff + ' 行)');
  } else {
    console.log('  无变化 ' + rel);
  }
});
console.log('合计 ' + total + ' 行');
