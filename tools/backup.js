/* 数据备份与回档
 *
 *   node tools/backup.js                 立刻做一份快照
 *   node tools/backup.js --list          看所有快照
 *   node tools/backup.js --restore 1     回到最新那份（1 = 最新，2 = 次新…）
 *   node tools/backup.js --restore <文件>  按文件名还原
 *   node tools/backup.js --csv           额外导出一份 Excel 能打开的 CSV
 *   node tools/backup.js --keep 30       只保留最近 30 份（默认 30）
 *
 * 恢复之前会自动把「当前数据」也存一份，所以回档本身也能反悔。
 */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..');
var DATA = path.join(ROOT, 'data', 'events.jsonl');
var DIR = path.join(ROOT, 'backups', 'data');
var INDEX = path.join(DIR, 'index.json');
var STATE = path.join(DIR, '.state.json');

function ensure() { if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true }); }

function readIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch (e) { return []; }
}
function writeIndex(list) {
  ensure();
  fs.writeFileSync(INDEX, JSON.stringify(list, null, 2), 'utf8');
}

function stats(text) {
  var events = 0, rids = {}, finished = {}, users = {};
  text.split('\n').forEach(function (line) {
    if (!line.trim()) return;
    var e;
    try { e = JSON.parse(line); } catch (err) { return; }
    if (!e || !e.ev) return;
    events++;
    if (e.rid) rids[e.rid] = 1;
    if (e.uid) users[e.uid] = 1;
    if (e.ev === 'run_end' && e.props && e.props.finished) finished[e.rid] = 1;
  });
  return {
    events: events,
    runs: Object.keys(rids).length,
    finished: Object.keys(finished).length,
    users: Object.keys(users).length
  };
}

function stamp(d) {
  d = d || new Date();
  var p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function snapshot(opt) {
  opt = opt || {};
  ensure();
  if (!fs.existsSync(DATA)) {
    if (!opt.quiet) console.log('还没有数据可备份（data/events.jsonl 不存在）。先去玩一局吧。');
    return null;
  }
  var text = fs.readFileSync(DATA, 'utf8');
  if (!text.trim()) {
    if (!opt.quiet) console.log('数据文件还是空的，没什么可备份。');
    return null;
  }
  var st = stats(text);
  var base = stamp() + '-r' + st.runs + '-e' + st.events;
  // 同一秒连续备份会撞名，撞了就加 -2 / -3 后缀
  var name = base + '.jsonl', dup = 2;
  while (fs.existsSync(path.join(DIR, name))) { name = base + '-' + dup + '.jsonl'; dup += 1; }
  var file = path.join(DIR, name);
  fs.writeFileSync(file, text, 'utf8');

  var list = readIndex();
  list.push({
    file: name,
    at: new Date().toISOString(),
    events: st.events,
    runs: st.runs,
    finished: st.finished,
    users: st.users,
    bytes: Buffer.byteLength(text),
    sha: crypto.createHash('sha256').update(text).digest('hex').slice(0, 16),
    note: opt.note || ''
  });
  list.sort(function (a, b) { return a.at < b.at ? -1 : 1; });

  var keep = opt.keep || 30;
  while (list.length > keep) {
    var old = list.shift();
    try { fs.unlinkSync(path.join(DIR, old.file)); } catch (e) { }
  }
  writeIndex(list);

  if (!opt.quiet) {
    var kb = (Buffer.byteLength(text) / 1024).toFixed(1);
    console.log('已备份：' + name);
    console.log('  ' + st.events + ' 条事件 · ' + st.runs + ' 局（完成 ' + st.finished + '）· ' +
      st.users + ' 位玩家 · ' + kb + ' KB');
    console.log('  位置：backups\\data\\' + name);
  }
  return name;
}

function listSnapshots() {
  var list = readIndex().slice().reverse();   // 新的在前
  if (!list.length) { console.log('还没有任何备份。'); return; }
  console.log('');
  console.log('  编号  时间                   局数  完成  事件   大小    文件');
  console.log('  ' + '-'.repeat(96));
  list.forEach(function (x, i) {
    var t = new Date(x.at);
    var pad = function (n, w) { return String(n).padStart(w); };
    console.log('  ' + pad(i + 1, 3) + '   ' +
      t.toLocaleString('zh-CN', { hour12: false }).padEnd(20) + '  ' +
      pad(x.runs, 3) + '   ' + pad(x.finished, 3) + '   ' + pad(x.events, 4) + '  ' +
      pad(Math.round((x.bytes || 0) / 1024), 4) + 'KB  ' + x.file);
  });
  console.log('');
  console.log('  回档：node tools/backup.js --restore 1     （1 = 最新）');
  console.log('');
}

function restore(query, opt) {
  opt = opt || {};
  var list = readIndex();          // 旧 → 新
  if (!list.length) { console.log('没有任何备份可以恢复。'); return false; }

  var target = null;
  if (/^\d+$/.test(String(query))) {
    var n = parseInt(query, 10);
    if (n < 1 || n > list.length) { console.log('编号超出范围（1 ~ ' + list.length + '）'); return false; }
    target = list[list.length - n];   // 1 = 最新
  } else {
    var q = String(query);
    target = list.filter(function (x) { return x.file === q || x.file.indexOf(q) >= 0; })[0];
  }
  if (!target) { console.log('找不到这份备份：' + query); return false; }

  var src = path.join(DIR, target.file);
  if (!fs.existsSync(src)) { console.log('备份文件丢了：' + src); return false; }

  if (!opt.yes) {
    console.log('这会把 data/events.jsonl 换成：' + target.file);
    console.log('（执行时会先把当前数据另存一份，回档本身也能反悔）');
    console.log('确认请加 --yes 再执行一次。');
    return false;
  }

  // 先把当前数据存一份并登记进索引，回档也能反悔
  if (fs.existsSync(DATA)) {
    var cur = fs.readFileSync(DATA, 'utf8');
    if (cur.trim()) {
      var safeName = 'pre-restore-' + stamp() + '.jsonl';
      fs.writeFileSync(path.join(DIR, safeName), cur, 'utf8');
      var st2 = stats(cur);
      var list2 = readIndex();
      list2.push({
        file: safeName,
        at: new Date().toISOString(),
        events: st2.events, runs: st2.runs, finished: st2.finished, users: st2.users,
        bytes: Buffer.byteLength(cur),
        sha: crypto.createHash('sha256').update(cur).digest('hex').slice(0, 16),
        note: '回档前自动保存'
      });
      writeIndex(list2);
      console.log('当前数据已另存：' + safeName + '（用 --restore 还能再回来）');
    }
  }

  fs.copyFileSync(src, DATA);
  console.log('已回档到：' + target.file);
  console.log('  ' + target.events + ' 条事件 · ' + target.runs + ' 局 · ' + new Date(target.at).toLocaleString('zh-CN'));
  return true;
}

// 每次启动服务时调用：数据有变化才备份，最多 10 分钟一次
function autoSnapshot() {
  try {
    if (!fs.existsSync(DATA)) return;
    var st = fs.statSync(DATA);
    var prev = {};
    try { prev = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { }
    if (prev.size === st.size) return;
    if (prev.at && Date.now() - new Date(prev.at).getTime() < 10 * 60 * 1000) return;
    snapshot({ quiet: true, keep: 30 });
    ensure();
    fs.writeFileSync(STATE, JSON.stringify({ size: st.size, at: new Date().toISOString() }), 'utf8');
  } catch (e) { }
}

function yearName(e) {
  var C2 = require('../game/config.js');
  var y = (e.prof && e.prof.year) || (e.props && e.props.year) || '';
  for (var i = 0; i < (C2.GRADES || []).length; i++) {
    if (C2.GRADES[i].id === y) return C2.GRADES[i].name;
  }
  return y || '未选';
}

function csv(opt) {
  var text = fs.existsSync(DATA) ? fs.readFileSync(DATA, 'utf8') : '';
  if (!text.trim()) { console.log('没有数据可导出。'); return null; }

  var C = require('../game/config.js');
  var dims = C.DIMS;
  var runs = {};
  text.split('\n').forEach(function (line) {
    if (!line.trim()) return;
    var e; try { e = JSON.parse(line); } catch (err) { return; }
    if (e.ev === 'run_end') runs[e.rid] = e;
  });

  var head = ['时间', '年级', '是否完成', '称号', '成就', '净投入点数', '剩余点数', '操作次数', '时长秒']
    .concat(dims.map(function (d) { return d.name + '_档位'; }))
    .concat(dims.map(function (d) { return d.name + '_专精'; }));
  var rows = [head.join(',')];

  Object.keys(runs).forEach(function (rid) {
    var e = runs[rid], p = e.props || {};
    var row = [
      new Date(e.ts).toLocaleString('zh-CN', { hour12: false }),
      yearName(e),
      p.finished ? '是' : '否',
      p.title || '',
      (p.achievements || []).join(' / '),
      p.pointsSpent != null ? p.pointsSpent : '',
      p.pointsLeft != null ? p.pointsLeft : '',
      p.ops != null ? p.ops : '',
      Math.round((p.durationMs || 0) / 1000)
    ];
    dims.forEach(function (d) { row.push((p.tiers || {})[d.id] || ''); });
    dims.forEach(function (d) { row.push((p.caps || {})[d.id] || ''); });
    rows.push(row.map(function (x) {
      var s = String(x);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(','));
  });

  ensure();
  var file = path.join(ROOT, 'backups', 'runs-' + stamp() + '.csv');
  fs.writeFileSync(file, '\ufeff' + rows.join('\r\n'), 'utf8');  // BOM 让 Excel 认中文
  console.log('已导出 CSV：' + file + '  （' + (rows.length - 1) + ' 局，Excel 可直接打开）');
  return file;
}

// ---------------- 单份管理（给 /backups 页面用） ----------------
function items() {
  return readIndex().map(function (x, i) {
    return {
      file: x.file, at: x.at, events: x.events, runs: x.runs,
      finished: x.finished, users: x.users, bytes: x.bytes, sha: x.sha,
      note: x.note || ''
    };
  }).reverse();   // 新的在前
}

function currentStats() {
  if (!fs.existsSync(DATA)) return { events: 0, runs: 0, finished: 0, users: 0, bytes: 0 };
  var text = fs.readFileSync(DATA, 'utf8');
  var s = stats(text);
  s.bytes = Buffer.byteLength(text);
  return s;
}

function remove(file) {
  var list = readIndex();
  var i = -1;
  list.forEach(function (x, k) { if (x.file === file) i = k; });
  if (i < 0) return false;
  try { fs.unlinkSync(path.join(DIR, file)); } catch (e) { }
  list.splice(i, 1);
  writeIndex(list);
  return true;
}

function setNote(file, note) {
  var list = readIndex();
  var hit = null;
  list.forEach(function (x) { if (x.file === file) hit = x; });
  if (!hit) return false;
  hit.note = String(note || '').slice(0, 60);
  writeIndex(list);
  return true;
}

function exists(file) {
  if (!/^[A-Za-z0-9._-]+\.jsonl$/.test(file)) return false;
  return fs.existsSync(path.join(DIR, file));
}

// ---------------- CLI ----------------
if (require.main === module) {
  var args = process.argv.slice(2);
  var has = function (k) { return args.indexOf(k) >= 0; };
  var val = function (k) {
    var i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : null;
  };

  if (has('--list')) { listSnapshots(); }
  else if (has('--restore')) {
    var q = val('--restore');
    if (!q) { console.log('用法：node tools/backup.js --restore 1'); }
    else restore(q, { yes: has('--yes') });
  } else if (has('--csv') && !has('--snapshot')) {
    csv();
  } else {
    snapshot({ keep: parseInt(val('--keep') || '30', 10) });
    if (has('--csv')) csv();
  }
}

module.exports = {
  snapshot: snapshot, list: listSnapshots, restore: restore,
  autoSnapshot: autoSnapshot, csv: csv, stats: stats,
  items: items, currentStats: currentStats, remove: remove, setNote: setNote, exists: exists,
  DIR: DIR
};
