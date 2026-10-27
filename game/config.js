/* 紫金港改造计划 · 全局配置
 * 所有数值集中在这里，改完刷新即可。 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.ZJU = root.ZJU || {};
    for (var k in mod) root.ZJU[k] = mod[k];
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // 五个档位：数字越小越差
  var TIERS = [
    { n: 1, name: '掉队', peer: '不如省属重点' },
    { n: 2, name: '落后', peer: '双非里算好的' },
    { n: 3, name: '合格', peer: '985 中游' },
    { n: 4, name: '领先', peer: '华五前列' },
    { n: 5, name: '封神', peer: '全国第一' }
  ];

  // 六个维度。angle 决定在地图上的方位（-90 = 正上方）
  // 初始档比上一版整体低一档，腾出来的点数折算成开局预算（见 INIT_POINTS）
  var DIMS = [
    { id: 'food',    name: '食', sub: '食堂与餐饮', init: 3, angle: -90,  motif: 'steam' },
    { id: 'dorm',    name: '住', sub: '宿舍与生活区', init: 1, angle: -30, motif: 'window' },
    { id: 'study',   name: '学', sub: '课程与自习', init: 3, angle: 30,   motif: 'book' },
    { id: 'sport',   name: '体', sub: '场馆与体测', init: 2, angle: 90,   motif: 'track' },
    { id: 'culture', name: '文', sub: '社团与风景', init: 2, angle: 150,  motif: 'stage' },
    { id: 'move',    name: '行', sub: '校车与通勤', init: 1, angle: 210,  motif: 'bus' }
  ];

  // 开局要选的年级。id 会随每个事件上报，统计按它分组。
  var GRADES = [
    { id: 'y1', name: '大一', desc: '刚来，什么都新鲜' },
    { id: 'y2', name: '大二', desc: '开始有点意见了' },
    { id: 'y3', name: '大三', desc: '什么都经历过，什么都想改' },
    { id: 'y4', name: '大四', desc: '要走了，只想留下点东西' }
  ];

  // 每一档的价钱。
  // 原来是「基础价 + 深度税」两段相加，现在合并成一个数，可在后台直接改：
  //   STEP_COST[0] = 升到 T2 要多少点
  //   STEP_COST[1] = 升到 T3
  //   STEP_COST[2] = 升到 T4
  //   STEP_COST[3] = 升到 T5
  // 这组数对所有维度都一样（不管从哪一档开始，升到同一档同价），
  // 所以「起点低的维度更贵」只体现在需要的步数更多。
  var STEP_COST = [3, 5, 8, 14];

  // 每回合发放的点数（可在后台改，长度 = 回合数）。
  // 关键：**剩余点数不清零**，上一回合没花完的会累积到下一回合。
  // 现在的 14/14/15/15 加起来是 58，跟原来的一次性预算等价。
  var ROUND_POINTS = [14, 14, 15, 15];
  var INIT_POINTS = ROUND_POINTS.reduce(function (a, b) { return a + b; }, 0);

  // 回合结束时，没花完的点数先乘这个系数再带进下一回合：
  //   1   = 全部保留（不打折）
  //   0.5 = 剩一半
  //   0   = 直接清零
  var CARRY_RATIO = 1;

  // 「阵痛补偿」：首次跌破初始档额外返点。0 = 关闭。
  // 默认关闭：模拟显示它会把预算变相抬高（约 +60%），且最优解退化成
  // 「每个维度反复升降涮点数」，既不紧也不好玩。
  var RELIEF = 0;

  // 广度税（对数）：只在「同一回合里又开了一个新维度」时收一次。
  //   本回合已开工 n 个维度，再开新的 → + round(B * log2(1+n))
  //   换回合会清零 —— 所以它有另一层含义：N 个回合 = 最多 N 个维度可以并行推进，
  //   想同时改更多的维度，就得挨罚。
  var BREADTH_BASE = 2;
  var MAX_ROUNDS = ROUND_POINTS.length;

  // 成就与称号：都是「规则数据」，可在后台增删改。
  // 条件 cond 是一组子句，必须全部成立：
NaN
NaN
  //   { t:'top',   of:['food'] }                      这个维度是唯一最高的
  var ACHIEVEMENTS = [
    { id: 'life',   name: '生活区天堂', desc: '食和住都到 T4',   cond: [{ t: 'every', of: ['food', 'dorm'], min: 4 }] },
    { id: 'edu',    name: '五育并举',   desc: '学和体都到 T4',   cond: [{ t: 'every', of: ['study', 'sport'], min: 4 }] },
    { id: 'city',   name: '城市校园',   desc: '行和文都到 T4',   cond: [{ t: 'every', of: ['move', 'culture'], min: 4 }] },
    { id: 'noweak', name: '没有短板',   desc: '六项都不低于 T3', cond: [{ t: 'every', of: '*', min: 3 }] }
  ];

  // 称号：从上往下匹配，**第一条成立的**就是结果；最后一条 cond 为空 = 兜底。
  var TITLES = [
    { id: 'utopia', name: '紫金港乌托邦', line: '你把浙大改成了一所学校该有的样子，也改成了一个传说。', cond: [{ t: 'every', of: '*', min: 5 }] },
    { id: 'reverse', name: '反向改造第一人', line: '六个维度，你砍了六个。学校还在，你心态已经没了。', cond: [{ t: 'every', of: '*', max: 2 }] },
    { id: 'textbook', name: '教科书级改造', line: '没有短板，没有短板，还是没有短板。评委会想给你发个奖。', cond: [{ t: 'every', of: '*', min: 4 }] },
    { id: 'lopsided', name: '偏科的疯子', line: '你把一个维度改到了全国第一，然后把两个维度改没了。', cond: [{ t: 'count', of: '*', n: 1, min: 5 }, { t: 'count', of: '*', n: 1, max: 2 }] },
    { id: 'hexagon', name: '六边形战士', line: '每一项都及格，每一项都封不了神。稳，但没什么可吹的。', cond: [{ t: 'every', of: '*', min: 3 }] },
    { id: 'solo', name: '单项封神', line: '有一项，你可以吹一辈子。别的，能过就行。', cond: [{ t: 'count', of: '*', n: 1, min: 5 }] },
    { id: 'foodie', name: '你把钱都花在吃上了', line: '食堂封神，宿舍漏水，校车照旧。人生总要有所取舍。', cond: [{ t: 'top', of: ['food'] }, { t: 'count', of: ['dorm', 'move'], n: 1, max: 2 }] },
    { id: 'meh', name: '就这样吧，反正也要毕业了', line: '改造这个词，有时候只是一种美好的愿望。', cond: [{ t: 'every', of: '*', max: 3 }] },
    { id: 'minor', name: '小修小补的这一年', line: '没改出什么大动静，但你至少试过了。', cond: [] }
  ];

  // ---- 道具系统 ----
  // ITEMS_ENABLED = false 时，事件不会发道具、界面也不显示道具条。
  var ITEMS_ENABLED = true;
  var ITEMS = [
    { id: 'up',  name: '升档卡',  desc: '免费给任意一个维度升一档', type: 'freeUp' },
    { id: 'x15', name: '1.5 倍卡', desc: '剩余点数 ×1.5，向上取整', type: 'multiply', factor: 1.5 }
  ];

  var SPECIAL = {};

  // 数据上报。endpoint 留空 = 只写本地队列，不发网络。
  // 想收数据：把收集服务地址填进来（本地测试 tools/collect.js 会给一个），
  // 或者用 ?collect=https://xxx/collect 临时指定。
  var TRACK = {
    endpoint: '',
    enabled: true,
    debug: false,
    version: '0.1.0'
  };

  return {
    TIERS: TIERS,
    GRADES: GRADES,
    DIMS: DIMS,

    INIT_POINTS: INIT_POINTS,
    ROUND_POINTS: ROUND_POINTS,
    CARRY_RATIO: CARRY_RATIO,
    STEP_COST: STEP_COST,
    RELIEF: RELIEF,

    BREADTH_BASE: BREADTH_BASE,
    MAX_ROUNDS: MAX_ROUNDS,
    ACHIEVEMENTS: ACHIEVEMENTS,
    TITLES: TITLES,
    ITEMS_ENABLED: ITEMS_ENABLED,
    ITEMS: ITEMS,
    TRACK: TRACK
  };
});
