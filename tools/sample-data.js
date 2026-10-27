/* 生成一批模拟对局数据，用来预览报表长什么样（不会混进真实数据）。
 * 用法：node tools/sample-data.js [局数] [collectUrl]
 *   默认 40 局，打到 http://127.0.0.1:8787/collect
 *   → 写进 data/events.jsonl；想清掉：删掉这个文件即可 */
var C = require('../game/config.js');
var Core = require('../game/core.js');
var Ev = require('../game/events.js');
var CONTENT = require('../game/content.js').CONTENT;

var N = parseInt(process.argv[2] || 40, 10);
var URL = process.argv[3] || 'http://127.0.0.1:8787/collect';
var DIMS = C.DIMS;

function uuid() {
  var s = '';
  for (var i = 0; i < 4; i++) s += Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return s;
}
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

function playRun(uid, year) {
  var s = Core.createState();
  var rid = uuid(), seq = 0, ts = Date.now();
  var out = [];
  var ev = function (evName, props) {
    out.push({
      v: 1, eid: uuid(), sid: uuid(), uid: uid, prof: { year: year },
      ts: ts + (seq * 900),
      app: 'zju-remake', ver: '0.1.0', env: 'sim',
      ev: evName, rid: rid, seq: ++seq, props: props
    });
  };

  ev('run_start', { mode: 'new', year: year, points: s.points, tiers: Core.clone(s.tiers) });

  // 随机但「像个玩家」的策略：偏向补短板，偶尔贪一个封神
  var steps = 7 + Math.floor(Math.random() * 10);
  var cardsLeft = 1 + Math.floor(Math.random() * 3);

  for (var i = 0; i < steps; i++) {
    var low = DIMS.filter(function (d) { return s.tiers[d.id] < 5; });
    if (!low.length) break;

    // 20% 概率拆东墙
    if (Math.random() < 0.12) {
      var rich = DIMS.filter(function (d) { return s.tiers[d.id] > 1; });
      if (rich.length) {
        var dd = pick(rich);
        var fromD = s.tiers[dd.id];
        var rd = Core.downgrade(s, dd.id);
        if (rd.ok) {
          ev('action', {
            type: 'downgrade', dim: dd.id, from: fromD, to: rd.tier, refund: rd.refund,
            points: s.points, round: s.round, ops: s.ops
          });
        }
      }
    }

    var order = low.slice().sort(function (a, b) { return s.tiers[a.id] - s.tiers[b.id]; });
    var target = Math.random() < 0.7 ? order[0] : pick(order);
    if (!target) break;
    var from = s.tiers[target.id];
    var cost = Core.cost(s, target.id);
    if (s.points < cost) continue;

    var cap = null;
    if (from === 4) {
      var caps = CONTENT[target.id].caps;
      cap = pick(caps).id;
    }
    var r = Core.upgrade(s, target.id, cap);
    if (!r.ok) continue;
    ev('action', {
      type: 'upgrade', dim: target.id, from: from, to: r.tier, cost: r.cost,
      cap: cap, points: s.points, round: s.round, ops: s.ops
    });

    if (s.ops % 3 === 0 && cardsLeft > 0) {
      cardsLeft--;
      var card = pick(Ev.EVENTS);
      var oi = 0;
      for (var k = 0; k < card.options.length; k++) {
        if (Ev.afford(s, card.options[k])) { oi = k; break; }
      }
      Ev.apply(s, card.options[oi]);
      ev('card', {
        id: card.id, title: card.title, option: oi, label: card.options[oi].label,
        cost: card.options[oi].cost || 0, points: s.points,
        tiers: Core.clone(s.tiers)
      });
    }
  }

  var sm = Core.summary(s);
  ev('run_end', {
    title: sm.title.name,
    achievements: sm.achievements.map(function (a) { return a.id; }),
    pointsLeft: s.points, pointsSpent: Core.budget(s),
    ops: s.ops, durationMs: 60000 + Math.floor(Math.random() * 240000),
    tiers: Core.clone(s.tiers), caps: Core.clone(s.caps),
    cards: [], finished: Math.random() > 0.12
  });
  return out;
}

function post(batch) {
  return fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app: 'zju-remake', ver: '0.1.0', batch: batch })
  }).then(function (r) { return r.json(); });
}

(async function () {
  var players = Math.max(1, Math.round(N / 3));
  var uids = [];
  for (var p = 0; p < players; p++) uids.push(uuid());

  var YEARS = (require('../game/config.js').GRADES || []).map(function (g) { return g.id; });

  for (var i = 0; i < N; i++) {
    var uid = pick(uids);
    var year = pick(YEARS);
    var batch = playRun(uid, year);
    try {
      var r = await post(batch);
      if (!r || !r.ok) console.log('  ! 第 ' + (i + 1) + ' 局发送失败', r);
    } catch (e) {
      console.log('  ! 连不上收集服务：' + URL + '，先跑 node tools/collect.js');
      process.exit(1);
    }
    if ((i + 1) % 10 === 0) console.log('  已生成 ' + (i + 1) + ' 局');
  }
  console.log('完成：' + N + ' 局 / ' + players + ' 个玩家 / ' + YEARS.length + ' 个年级 → 看报表：node tools/report.js');
})();
