/**
 * 生成离线版数据看板：dist/数据看板.html
 *
 * 特点：
 *   - 单文件，双击即可看，不依赖服务器
 *   - 含全部对局记录 + 每个成就的达成条件 + 按初始条件（参数版本）筛选
 *
 * 用法：node tools/build-dashboard-offline.js
 */
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, 'dist', '数据看板.html');

/* ---------------- 1. 读数据 ---------------- */

var C = require(path.join(ROOT, 'game', 'config.js'));
var runsMod = require(path.join(ROOT, 'tools', 'runs.js'));

var DIMS = (C.DIMS || []).map(function (d) { return [d.id, d.name]; });
var TIERS = (C.TIERS || []).map(function (t) { return t.name; });
var DIM_NAME = {};
DIMS.forEach(function (p) { DIM_NAME[p[0]] = p[1]; });

var GRADE_NAME = {};
(C.GRADES || []).forEach(function (g) { GRADE_NAME[g.id] = g.name; });

function readJSON(p, dflt) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return dflt; }
}

// 成就：config 里的作为底子，content-edit 里改过的覆盖
var ce = readJSON(path.join(ROOT, 'data', 'content-edit.json'), {});
var baseAch = (C.ACHIEVEMENTS || []).map(function (a) {
  return { id: a.id, name: a.name, desc: a.desc || '', cond: a.cond || [] };
});
var ovAch = ce.__achievements;
if (ovAch && !Array.isArray(ovAch)) {
  ovAch = Object.keys(ovAch).sort(function (a, b) { return a - b; }).map(function (k) { return ovAch[k]; });
}
if (Array.isArray(ovAch)) {
  ovAch.forEach(function (o) {
    if (!o || !o.id) return;
    var hit = null;
    for (var i = 0; i < baseAch.length; i++) { if (baseAch[i].id === o.id) { hit = baseAch[i]; break; } }
    if (hit) {
      if (o.name) hit.name = o.name;
      if (o.desc) hit.desc = o.desc;
      if (o.cond && o.cond.length) hit.cond = o.cond;
    } else {
      baseAch.push({ id: o.id, name: o.name || o.id, desc: o.desc || '', cond: o.cond || [] });
    }
  });
}

// 把条件翻译成人话
function dimName(id) { return DIM_NAME[id] || id; }
function tierName(n) { return 'T' + n + (TIERS[n - 1] ? ' ' + TIERS[n - 1] : ''); }

function condText(cond) {
  if (!cond || !cond.length) return '无（必定达成）';
  return cond.map(function (c) {
    var of = c.of;
    var who = (of === '*' || !of) ? '六项' : (Array.isArray(of) ? of.map(dimName).join(' 和 ') : dimName(of));
    if (c.t === 'every') {
      if (c.min != null && c.max != null) return who + ' 都在 ' + tierName(c.min) + ' ~ ' + tierName(c.max);
      if (c.min != null) return who + ' 都 ≥ ' + tierName(c.min);
      if (c.max != null) return who + ' 都 ≤ ' + tierName(c.max);
      return who + ' 满足条件';
    }
    if (c.t === 'count') {
      var n = c.n || 1;
      if (c.min != null && c.max != null) return who + ' 中至少 ' + n + ' 项在 ' + tierName(c.min) + ' ~ ' + tierName(c.max);
      if (c.min != null) return who + ' 中至少 ' + n + ' 项 ≥ ' + tierName(c.min);
      if (c.max != null) return who + ' 中至少 ' + n + ' 项 ≤ ' + tierName(c.max);
      return who + ' 中至少 ' + n + ' 项满足条件';
    }
    if (c.t === 'top') {
      return who + ' 是所有维度中唯一最高的';
    }
    return JSON.stringify(c);
  }).join('，且 ');
}

var ACH = baseAch.map(function (a) {
  return { id: a.id, name: a.name, desc: a.desc, condText: condText(a.cond), cond: a.cond };
});
var ACH_NAME = {};
ACH.forEach(function (a) { ACH_NAME[a.id] = a.name; });

// 对局
var list = runsMod.listRuns() || [];

var RUNS = list.map(function (r) {
  var ach = (r.achievements || []).map(function (id) { return { id: id, name: ACH_NAME[id] || id }; });
  var tiers = r.tiers || {};
  var sum = 0;
  DIMS.forEach(function (p) { sum += (tiers[p[0]] || 0); });
  return {
    rid: r.rid,
    ts: r.ts,
    year: r.year || '',
    grade: GRADE_NAME[r.year] || r.year || '',
    finished: !!r.finished,
    excluded: !!r.excluded,
    title: r.title || '',
    ach: ach,
    achIds: (r.achievements || []),
    tiers: DIMS.map(function (p) { return tiers[p[0]] || 0; }),
    tierSum: sum,
    dur: r.durationMs || 0,
    cfg: r.cfgLabel || '',
    note: r.note || '',
    flags: r.flags || []
  };
}).sort(function (a, b) { return b.ts - a.ts; });

var CFGS = [];
RUNS.forEach(function (r) {
  if (r.cfg && CFGS.indexOf(r.cfg) < 0) CFGS.push(r.cfg);
});
CFGS.sort();

var DATA = {
  builtAt: new Date().toISOString(),
  dims: DIMS,
  tiers: TIERS,
  ach: ACH,
  runs: RUNS,
  cfgs: CFGS,
  total: RUNS.length
};

/* ---------------- 2. 页面 ---------------- */

var json = JSON.stringify(DATA).replace(/</g, '\\u003c');

var CSS = [
  '*{box-sizing:border-box}',
  'body{margin:0;background:#f7f8fa;color:#0f172a;',
  'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;',
  '-webkit-font-smoothing:antialiased;line-height:1.5}',
  '.wrap{max-width:1180px;margin:0 auto;padding:26px 20px 60px}',
  'h1{margin:0 0 4px;font-size:22px;letter-spacing:-.01em}',
  '.sub{margin:0 0 20px;color:#64748b;font-size:13px}',
  '.card{background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:16px;',
  'box-shadow:0 6px 22px rgba(15,23,42,.04);padding:18px 20px;margin-bottom:16px}',
  '.card h2{margin:0 0 3px;font-size:15px}',
  '.card .hint{margin:0 0 14px;color:#94a3b8;font-size:12px}',
  '.stats{display:flex;flex-wrap:wrap;gap:26px}',
  '.stat b{display:block;font-size:24px;font-weight:700;letter-spacing:-.02em}',
  '.stat span{color:#64748b;font-size:12px}',
  '.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}',
  'select,input{font:inherit;font-size:13px;padding:8px 10px;border-radius:10px;',
  'border:1px solid rgba(15,23,42,.14);background:#fff;color:#0f172a;outline:none}',
  'select:focus,input:focus{border-color:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.14)}',
  '.grow{flex:1;min-width:160px}',
  '.chip{display:inline-block;padding:2px 8px;border-radius:999px;background:#f1f5f9;',
  'color:#475569;font-size:11px;margin-right:5px;white-space:nowrap}',
  '.chip.ok{background:#ecfdf5;color:#047857}',
  '.chip.warn{background:#fef2f2;color:#b91c1c}',
  'table{width:100%;border-collapse:collapse;font-size:13px}',
  'th{text-align:left;font-weight:600;color:#64748b;font-size:12px;padding:8px 6px;',
  'border-bottom:1px solid rgba(15,23,42,.08);white-space:nowrap}',
  'td{padding:9px 6px;border-bottom:1px solid rgba(15,23,42,.05);vertical-align:middle}',
  'td.nw,th.nw{white-space:nowrap}',
  'table td:nth-child(1),table td:nth-child(2),table td:nth-child(3),table td:nth-child(4),table td:nth-child(7),table td:nth-child(8){white-space:nowrap}',
  'tr:hover td{background:#fcfcfd}',
  '.muted{color:#94a3b8}',
  '.pips{display:inline-flex;gap:2px}',
  '.pip{width:6px;height:12px;border-radius:2px;background:#e2e8f0}',
  '.pip.on{background:#f59e0b}',
  '.six{display:inline-flex;gap:9px;align-items:flex-end}',
  '.six i{display:flex;flex-direction:column;gap:2px}',
  '.six u{font-style:normal;font-size:10px;color:#94a3b8;text-decoration:none;text-align:center}',
  '.achgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}',
  '.ach{border:1px solid rgba(15,23,42,.07);border-radius:14px;padding:14px}',
  '.ach .nm{font-weight:600;font-size:14px;margin-bottom:2px}',
  '.ach .cd{font-size:12px;color:#475569;margin-bottom:8px}',
  '.ach .mt{font-size:11px;color:#94a3b8}',
  '.ach .runs{margin-top:8px;border-top:1px dashed rgba(15,23,42,.08);padding-top:8px;display:none}',
  '.ach.open .runs{display:block}',
  '.ach .runs div{font-size:11px;color:#64748b;padding:2px 0}',
  'details summary{cursor:pointer;color:#0ea5e9;font-size:12px}',
  '.empty{padding:26px 0;text-align:center;color:#94a3b8;font-size:13px}',
  '@media(max-width:720px){.six{display:none}}'
].join('\n');

var JS = [
  'var D = window.__D;',
  'var S = { cfg: "", grade: "", state: "all", q: "" };',
  '',
  'function $(id){ return document.getElementById(id); }',
  'function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){',
  '  return ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"})[c]; }); }',
  'function fmtTime(ts){ var d=new Date(ts); function p(n){return n<10?"0"+n:""+n;}',
  '  return p(d.getMonth()+1)+"/"+p(d.getDate())+" "+p(d.getHours())+":"+p(d.getMinutes()); }',
  'function fmtDur(ms){ if(!ms) return "—"; var s=Math.round(ms/1000);',
  '  if(s<60) return s+"s"; var m=Math.floor(s/60); return m+"m"+p2(s%60);',
  '  function p2(n){return n<10?"0"+n:""+n;} }',
  'function pips(v){ var h=""; for(var i=1;i<=5;i++) h += \'<s class="pip \'+(i<=v?"on":"")+\'"></s>\';',
  '  return \'<span class="pips">\'+h.replace(/<s /g,"<i ").replace(/<\\/s>/g,"</i>")+\'</span>\'; }',
  '',
  'function match(r){',
  '  if (S.cfg && r.cfg !== S.cfg) return false;',
  '  if (S.grade && r.year !== S.grade) return false;',
  '  if (S.state === "done" && !r.finished) return false;',
  '  if (S.state === "quit" && r.finished) return false;',
  '  if (S.state === "excluded" && !r.excluded) return false;',
  '  if (S.q) { var q = S.q.toLowerCase();',
  '    var hay = (r.rid + " " + r.title + " " + r.cfg + " " + r.ach.map(function(a){return a.name;}).join(" ")).toLowerCase();',
  '    if (hay.indexOf(q) < 0) return false; }',
  '  return true;',
  '}',
  '',
  'function renderStats(rows){',
  '  var n = rows.length;',
  '  var done = rows.filter(function(r){return r.finished;}).length;',
  '  var excl = rows.filter(function(r){return r.excluded;}).length;',
  '  var avgT = n ? (rows.reduce(function(s,r){return s+r.tierSum;},0)/n).toFixed(1) : "—";',
  '  var durs = rows.filter(function(r){return r.dur>0;}).map(function(r){return r.dur;}).sort(function(a,b){return a-b;});',
  '  var med = durs.length ? durs[Math.floor(durs.length/2)] : 0;',
  '  $("stats").innerHTML =',
  '    \'<div class="stat"><b>\'+n+\'</b><span>对局</span></div>\' +',
  '    \'<div class="stat"><b>\'+done+\'</b><span>已完成</span></div>\' +',
  '    \'<div class="stat"><b>\'+(n?Math.round(done/n*100):0)+\'%</b><span>完成率</span></div>\' +',
  '    \'<div class="stat"><b>\'+avgT+\'</b><span>平均档位和（满分 30）</span></div>\' +',
  '    \'<div class="stat"><b>\'+fmtDur(med)+\'</b><span>单局时长中位</span></div>\' +',
  '    \'<div class="stat"><b>\'+excl+\'</b><span>已排除</span></div>\';',
  '}',
  '',
  'function renderRuns(rows){',
  '  if (!rows.length) { $("runs").innerHTML = \'<div class="empty">没有符合条件的对局</div>\'; return; }',
  '  var h = [\'<table><thead><tr>\',',
  '    \'<th>时间</th><th>年级</th><th>状态</th><th>称号</th><th>成就</th>\' +',
  '    \'<th>六维</th><th>参数版本</th><th>时长</th></tr></thead><tbody>\'];',
  '  rows.forEach(function(r){',
  '    var st = r.excluded ? \'<span class="chip warn">已排除</span>\' :',
  '             (r.finished ? \'<span class="chip ok">完成</span>\' : \'<span class="chip">中途离开</span>\');',
  '    var ach = r.ach.length ? r.ach.map(function(a){ return \'<span class="chip" title="\'+esc(a.id)+\'">\'+esc(a.name)+\'</span>\'; }).join("")',
  '                              : \'<span class="muted">—</span>\';',
  '    var six = \'<span class="six">\' + r.tiers.map(function(v,i){',
  '      return \'<i>\'+pips(v)+\'<u>\'+esc(D.dims[i][1])+\'</u></i>\'; }).join("") + \'</span>\';',
  '    h.push(\'<tr>\',',
  '      \'<td class="muted">\'+fmtTime(r.ts)+\'</td>\',',
  '      \'<td>\'+esc(r.grade||"—")+\'</td>\',',
  '      \'<td>\'+st+\'</td>\',',
  '      \'<td>\'+(r.title?esc(r.title):\'<span class="muted">—</span>\')+\'</td>\',',
  '      \'<td>\'+ach+\'</td>\',',
  '      \'<td>\'+six+\'</td>\',',
  '      \'<td class="muted" style="font-size:11px">\'+(r.cfg?esc(r.cfg):"—")+\'</td>\',',
  '      \'<td class="muted">\'+fmtDur(r.dur)+\'</td>\',',
  '    \'</tr>\');',
  '  });',
  '  h.push(\'</tbody></table>\');',
  '  $("runs").innerHTML = h.join("");',
  '}',
  '',
  'function renderAch(rows){',
  '  var inRows = {};',
  '  rows.forEach(function(r){ (r.achIds||[]).forEach(function(id){ inRows[id] = (inRows[id]||0)+1; }); });',
  '  var h = [\'<div class="achgrid">\'];',
  '  D.ach.forEach(function(a, i){',
  '    var got = inRows[a.id] || 0;',
  '    var rate = rows.length ? Math.round(got/rows.length*100) : 0;',
  '    var who = rows.filter(function(r){ return (r.achIds||[]).indexOf(a.id) >= 0; });',
  '    h.push(\'<div class="ach" data-i="\'+i+\'">\');',
  '    h.push(\'<div class="nm">\'+esc(a.name)+\'</div>\');',
  '    h.push(\'<div class="cd">\'+esc(a.condText)+\'</div>\');',
  '    h.push(\'<div class="mt">达成 <b>\'+got+\'</b> 局 · \'+rate+\'%' + '\');',
  '    if (who.length) {',
  '      h.push(\' · <details><summary>看哪些局</summary>\');',
  '      who.slice(0, 12).forEach(function(r){ h.push(\'<div>\'+fmtTime(r.ts)+\'  \'+esc(r.title||r.rid)+\'</div>\'); });',
  '      if (who.length > 12) h.push(\'<div>…还有 \'+(who.length-12)+\' 局</div>\');',
  '      h.push(\'</details>\');',
  '    }',
  '    h.push(\'</div></div>\');',
  '  });',
  '  h.push(\'</div>\');',
  '  $("achs").innerHTML = h.join("");',
  '}',
  '',
  'function apply(){',
  '  var rows = D.runs.filter(match);',
  '  renderStats(rows);',
  '  renderRuns(rows);',
  '  renderAch(rows);',
  '  $("count").textContent = rows.length + " / " + D.runs.length + " 局";',
  '}',
  '',
  'function init(){',
  '  var cfg = $("fCfg");',
  '  D.cfgs.forEach(function(c){ var o=document.createElement("option"); o.value=c; o.textContent=c; cfg.appendChild(o); });',
  '  var gr = $("fGrade");',
  '  var seen = {};',
  '  D.runs.forEach(function(r){ if (r.year && !seen[r.year]) { seen[r.year]=1;',
  '    var o=document.createElement("option"); o.value=r.year; o.textContent=r.grade||r.year; gr.appendChild(o); } });',
  '  cfg.onchange = function(){ S.cfg=this.value; apply(); };',
  '  gr.onchange = function(){ S.grade=this.value; apply(); };',
  '  $("fState").onchange = function(){ S.state=this.value; apply(); };',
  '  $("fQ").oninput = function(){ S.q=this.value.trim(); apply(); };',
  '  $("fReset").onclick = function(){ S={cfg:"",grade:"",state:"all",q:""};',
  '    $("fCfg").value=""; $("fGrade").value=""; $("fState").value="all"; $("fQ").value=""; apply(); };',
  '  apply();',
  '}',
  'init();'
].join('\n');

var HTML = [
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>紫金港改造计划 · 离线数据看板</title>',
  '<style>' + CSS + '</style></head><body><div class="wrap">',
  '<h1>紫金港改造计划 · 数据看板</h1>',
  '<p class="sub" id="builtAt"></p>',
  '',
  '<div class="card">',
  '  <div class="stats" id="stats"></div>',
  '</div>',
  '',
  '<div class="card">',
  '  <div class="bar">',
  '    <select id="fCfg"><option value="">全部参数版本</option></select>',
  '    <select id="fGrade"><option value="">全部年级</option></select>',
  '    <select id="fState">',
  '      <option value="all">全部状态</option>',
  '      <option value="done">已完成</option>',
  '      <option value="quit">中途离开</option>',
  '      <option value="excluded">已排除</option>',
  '    </select>',
  '    <input class="grow" id="fQ" placeholder="搜 rid / 称号 / 成就名">',
  '    <button id="fReset" style="font:inherit;font-size:13px;padding:8px 14px;border-radius:10px;',
  '      border:1px solid rgba(15,23,42,.14);background:#fff;cursor:pointer">重置</button>',
  '    <span class="muted" id="count" style="font-size:12px"></span>',
  '  </div>',
  '</div>',
  '',
  '<div class="card">',
  '  <h2>对局记录</h2>',
  '  <p class="hint">按时间倒序；「参数版本」是那一局开始时的数值设置，用来区分不同初始条件</p>',
  '  <div id="runs"></div>',
  '</div>',
  '',
  '<div class="card">',
  '  <h2>成就</h2>',
  '  <p class="hint">每条成就的达成条件与达成率（随上面的筛选变化）</p>',
  '  <div id="achs"></div>',
  '</div>',
  '',
  '</div>',
  '<script>window.__D=' + json + ';</script>',
  '<script>' + JS + '</script>',
  '<script>document.getElementById("builtAt").textContent =',
  '  "数据快照：" + new Date(window.__D.builtAt).toLocaleString() +',
  '  " · 共 " + window.__D.total + " 局 · 离线版，双击即可看";</script>',
  '</body></html>'
].join('\n');

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(OUT, HTML, 'utf8');

var kb = Math.round(fs.statSync(OUT).size / 1024);
console.log('已生成：' + OUT);
console.log('  对局 ' + RUNS.length + ' 条 · 成就 ' + ACH.length + ' 个 · 参数版本 ' + CFGS.length + ' 种 · ' + kb + ' KB');
