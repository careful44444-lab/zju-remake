/* 单局管理：列出每一局、查看细节、排除出统计、删除、加备注
 * 数据源是 data/events.jsonl（按 rid 分组），排除/备注存在 data/run-meta.json */
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var DATA = path.join(ROOT, 'data', 'events.jsonl');
var META = path.join(ROOT, 'data', 'run-meta.json');

function readMeta() {
  try { return JSON.parse(fs.readFileSync(META, 'utf8')); } catch (e) { return {}; }
}
function writeMeta(m) {
  if (!fs.existsSync(path.dirname(META))) fs.mkdirSync(path.dirname(META), { recursive: true });
  fs.writeFileSync(META, JSON.stringify(m, null, 2), 'utf8');
}

function readLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(function (l) { return l.trim(); });
}

/* ---------- 异常筛查 ----------
 * 只标记「不可能是正常玩家行为」的信号，不做主观评价。
 * 每条规则看一个 id，界面上可以按 id 过滤、批量排除。 */
var C = require('../game/config.js');

var FLAGS = [
  { id: 'empty',    label: '空过四轮', desc: '一步没改就提交（ops = 0）' },
  { id: 'left',     label: '中途离开', desc: '有开始没有结束，或结束时未完成' },
  { id: 'overflow', label: '数值溢出', desc: '档位不在 1-5、点数/操作数/时长超范围' },
  { id: 'neg',      label: '负数点数', desc: '剩余点数或净投入小于 0' },
  { id: 'fast',     label: '秒交',     desc: '不到 5 秒就结束' },
  { id: 'noyear',   label: '年级缺失', desc: '没有记录年级' },
  { id: 'dup',      label: '疑似重复', desc: '同一设备 3 秒内交了两局' }
];

function num(v) { return typeof v === 'number' && isFinite(v); }

function flagsOf(r, prev) {
  var out = [];
  if (!r.settled) out.push('left');
  else if (!r.finished) out.push('left');
  if (r.finished && r.ops === 0) out.push('empty');

  var bad = false;
  Object.keys(r.tiers || {}).forEach(function (k) {
    var v = r.tiers[k];
    if (!num(v) || v < 1 || v > 5) bad = true;
  });
  if (r.pointsLeft != null && (!num(r.pointsLeft) || r.pointsLeft > 400)) bad = true;
  if (r.ops != null && (!num(r.ops) || r.ops > 200)) bad = true;
  if (r.durationMs != null && (!num(r.durationMs) || r.durationMs > 4 * 3600 * 1000)) bad = true;
  if (bad) out.push('overflow');

  if ((r.pointsLeft != null && r.pointsLeft < 0) || (r.pointsSpent != null && r.pointsSpent < 0)) out.push('neg');
  if (r.settled && num(r.durationMs) && r.durationMs >= 0 && r.durationMs < 5000) out.push('fast');
  if (!r.year) out.push('noyear');
  if (prev && r.uid && prev.uid === r.uid && Math.abs((prev.ts || 0) - (r.ts || 0)) < 3000) out.push('dup');
  return out;
}

function listRuns(file) {
  file = file || DATA;
  var meta = readMeta();
  var map = {}, order = [];

  readLines(file).forEach(function (line) {
    var e;
    try { e = JSON.parse(line); } catch (err) { return; }
    if (!e || !e.rid) return;
    var r = map[e.rid];
    if (!r) {
      r = map[e.rid] = {
        rid: e.rid, uid: e.uid || '', firstTs: e.ts || 0,
        start: null, end: null, cards: [], events: 0, year: ''
      };
      order.push(e.rid);
    }
    r.events++;
    if (!r.uid && e.uid) r.uid = e.uid;
    if (!r.year && e.prof && e.prof.year) r.year = e.prof.year;
    if (e.ev === 'run_start') {
      r.start = e;
      if (!r.year && e.props && e.props.year) r.year = e.props.year;
    }
    if (e.ev === 'run_end') {
      r.end = e;
      if (!r.year && e.props && e.props.year) r.year = e.props.year;
    }
    if (e.ev === 'card') {
      r.cards.push({
        id: (e.props || {}).id || '',
        title: (e.props || {}).title || '',
        label: (e.props || {}).label || ('选项' + (e.props || {}).option)
      });
    }
  });

  var list = order.map(function (rid) {
    var r = map[rid];
    var p = (r.end && r.end.props) || {};
    var sp = (r.start && r.start.props) || {};
    var m = meta[rid] || {};
    return {
      rid: rid,
      ts: (r.end && r.end.ts) || r.firstTs,
      uid: r.uid,
      year: r.year || '',
      settled: !!r.end,
      finished: !!(r.end && p.finished),
      title: p.title || '',
      achievements: p.achievements || [],
      durationMs: p.durationMs || 0,
      pointsLeft: p.pointsLeft != null ? p.pointsLeft : null,
      pointsSpent: p.pointsSpent != null ? p.pointsSpent : null,
      ops: p.ops != null ? p.ops : null,
      tiers: p.tiers || sp.tiers || {},
      caps: p.caps || {},
      synergy: p.synergy || [],
      cards: r.cards,
      events: r.events,
      excluded: !!m.excluded,
      note: m.note || ''
    };
  });

  // 先按时间升序算 flags（dup 要看前一局），再倒序返回
  var asc = list.slice().sort(function (a, b) { return a.ts - b.ts; });
  asc.forEach(function (r, i) { r.flags = flagsOf(r, i > 0 ? asc[i - 1] : null); });
  return asc.reverse();
}

function deleteRun(rid, file) {
  file = file || DATA;
  if (!fs.existsSync(file)) return 0;
  var kept = [], removed = 0;
  readLines(file).forEach(function (line) {
    try {
      var e = JSON.parse(line);
      if (e.rid === rid) { removed++; return; }
    } catch (err) { }
    kept.push(line);
  });
  fs.writeFileSync(file, kept.length ? kept.join('\n') + '\n' : '', 'utf8');
  var m = readMeta();
  delete m[rid];
  writeMeta(m);
  return removed;
}

function setExcluded(rid, on) {
  var m = readMeta();
  m[rid] = m[rid] || {};
  m[rid].excluded = !!on;
  writeMeta(m);
  return true;
}

function setNote(rid, note) {
  var m = readMeta();
  m[rid] = m[rid] || {};
  m[rid].note = String(note || '').slice(0, 80);
  writeMeta(m);
  return true;
}

function excludedSet() {
  var m = readMeta(), s = {};
  Object.keys(m).forEach(function (k) { if (m[k] && m[k].excluded) s[k] = 1; });
  return s;
}

module.exports = {
  FLAGS: FLAGS, flagsOf: flagsOf,
  listRuns: listRuns, deleteRun: deleteRun, setExcluded: setExcluded,
  setNote: setNote, excludedSet: excludedSet, readMeta: readMeta, DATA: DATA, META: META
};
