/* 数据汇总：把 data/events.jsonl 变成人看的报告 / 机器看的 JSON。
 * 用法：node tools/report.js [文件路径] [--json]
 *   也可以被 collect.js 当作模块调用：require('./report.js').aggregate(file) */
var fs = require('fs');
var path = require('path');

var C = require('../game/config.js');
var DIMS = C.DIMS;
var CONTENT = require('../game/content.js').CONTENT;
var EVENTS = require('../game/events.js').EVENTS;

// 给看板用的字典：维度名、专精名、事件卡名
function buildMeta() {
  var caps = {}, tierTitles = {};
  DIMS.forEach(function (d) {
    caps[d.id] = CONTENT[d.id].caps.map(function (c) { return { id: c.id, name: c.name }; });
    tierTitles[d.id] = CONTENT[d.id].tiers.map(function (t) { return t.title; });
  });
  var cards = {};
  EVENTS.forEach(function (e) { cards[e.id] = e.title; });
  return {
    dims: DIMS.map(function (d) { return { id: d.id, name: d.name, init: d.init }; }),
    caps: caps,
    tierTitles: tierTitles,
    cards: cards,
    years: C.GRADES,
    achievements: C.ACHIEVEMENTS,
    upTotal: C.INIT_POINTS
  };
}

function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  var out = [], seen = {};
  fs.readFileSync(file, 'utf8').split('\n').forEach(function (line) {
    if (!line.trim()) return;
    try {
      var e = JSON.parse(line);
      if (!e || !e.ev) return;
      if (e.eid) { if (seen[e.eid]) return; seen[e.eid] = 1; }
      out.push(e);
    } catch (err) { }
  });
  return out.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
}

function median(a) {
  if (!a.length) return 0;
  var b = a.slice().sort(function (x, y) { return x - y; });
  var m = Math.floor(b.length / 2);
  return b.length % 2 ? b[m] : Math.round((b[m - 1] + b[m]) / 2);
}
function avg(a) {
  if (!a.length) return 0;
  var s = 0;
  a.forEach(function (x) { s += x; });
  return Math.round(s / a.length * 10) / 10;
}

function aggregate(file) {
  var ev = readEvents(file);
  var excluded = {};
  try { excluded = require('./runs.js').excludedSet(); } catch (e) { }
  var excludedCount = Object.keys(excluded).length;
  if (excludedCount) {
    ev = ev.filter(function (e) { return !e.rid || !excluded[e.rid]; });
  }

  var users = {}, runs = {};
  var upgrades = {}, downgrades = {}, ends = [], cards = {}, caps = {};
  DIMS.forEach(function (d) { upgrades[d.id] = 0; downgrades[d.id] = 0; caps[d.id] = {}; });
  // 同一回合里同一个维度「升了又降」= 白折腾，不算进统计
  // 先按 (局|回合|维度) 攒起来，最后只记净值
  var netActs = {}, noRoundSeq = 0;

  ev.forEach(function (e) {
    if (e.uid) users[e.uid] = 1;
    var r = runs[e.rid] || (runs[e.rid] = { rid: e.rid, uid: e.uid, start: null, end: null, ts0: e.ts, year: '' });
    if (!r.year && e.prof && e.prof.year) r.year = e.prof.year;
    if (e.ev === 'run_start') {
      r.start = e;
      if (!r.year && e.props && e.props.year) r.year = e.props.year;
    }
    if (e.ev === 'run_end') {
      r.end = e;
      if (!r.year && e.props && e.props.year) r.year = e.props.year;
      ends.push(e);
    }
    if (e.ev === 'action') {
      var p = e.props || {};
      if (p.type === 'upgrade' || p.type === 'downgrade') {
        // 老数据可能没有 round 字段：那就按「每次单独算」，不做抵消
        var rk = (p.round != null) ? p.round : ('x' + (noRoundSeq++));
        var key = (e.rid || '') + '|' + rk + '|' + p.dim;
        var cell = netActs[key] || (netActs[key] = { up: 0, down: 0 });
        if (p.type === 'upgrade') cell.up += 1; else cell.down += 1;
      }
      if (p.type === 'upgrade' && p.cap) {
        caps[p.dim][p.cap] = (caps[p.dim][p.cap] || 0) + 1;
      }
    }
    if (e.ev === 'card') {
      var p2 = e.props || {};
      var cid = p2.id || 'unknown';
      if (!cards[cid]) cards[cid] = { total: 0, title: p2.title || '', options: {} };
      cards[cid].total += 1;
      if (!cards[cid].title && p2.title) cards[cid].title = p2.title;
      // 按「选项原文」聚合；老数据只有序号时才退回 选项N
      var label = p2.label || ('选项' + (p2.option != null ? p2.option : '?'));
      cards[cid].options[label] = (cards[cid].options[label] || 0) + 1;
    }
  });

  // 把攒下来的动作折算成净值：只算「净升/净降」，抵消掉的不计
  Object.keys(netActs).forEach(function (k) {
    var cell = netActs[k];
    var dim = k.split("|")[2];
    if (!upgrades.hasOwnProperty(dim)) return;
    var net = cell.up - cell.down;
    if (net > 0) upgrades[dim] += net;
    else if (net < 0) downgrades[dim] += -net;
  });

  var runList = Object.keys(runs).map(function (k) { return runs[k]; });
  var finished = runList.filter(function (r) { return r.end && r.end.props && r.end.props.finished; });
  var abandoned = runList.filter(function (r) { return r.end && r.end.props && !r.end.props.finished; });
  var started = runList.filter(function (r) { return r.start; });

  var durations = finished.map(function (r) { return r.end.props.durationMs || 0; }).filter(function (x) { return x > 0; });

  // 每局的「推进档数」= 六个维度相对初始档一共升了几档（不是分数，是投入了多少）
  function stepsOf(r) {
    var t = (r.end && r.end.props && r.end.props.tiers) || {};
    var n = 0;
    DIMS.forEach(function (d) { n += Math.max(0, (t[d.id] || d.init) - d.init); });
    return n;
  }

  // 按年级分组
  var byYear = {};
  C.GRADES.forEach(function (g) { byYear[g.id] = { id: g.id, name: g.name, runs: 0, steps: 0, avgSteps: 0 }; });
  byYear.__none = { id: '', name: '未选', runs: 0, steps: 0, avgSteps: 0 };
  finished.forEach(function (r) {
    var b = byYear[r.year] || byYear.__none;
    b.runs += 1;
    b.steps += stepsOf(r);
  });
  Object.keys(byYear).forEach(function (k) {
    var b = byYear[k];
    b.avgSteps = b.runs ? Math.round(b.steps / b.runs * 10) / 10 : 0;
  });

  // 成就解锁次数
  var achievements = {};
  (C.ACHIEVEMENTS || []).forEach(function (a) { achievements[a.id] = { id: a.id, name: a.name, desc: a.desc, count: 0 }; });
  finished.forEach(function (r) {
    ((r.end.props || {}).achievements || []).forEach(function (a) {
      if (!achievements[a]) achievements[a] = { id: a, name: a, desc: '', count: 0 };
      achievements[a].count += 1;
    });
  });

  // 六维最终档位分布
  var tierDist = {};
  DIMS.forEach(function (d) { tierDist[d.id] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, mean: 0 }; });
  finished.forEach(function (r) {
    var t = (r.end.props.tiers) || {};
    DIMS.forEach(function (d) {
      var v = t[d.id];
      if (v >= 1 && v <= 5) tierDist[d.id][v] += 1;
    });
  });
  DIMS.forEach(function (d) {
    var s = 0, n = 0;
    for (var i = 1; i <= 5; i++) { s += tierDist[d.id][i] * i; n += tierDist[d.id][i]; }
    tierDist[d.id].mean = n ? Math.round(s / n * 100) / 100 : 0;
  });

  var titles = {};
  finished.forEach(function (r) {
    var t = (r.end.props.title || '?');
    titles[t] = (titles[t] || 0) + 1;
  });

  // 最近的对局（给看板用）
  var recent = runList.filter(function (r) { return r.end; })
    .sort(function (a, b) { return (b.end.ts || 0) - (a.end.ts || 0); })
    .slice(0, 24)
    .map(function (r) {
      var p = r.end.props || {};
      return {
        ts: r.end.ts,
        title: p.title || '',
        finished: !!p.finished,
        durationMs: p.durationMs || 0,
        pointsLeft: p.pointsLeft || 0,
        steps: stepsOf(r),
        achievements: p.achievements || [],
        year: r.year || '',
        tiers: p.tiers || {},
        caps: p.caps || {},
        uid: String(r.uid || '').slice(0, 6)
      };
    });

  // 异常局数（复用 runs.js 的判定；dup 需要前后比对，这里不重复算）
  var anomCount = 0;
  try {
    var flagMod = require("./runs.js");
    runList.forEach(function (r) {
      var p2 = (r.end && r.end.props) || {};
      var shaped = {
        settled: !!r.end, finished: !!p2.finished, ops: p2.ops, tiers: p2.tiers || {},
        pointsLeft: p2.pointsLeft, pointsSpent: p2.pointsSpent,
        durationMs: p2.durationMs, year: r.year, uid: r.uid, ts: (r.end && r.end.ts) || r.ts0
      };
      if (flagMod.flagsOf(shaped, null).length) anomCount++;
    });
  } catch (e) { }

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      events: ev.length,
      users: Object.keys(users).length,
      runs: runList.length,
      started: started.length,
      finished: finished.length,
      abandoned: abandoned.length,
      completionRate: started.length ? Math.round(finished.length / started.length * 100) : 0,
      anomalies: anomCount,
      avgSteps: finished.length ? Math.round(finished.reduce(function (a, r) { return a + stepsOf(r); }, 0) / finished.length * 10) / 10 : 0
    },
    duration: { medianMs: median(durations), avgMs: avg(durations) },
    tiers: tierDist,
    achievements: achievements,
    actions: { upgrades: upgrades, downgrades: downgrades },
    caps: caps,
    cards: cards,
    titles: titles,
    byYear: byYear,
    recent: recent,
    excludedCount: excludedCount,
    meta: buildMeta()
  };
}

function pct(n, d) { return d ? Math.round(n / d * 100) + '%' : '-'; }

function printReport(r) {
  var t = r.totals;
  console.log('');
  console.log('=== 总览 ===');
  console.log('  事件 ' + t.events + ' 条 · 玩家 ' + t.users + ' 人 · 对局 ' + t.runs + ' 局');
  console.log('  完成 ' + t.finished + ' 局（' + pct(t.finished, t.started) + '）· 中途离开 ' + t.abandoned + ' 局');
  console.log('  单局时长中位 ' + Math.round((r.duration.medianMs || 0) / 1000) + ' 秒');

  console.log('');
  console.log('=== 推进强度（仅完成的对局）===');
  console.log('  平均每题推进 ' + r.totals.avgSteps + ' 档（六维相对初始档的升档总数）');

  console.log('');
  console.log('=== 成就解锁 ===');
  Object.keys(r.achievements).forEach(function (k) {
    var a = r.achievements[k];
    console.log('  ' + a.name + '  ' + String(a.count).padStart(3) + ' 次 · ' + (a.desc || ''));
  });

  console.log('');
  console.log('=== 六维最终档位 ===');
  console.log('  维度   T1  T2  T3  T4  T5   均值');
  DIMS.forEach(function (d) {
    var x = r.tiers[d.id];
    console.log('  ' + d.name + '     ' + [1, 2, 3, 4, 5].map(function (i) {
      return String(x[i]).padStart(2);
    }).join('  ') + '   ' + String(x.mean).padStart(4));
  });

  console.log('');
  console.log('=== 加/减点行为 ===');
  DIMS.forEach(function (d) {
    console.log('  ' + d.name + '  升 ' + (r.actions.upgrades[d.id] || 0) + ' 次 · 降 ' + (r.actions.downgrades[d.id] || 0) + ' 次');
  });

  console.log('');
  console.log('=== 封神专精 ===');
  DIMS.forEach(function (d) {
    var keys = Object.keys(r.caps[d.id] || {});
    if (keys.length) console.log('  ' + d.name + '  ' + keys.map(function (k) { return k + ':' + r.caps[d.id][k]; }).join('  '));
  });

  console.log('');
  console.log('=== 事件卡 ===');
  Object.keys(r.cards).forEach(function (id) {
    var c = r.cards[id];
    console.log('  ' + (c.title || id) + '   出现 ' + c.total + ' 次');
    Object.keys(c.options).sort(function (a, b) { return c.options[b] - c.options[a]; })
      .forEach(function (k) {
        console.log('      选「' + k + '」  ' + c.options[k] + ' 次');
      });
  });

  console.log('');
  console.log('=== 按年级 ===');
  Object.keys(r.byYear).forEach(function (k) {
    var b = r.byYear[k];
    if (!b.runs) return;
    console.log('  ' + b.name + '  ' + String(b.runs).padStart(3) + ' 局 · 平均推进 ' + b.avgSteps + ' 档');
  });

  console.log('');
  console.log('=== 称号 ===');
  Object.keys(r.titles).forEach(function (k) { console.log('  ' + k + '  ' + r.titles[k]); });
  console.log('');
}

if (require.main === module) {
  var arg = process.argv[2] && process.argv[2].indexOf('--') !== 0 ? process.argv[2] : null;
  var file = arg || path.join(__dirname, '..', 'data', 'events.jsonl');
  var report = aggregate(file);
  if (process.argv.indexOf('--json') >= 0) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
}

module.exports = { aggregate: aggregate, readEvents: readEvents, printReport: printReport, meta: buildMeta };
