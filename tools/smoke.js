/* 逻辑冒烟测试：node tools/smoke.js */
var C = require('../game/config.js');
var Core = require('../game/core.js');
var Ev = require('../game/events.js');

var fails = 0;
function ok(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); fails++; }
}
function eq(a, b, msg) { ok(a === b, msg + '  (得到 ' + a + '，期望 ' + b + ')'); }

var G1 = C.ROUND_POINTS[0];

console.log('\n[1] 开局');
var s = Core.createState();
eq(s.points, G1, '第 1 回合发放 ' + G1 + ' 点（不是全部预算）');
eq(s.round, 1, '第 1 回合');
eq(C.INIT_POINTS, C.ROUND_POINTS.reduce(function (a, b) { return a + b; }, 0), '总预算 = 各回合之和');
eq(s.tiers.food, 3, '食 T3');
eq(Core.achievements(s).length, 0, '开局没有成就');
ok(typeof Core.score === 'undefined', '没有 score（评分已移除）');
ok(typeof C.GRADE === 'undefined', '没有 S/A/B/C/D 评级表');

console.log('\n[2] 档位价格');
var s2 = Core.createState();
s2.points = 100;
eq(Core.cost(s2, 'food'), 8, '食 T3→T4 = 8 点');
Core.upgrade(s2, 'food');
eq(Core.cost(s2, 'food'), 14, '食 T4→T5 = 14 点');
var before5 = s2.points;
Core.upgrade(s2, 'food', 'quality');
eq(before5 - s2.points, 14, 'T4→T5 实扣 14');
eq(Core.refund(s2, 'food'), 14, '降一档退 14');
Core.downgrade(s2, 'food');
eq(s2.caps.food, null, '降档后专精清空');
eq(s2.points, before5, '退回后回到原位');

console.log('\n[3] 广度税');
var t2 = Core.createState();
t2.points = 100;
Core.upgrade(t2, 'food');
eq(Core.cost(t2, 'study'), 10, '同回合第 2 个维度：8 + 广度 2');
Core.upgrade(t2, 'study');
eq(Core.taxInfo(t2, 'sport').breadth, 3, '第 3 个维度广度税 3');
eq(Core.taxInfo(t2, 'food').breadth, 0, '同回合继续升同一个维度不收广度税');

console.log('\n[4] 回合并发点数与结转');
var t3 = Core.createState();
t3.points = 6;
Core.endRound(t3);
eq(t3.round, 2, '进入第 2 回合');
eq(t3.points, 6 + C.ROUND_POINTS[1], '剩余 6 点结转 + 本回合发放 = ' + (6 + C.ROUND_POINTS[1]));
eq(t3.roundDims.length, 0, '本回合开工记录清空');

console.log('\n[5] 结转比例');
var saveRatio = C.CARRY_RATIO;
C.CARRY_RATIO = 0.5;
var t4 = Core.createState();
t4.points = 10;
Core.endRound(t4);
eq(t4.points, 5 + C.ROUND_POINTS[1], '比例 0.5：10 → 5，再加本回合额度');
C.CARRY_RATIO = 0;
var t5 = Core.createState();
t5.points = 10;
Core.endRound(t5);
eq(t5.points, C.ROUND_POINTS[1], '比例 0：剩余直接清零');
C.CARRY_RATIO = saveRatio;

console.log('\n[6] 封神要选专精');
var t6 = Core.createState();
t6.points = 100;
Core.upgrade(t6, 'study');
ok(Core.upgrade(t6, 'study').msg === 'need-cap', '不选专精被拒绝');
ok(Core.upgrade(t6, 'study', 'grind').ok, '选专精后可以升 T5');

console.log('\n[7] 撤销');
var before = t6.points;
Core.undo(t6);
eq(t6.tiers.study, 4, '撤销回 T4');
eq(t6.points, before + 14, '撤销退回 14 点');

console.log('\n[8] 回合用完后锁定');
var t7 = Core.createState();
for (var i = 0; i < C.MAX_ROUNDS; i++) Core.endRound(t7);
eq(t7.round, C.MAX_ROUNDS + 1, 'round = ' + (C.MAX_ROUNDS + 1));
ok(Core.isLocked(t7), '已锁定');
ok(!Core.upgrade(t7, 'food').ok, '锁定后不能升级');

console.log('\n[9] 成就与称号');
var t8 = Core.createState();
['food', 'dorm', 'study', 'sport', 'culture', 'move'].forEach(function (k) { t8.tiers[k] = 4; });
eq(Core.achievements(t8).length, 4, '全 T4 → 4 个成就全解锁');
eq(Core.titleOf(t8).name, '教科书级改造', '称号 = 教科书级改造');
t8.tiers.food = 5; t8.tiers.move = 2;
eq(Core.titleOf(t8).name, '偏科的疯子', '有 T5 也有短板 → 偏科的疯子');
['food', 'dorm', 'study', 'sport', 'culture', 'move'].forEach(function (k) { t8.tiers[k] = 5; });
eq(Core.titleOf(t8).name, '紫金港乌托邦', '全 T5 → 紫金港乌托邦');

console.log('\n[10] 存读档');
var raw = Core.save(t6);
var t9 = Core.load(raw);
ok(t9 && t9.tiers.study === 4 && t9.points === t6.points, '存读档一致');
ok(typeof t9.round === 'number', '带回回合数');

console.log('\n[11] 事件');
var e1 = Core.createState();
var opt = Ev.EVENTS[1].options[0];
var p0 = e1.points;
Ev.apply(e1, opt);
eq(e1.points, p0 + 4, '事件 +4 点');
ok(!Ev.afford(e1, { cost: 9999 }), '点数不够时选项不可用');

console.log('\n[12] 全 T4 不可达');
var allT4 = {};
C.DIMS.forEach(function (d) { allT4[d.id] = 4; });
ok(Core.costOfTiers(allT4) > C.INIT_POINTS,
  '全 T4 花费 ' + Core.costOfTiers(allT4) + ' > 总预算 ' + C.INIT_POINTS);

console.log('\n[13] 道具');
ok(C.ITEMS_ENABLED === true, '默认开启道具系统');
ok(C.ITEMS.length >= 2, '有 ' + C.ITEMS.length + ' 种道具');
var it = Core.createState();
eq(Core.itemCount(it, 'up'), 0, '开局没有升档卡');
Core.addItem(it, 'up', 1);
Core.addItem(it, 'x15', 2);
eq(Core.itemCount(it, 'up'), 1, '加一张升档卡');
eq(Core.itemCount(it, 'x15'), 2, '加两张倍率卡');
it.points = 11;
var mul = Core.useMultiply(it, 'x15');
eq(mul.after, 17, '11 × 1.5 = 16.5 → 向上取整 17');
eq(Core.itemCount(it, 'x15'), 1, '用掉一张倍率卡');
var up1 = Core.useFreeUp(it, 'dorm');
ok(up1.ok, '升档卡可用');
eq(it.tiers.dorm, 2, '住 T1 → T2（不花点数）');
eq(Core.itemCount(it, 'up'), 0, '升档卡已消耗');
ok(!Core.useFreeUp(it, 'dorm').ok, '没有卡时不能用');
var it2 = Core.createState();
Core.addItem(it2, 'up');
it2.tiers.food = 5;
ok(!Core.useFreeUp(it2, 'food').ok, '已封神的维度不能再升');
it2.tiers.study = 4;
eq(Core.useFreeUp(it2, 'study').msg, 'need-cap', 'T4→T5 要先选专精');

console.log('\n' + (fails ? '共 ' + fails + ' 项失败' : '全部通过 ✓') + '\n');
process.exit(fails ? 1 : 0);
