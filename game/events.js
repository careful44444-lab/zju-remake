/* 紫金港改造计划 · 事件卡
 * 开局连抽 3 张（不消耗操作、不需要先加点），二选一：花钱保平安 / 硬扛吃后果。
 *
 * 每个选项都是纯数据，管理员可以在后台改：
 *   label      选项文字
 *   cost       选它要花的点数（0/不写 = 免费）
 *   result     结果文案（干净的文字，不要写"预算 +2 点"这种，系统会自动补）
 *   altResult  有条件但没触发时显示的文字
 *   cond       条件：{ dim:'sport', lt:3 } 表示「体 < T3 时才生效」
 *   effect     效果：{ points:-4, tiers:{ food:-1 }, cap:4 }
 *   elseEffect 条件不满足时的效果（一般不写）
 *   item       选它就送一个道具（id 见 config.ITEMS）
 *   random     随机结果：{ p:0.6, resultB:'...', effectB:{...} }
 *              p = 走「上面那套结果」的概率，(1-p) = 走 B。给了 random 就忽略 cond。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'));
  } else {
    var z = root.ZJU || {};
    var mod = factory(z);
    for (var k in mod) root.ZJU[k] = mod[k];
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {

  var DIMS = (Core && Core.DIMS) || [];
  // Node 下 events.js 单独 require 时拿不到 DIMS，从 config 兜底
  if (!DIMS.length && typeof require === 'function') {
    try { DIMS = require('../game/config.js').DIMS; } catch (e) { }
  }

  function bump(s, id, delta, max) {
    var cap = max || 5;
    var t = s.tiers[id];
    var nt = Math.max(1, Math.min(cap, t + delta));
    if (nt === t) return false;
    s.tiers[id] = nt;
    if (nt < 5) s.caps[id] = null;
    return true;
  }

  var EVENTS = [
    {
      id: 'bus', title: '校车又晚点', icon: 'bus',
      when: { dims: [{ id: 'move', max: 2 }] },
      text: '早八的校车晚了 25 分钟。站台上有人在啃早饭，有人在背单词，有人在群里问"有没有人一起走回去"。',
      options: [
        { label: '加钱加密班次', cost: 3, result: '车来了，一次两辆，队伍短了一半。' },
        { label: '算了，忍了', result: '全车的怨气凝结成了一种新的校园文化。', effect: { tiers: { move: -1 } } }
      ]
    },
    {
      id: 'donate', title: '校友捐赠到账', icon: 'money',
      text: '一位不愿透露姓名的 98 级校友给学校打了笔钱，指定用于"改善学生生活"。',
      options: [
        { label: '全部收下', result: '账上多了一笔预算，你可以假装没看见财务处的表情。', effect: { points: 4 } }
      ]
    },
    {
      id: 'fitness', title: '体测周', icon: 'run',
      when: { dims: [{ id: 'sport', max: 3 }] },
      text: '本学期体测开始。一千米、引体向上、坐位体前屈，三件套齐活。',
      options: [
        { label: '请教练特训', cost: 2, result: '教练说你的问题不在腿，在心态。但体测过了。' },
        {
          label: '裸考',
          cond: { dim: 'sport', lt: 3 },
          result: '一千米跑完，你在跑道边重新思考人生。',
          altResult: '场馆够好，你居然轻松过了。什么都没发生。',
          effect: { points: -4 }
        }
      ]
    },
    {
      id: 'hair', title: '食堂吃出头发', icon: 'food',
      text: '一位同学在食堂吃出了头发，照片已经传到了校园墙。评论区正在自动分成三派。',
      options: [
        { label: '全额整改', cost: 5, result: '明厨亮灶 + 全流程抽检。一周后全校都忘了这件事。' },
        {
          label: '让它上热搜',
          result: '学校连夜道歉，食堂连夜整改。你成了校园网红。',
          effect: { points: 2, tiers: { food: -1 } }
        }
      ]
    },
    {
      id: 'course', title: '选课系统崩了', icon: 'pc',
      text: '12:00:00 系统崩溃。12:00:03，教务处的电话被打爆。12:00:05，群里开始流传一张"退学申请表"表情包。',
      options: [
        { label: '找教务哭着求扩容', cost: 3, item: 'up', result: '服务器扩容了，下个学期再也没崩过（这次）。' },
        {
          label: '硬着头皮抢',
          cond: { dim: 'study', lt: 5 },
          result: '课没抢到，学分也没到手。',
          altResult: '你早就拿到预约了，全程围观别人崩溃。什么都没发生。',
          effect: { tiers: { study: -1 } }
        }
      ]
    },
    {
      id: 'influencer', title: '网红来打卡', icon: 'camera',
      text: '一位百万粉博主在校园里拍了一条视频，标题是《国内最美大学没有之一》。',
      options: [
        {
          label: '安排接驳和拍摄许可',
          result: '视频爆了，报考咨询量涨了三成。',
          effect: { tiers: { culture: 1 }, cap: 4 }
        },
        { label: '保持安静', result: '没有游客，没有排队，图书馆还是图书馆。', effect: { points: 2 } }
      ]
    },
    {
      id: 'flood', title: '暴雨淹了紫金港', icon: 'rain',
      text: '一场大雨，路面成河。有人划着充气船去上课，视频在群里转了三圈。',
      options: [
        { label: '做排水改造', cost: 4, item: 'x15', result: '海绵校园上线，下一场雨你甚至没带伞。' },
        { label: '买双雨靴', result: '雨靴销量全校第一。', effect: { tiers: { move: -1 } } }
      ]
    },
    {
      id: 'roomie', title: '宿舍矛盾', icon: 'home',
      text: '室友的闹钟响在 6:30，你的入睡时间是 2:30。第三个室友开始在群里发长文。',
      options: [
        { label: '申请调换', cost: 2, result: '换了宿舍，新室友的闹钟响在 6:00。但你睡得更好了。' },
        { label: '继续磨合', result: '你们达成了一个脆弱的协议，为期两周。', effect: { tiers: { dorm: -1 } } }
      ]
    },
    {
      id: 'bike', title: '共享单车围城', icon: 'bike',
      text: '校门口堆了两千辆共享单车，人行道已经看不见地面。三家运维公司在互相甩锅。',
      options: [
        { label: '统一整治', cost: 3, result: '划了停车区，清了两千辆，路终于能走了。' },
        {
          label: '让它们自生自灭',
          result: '你收了管理费，但路被堵了。',
          effect: { points: 2, tiers: { move: -1 } }
        }
      ]
    },
    {
      id: 'finals', title: '期末周', icon: 'book',
      text: '图书馆的位置在早上 7:00 就满了。有人在便利店门口拿着 iPad 复习，表情平静得像在度假。',
      options: [
        {
          label: '开 24h 自习室', cost: 2,
          result: '通宵自习室开了，灯亮了一整周。',
          effect: { tiers: { study: 1 }, cap: 4 }
        },
        { label: '早点睡', result: '你睡得不错，但 GPA 不太行。', effect: { points: -4 } }
      ]
    },
    {
      id: 'chef', title: '大师傅要跳槽', icon: 'chef',
      when: { dims: [{ id: 'food', min: 3 }] },
      text: '食堂最受欢迎的那个窗口，师傅被隔壁学校挖走了，工资翻了 1.5 倍。',
      options: [
        { label: '涨薪留人', cost: 4, result: '师傅留下来了，还带了个徒弟。队伍又长了十米。' },
        { label: '祝他前程似锦', result: '窗口换了个新人，糖醋里脊再也没有过那个味道。', effect: { tiers: { food: -1 } } }
      ]
    },
    {
      id: 'promo', title: '招生宣传片', icon: 'film',
      when: { rounds: { min: 2 } },
      text: '宣传部想拍一支片子，预算不多，问你有没有什么想法。',
      options: [
        {
          label: '认真拍一条', cost: 3,
          result: '片子火了，评论区在问"这是哪个国家的学校"。',
          effect: { tiers: { culture: 1 }, cap: 4 }
        },
        { label: '用去年的', result: '省下的钱买了新的投影仪。', effect: { points: 1 } }
      ]
    }
  ];

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function drawQueue(n) { return shuffle(EVENTS).slice(0, n || 3); }

  /* 事件触发条件：不写 when 就是任何时候都可能出现
   *   when = {
   *     rounds: { min: 1, max: 3 },              // 只在第几回合之间出现
   *     dims:   [ { id: "move", max: 2 } ],      // 这些维度必须同时落在区间内（min/max 可省略一边）
   *     pointsMin: 6                             // 剩余点数至少要这么多
   *   }
   */
  function matchWhen(s, w) {
    if (!w) return true;
    var r = s.round || 1;
    if (w.rounds) {
      if (w.rounds.min != null && r < w.rounds.min) return false;
      if (w.rounds.max != null && r > w.rounds.max) return false;
    }
    if (w.pointsMin != null && (s.points || 0) < w.pointsMin) return false;
    var ds = w.dims || [];
    for (var i = 0; i < ds.length; i++) {
      var c = ds[i];
      if (!c || !c.id) continue;
      var tv = s.tiers[c.id];
      if (tv == null) continue;
      if (c.min != null && tv < c.min) return false;
      if (c.max != null && tv > c.max) return false;
    }
    return true;
  }

  /* 按当前局势抽一张：排除已经出现过的，排除条件不满足的 */
  function pickEvent(s, used) {
    var u = used || [];
    var pool = [];
    for (var i = 0; i < EVENTS.length; i++) {
      var e = EVENTS[i];
      if (u.indexOf(e.id) >= 0) continue;
      if (!matchWhen(s, e.when)) continue;
      pool.push(e);
    }
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function afford(s, opt) { return !opt.cost || s.points >= opt.cost; }

  function condMet(s, c) {
    if (!c || !c.dim) return true;
    var t = s.tiers[c.dim];
    if (c.lt != null) return t < c.lt;
    if (c.gte != null) return t >= c.gte;
    return true;
  }

  function applyEffect(s, e) {
    if (!e) return;
    if (e.points) Core.addPoints(s, e.points);
    if (e.tiers) {
      Object.keys(e.tiers).forEach(function (id) {
        if (s.tiers[id] == null) return;
        bump(s, id, e.tiers[id], e.cap || 5);
      });
    }
  }

  var NAME = {};
  function dimName(id) {
    if (!NAME[id]) {
      var d = DIMS.filter(function (x) { return x.id === id; })[0];
      NAME[id] = d ? d.name : id;
    }
    return NAME[id];
  }

  // 掷一次随机：返回 'b' 表示走第二种结果
  function rollRandom(opt) {
    if (!opt.random) return null;
    var p = (typeof opt.random.p === 'number') ? opt.random.p : 0.5;
    p = Math.max(0, Math.min(1, p));
    return (Math.random() < p) ? 'a' : 'b';
  }

  // 执行选项：返回 { text, delta, branch }
  // text 是纯文案，delta 是系统自动补的数值变化，branch 是随机走了哪一支
  function apply(s, opt) {
    var before = { p: s.points, t: {} };
    DIMS.forEach(function (d) { before.t[d.id] = s.tiers[d.id]; });
    if (opt.cost) Core.addPoints(s, -opt.cost);

    if (opt.item && Core.addItem) Core.addItem(s, opt.item, 1);

    var branch = rollRandom(opt);
    var met = true, eff, text;
    if (branch === 'b') {
      eff = opt.random.effectB;
      text = opt.random.resultB || '';
    } else {
      met = condMet(s, opt.cond);
      eff = met ? opt.effect : opt.elseEffect;
      text = met ? (opt.result || '') : (opt.altResult || opt.result || '');
    }
    applyEffect(s, eff);

    var bits = [];
    var dp = s.points - before.p;
    if (dp) bits.push('预算 ' + (dp > 0 ? '+' : '') + dp + ' 点');
    DIMS.forEach(function (d) {
      var dt = s.tiers[d.id] - before.t[d.id];
      if (dt) bits.push(d.name + ' ' + (dt > 0 ? '+' : '') + dt + ' 档');
    });

    if (opt.item) {
      var idef = Core.itemDef ? Core.itemDef(opt.item) : null;
      bits.push('获得「' + (idef ? idef.name : opt.item) + '」');
    }
    if (opt.cost && !bits.length) bits.push('花了 ' + opt.cost + ' 点');
    return { text: text, delta: bits.join('，'), branch: branch };
  }

  // 兼容旧调用：只要字符串
  function applyText(s, opt) {
    var r = apply(s, opt);
    return r.text + (r.delta ? '（' + r.delta + '）' : '');
  }

  return {
    EVENTS: EVENTS, drawQueue: drawQueue, afford: afford, apply: applyText, applyResult: apply,
    rollRandom: rollRandom, bump: bump,
    matchWhen: matchWhen, pickEvent: pickEvent
  };
});
