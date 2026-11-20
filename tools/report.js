/* 数据汇总：把 data/events.jsonl 变成人看的报告 / 机器看的 JSON。
 * 用法：node tools/report.js [文件路径] [--json]
 *   也可以被 collect.js 当作模块调用：require('./report.js').aggregate(file) */
var fs = require('fs');
var path = require('path');

var C = require('../game/config.js');
var DIMS = C.DIMS;
var CONTENT = require('../game/content.js').CONTENT;
var EVENTS = require('../game/events.js').EVENTS;

// 给看板用的字典：维度名、专精名、事件卡名（合并 data/content-edit.json 与 data/config-edit.json）
function loadJsonSafe(p) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; } catch (e) { return null; }
}

function buildMeta() {
  var ce = loadJsonSafe(path.join(__dirname, '..', 'data', 'content-edit.json')) || {};
  var cfgEdit = loadJsonSafe(path.join(__dirname, '..', 'data', 'config-edit.json')) || {};
  var flat = ce.content || ce;
  var caps = {}, tierTitles = {};
  DIMS.forEach(function (d) {
    var ov = flat[d.id] || {};
    caps[d.id] = CONTENT[d.id].caps.map(function (c, i) {
      var o2 = (ov.caps || [])[i];
      return { id: c.id, name: (o2 && o2.name) || c.name };
    });
    tierTitles[d.id] = CONTENT[d.id].tiers.map(function (t, i) {
      var o2 = (ov.tiers || [])[i];
      return (o2 && o2.title) || t.title;
    });
  });
  var cards = {};
  EVENTS.forEach(function (e) { cards[e.id] = e.title; });
  (ce.__events || ce.events || []).forEach(function (e) {
    if (e && e.id && e.title) cards[e.id] = e.title;
  });
  var achs = (C.ACHIEVEMENTS || []).map(function (a) { return Object.assign({}, a); });
  var ceAch = ce.__achievements || (ce.content && ce.content.__achievements) || ce.achievements || [];
  if (Array.isArray(ceAch)) {
    ceAch.forEach(function (a) {
      if (!a || !a.id) return;
      var hit = achs.filter(function (x) { return x.id === a.id; })[0];
      if (hit) { if (a.name) hit.name = a.name; if (a.desc) hit.desc = a.desc; }
      else achs.push({ id: a.id, name: a.name || a.id, desc: a.desc || '' });
    });
  }

  return {
    dims: DIMS.map(function (d) {
      var init = (cfgEdit.inits && typeof cfgEdit.inits[d.id] === 'number') ? cfgEdit.inits[d.id] : d.init;
      return { id: d.id, name: d.name, init: init };
    }),
    caps: caps,
    tierTitles: tierTitles,
    cards: cards,
    years: C.GRADES,
    areas: C.AREAS || [],
    achievements: achs,
    upTotal: (typeof cfgEdit.points === 'number') ? cfgEdit.points : C.INIT_POINTS
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
  var firstRound = { firstUp: {}, r1Up: {}, r1Down: {} };
  DIMS.forEach(function (d) {
    upgrades[d.id] = 0; downgrades[d.id] = 0; caps[d.id] = {};
    firstRound.firstUp[d.id] = 0; firstRound.r1Up[d.id] = 0; firstRound.r1Down[d.id] = 0;
  });
  // 同一回合里同一个维度「升了又降」= 白折腾，不算进统计
  // 先按 (局|回合|维度) 攒起来，最后只记净值
  var netActs = {}, noRoundSeq = 0;
  var survey = {};   // qid -> { title, type, total, skipped, choices, texts }
  var byCfg = {};    // 参数版本 -> { key, label, cfg, runs }

  ev.forEach(function (e) {
    if (e.uid) users[e.uid] = 1;
    var r = runs[e.rid] || (runs[e.rid] = { rid: e.rid, uid: e.uid, start: null, end: null, ts0: e.ts, year: '', area: '', firstUpDim: null });
    if (!r.year && e.prof && e.prof.year) r.year = e.prof.year;
    if (!r.area && e.prof && e.prof.area) r.area = e.prof.area;
    if (e.ev === 'run_start') {
      r.start = e;
      var cf = e.props && e.props.cfg;
      if (cf) {
        var gtot = (cf.grants || []).reduce(function (a, b) { return a + (b || 0); }, 0);
        var iniS = Object.keys(cf.inits || {}).reduce(function (a, k) { return a + (cf.inits[k] || 0); }, 0);
        var ck = [gtot, (cf.grants || []).join('/'), cf.carry, cf.breadth, iniS, (cf.stepCost || []).join('/')].join('|');
        r.cfgKey = ck;
        if (!byCfg[ck]) byCfg[ck] = {
          key: ck,
          label: (cf.grants || []).join('/') + ' · 结转 ' + cf.carry + ' · 税 ' + cf.breadth + ' · 初始' + iniS,
          grantTotal: gtot,
          grants: cf.grants || [],
          carry: cf.carry,
          breadth: cf.breadth,
          iniSum: iniS,
          stepCost: cf.stepCost || [],
          runs: 0, finished: 0, tiersSum: 0, spentSum: 0
        };
      }
      if (!r.year && e.props && e.props.year) r.year = e.props.year;
      if (!r.area && e.props && e.props.area) r.area = e.props.area;
    }
    if (e.ev === 'run_end') {
      r.end = e;
      if (!r.year && e.props && e.props.year) r.year = e.props.year;
      if (!r.area && e.props && e.props.area) r.area = e.props.area;
      ends.push(e);
    }
    if (e.ev === 'action') {
      var p = e.props || {};
      if (p.type === 'upgrade' || p.type === 'downgrade' || (p.type === 'item' && p.item === 'up' && p.dim)) {
        // 老数据可能没有 round 字段：那就按「每次单独算」，不做抵消
        var rk = (p.round != null) ? p.round : ('x' + (noRoundSeq++));
        var key = (e.rid || '') + '|' + rk + '|' + p.dim;
        var cell = netActs[key] || (netActs[key] = { up: 0, down: 0 });
        if (p.type === 'downgrade') cell.down += 1;
        else {
          cell.up += 1;
          if (!r.firstUpDim && p.dim && firstRound.firstUp.hasOwnProperty(p.dim)) r.firstUpDim = p.dim;
        }
      } else if (p.type === 'undo' && p.undone && p.undone.dim) {
        // 撤销抵消上一步同维度操作
        var u = p.undone;
        var uk = (e.rid || '') + '|';
        var lastKey = null;
        Object.keys(netActs).forEach(function (k2) {
          if (k2.indexOf(uk) === 0 && k2.slice(-('|' + u.dim).length) === ('|' + u.dim)) lastKey = k2;
        });
        if (lastKey) {
          if (u.type === 'upgrade' && netActs[lastKey].up > 0) netActs[lastKey].up -= 1;
          else if (u.type === 'downgrade' && netActs[lastKey].down > 0) netActs[lastKey].down -= 1;
        }
      }
    }
    if (e.ev === 'answer') {
      var pa = e.props || {};
      var qid = pa.qid || 'unknown';
      var sq = survey[qid] || (survey[qid] = { title: pa.title || '', type: pa.type || 'choice', total: 0, skipped: 0, choices: {}, texts: [] });
      if (!sq.title && pa.title) sq.title = pa.title;
      sq.total += 1;
      if (pa.skipped) sq.skipped += 1;
      else {
        if (pa.choice) sq.choices[pa.choice] = (sq.choices[pa.choice] || 0) + 1;
        if (pa.text) sq.texts.push(String(pa.text).slice(0, 300));
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
    var parts = k.split("|");
    var rk = parts[1], dim = parts[2];
    if (!upgrades.hasOwnProperty(dim)) return;
    var net = cell.up - cell.down;
    if (net > 0) {
      upgrades[dim] += net;
      if (rk === "1") firstRound.r1Up[dim] += net;
    } else if (net < 0) {
      downgrades[dim] += -net;
      if (rk === "1") firstRound.r1Down[dim] += -net;
    }
  });

  Object.keys(runs).forEach(function (rid) {
    var fd = runs[rid].firstUpDim;
    if (fd && firstRound.firstUp.hasOwnProperty(fd)) firstRound.firstUp[fd] += 1;
  });

  var runList = Object.keys(runs).map(function (k) { return runs[k]; });
  var finished = runList.filter(function (r) { return r.end && r.end.props && r.end.props.finished; });
  var abandoned = runList.filter(function (r) { return r.end && r.end.props && !r.end.props.finished; });
  var started = runList.filter(function (r) { return r.start; });

  var durations = finished.map(function (r) { return r.end.props.durationMs || 0; }).filter(function (x) { return x > 0; });

  // 每局的「推进档数」= 六个维度相对该局初始档一共升了几档（优先用该局 run_start 记录的 cfg.inits）
  var metaNow = buildMeta();
  var fallbackInits = {};
  metaNow.dims.forEach(function (d) { fallbackInits[d.id] = d.init; });
  function stepsOf(r) {
    var t = (r.end && r.end.props && r.end.props.tiers) || {};
    var inits = (r.start && r.start.props && r.start.props.cfg && r.start.props.cfg.inits) || fallbackInits;
    var n = 0;
    DIMS.forEach(function (d) {
      var base = (typeof inits[d.id] === 'number') ? inits[d.id] : d.init;
      n += Math.max(0, (t[d.id] || base) - base);
    });
    return n;
  }

  // 封神专精按最终结算结果统计（避免「试选后降档/撤销」被重复记账）
  finished.forEach(function (r) {
    var rc = (r.end && r.end.props && r.end.props.caps) || {};
    DIMS.forEach(function (d) {
      var cid = rc[d.id];
      if (cid) caps[d.id][cid] = (caps[d.id][cid] || 0) + 1;
    });
  });

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
  // 后台文案编辑器里新增的成就（id 形如 ach<时间戳>）也要能显示名字
  try {
    var cePath = require("path").join(__dirname, "..", "data", "content-edit.json");
    if (require("fs").existsSync(cePath)) {
      var ce = JSON.parse(require("fs").readFileSync(cePath, "utf8"));
      var ceAch = ce.__achievements || (ce.content && ce.content.__achievements) || ce.achievements || [];
      ceAch.forEach(function (a) {
        if (!a || !a.id) return;
        if (!achievements[a.id]) achievements[a.id] = { id: a.id, name: a.name || a.id, desc: a.desc || "", count: 0 };
        else if (a.name) achievements[a.id].name = a.name;
      });
    }
  } catch (e) { }
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

  // 参数版本汇总
  Object.keys(runs).forEach(function (k) {
    var r = runs[k];
    if (!r.cfgKey || !byCfg[r.cfgKey]) return;
    var g = byCfg[r.cfgKey];
    g.runs += 1;
    if (r.end && r.end.props && r.end.props.finished) {
      g.finished += 1;
      var pr = r.end.props || {};
      var tt = pr.tiers || {};
      g.tiersSum += DIMS.reduce(function (a, d) { return a + (tt[d.id] || 0); }, 0);
      g.spentSum += (pr.pointsSpent || 0);
    }
  });
  var cfgGroups = Object.keys(byCfg).map(function (k) {
    var g = byCfg[k];
    return {
      key: g.key, label: g.label, grants: g.grants, grantTotal: g.grantTotal,
      carry: g.carry, breadth: g.breadth, iniSum: g.iniSum, stepCost: g.stepCost,
      runs: g.runs, finished: g.finished,
      completionRate: g.runs ? Math.round(g.finished / g.runs * 100) : 0,
      avgTiers: g.finished ? Math.round(g.tiersSum / g.finished * 10) / 10 : 0,
      avgSpent: g.finished ? Math.round(g.spentSum / g.finished * 10) / 10 : 0
    };
  }).sort(function (a, b) { return b.runs - a.runs; });

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
    firstRound: firstRound,
    survey: survey,
    caps: caps,
    cards: cards,
    titles: titles,
    byYear: byYear,
    recent: recent,
    excludedCount: excludedCount,
    cfgGroups: cfgGroups,
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
