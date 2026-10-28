/* 紫金港改造计划 · 核心逻辑
 * 纯状态机，不碰 DOM、不碰 wx。浏览器 / Node / 小程序共用。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'));
  } else {
    var z = root.ZJU || {};
    var mod = factory(z);
    for (var k in mod) root.ZJU[k] = mod[k];
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {

  var DIMS = C.DIMS;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function createState() {
    var tiers = {}, caps = {}, relief = {};
    DIMS.forEach(function (d) {
      tiers[d.id] = d.init;
      caps[d.id] = null;
      relief[d.id] = false;
    });
    return {
      points: grantFor(1),
      spent: 0,
      round: 1,
      items: {},
      roundDims: [],
      breadthPaid: {},
      roundBase: {},          // 本回合开始时这个维度是几档（用来判断「降回原点」）
      tiers: tiers,
      caps: caps,
      relief: relief,
      bonus: 0,
      ops: 0,
      events: 0,
      history: [],
      finished: false
    };
  }

  // 第 r 回合发多少点（超出数组就沿用最后一个值）
  function grantFor(r) {
    var arr = C.ROUND_POINTS || [C.INIT_POINTS];
    var v = arr[r - 1];
    return typeof v === "number" ? v : arr[arr.length - 1];
  }

  function snapshot(s) {
    // 注意：events 不进快照，避免「撤销 → 重做」重复触发同一张事件卡
    return JSON.stringify({
      points: s.points, spent: s.spent, round: s.round, items: s.items, roundDims: s.roundDims, breadthPaid: s.breadthPaid, roundBase: s.roundBase,
      tiers: s.tiers, caps: s.caps,
      relief: s.relief, bonus: s.bonus, ops: s.ops
    });
  }

  function push(s) {
    s.history.push(snapshot(s));
    if (s.history.length > 80) s.history.shift();
  }

  function dim(id) {
    for (var i = 0; i < DIMS.length; i++) if (DIMS[i].id === id) return DIMS[i];
    return null;
  }

  // ---- 两种税 ----
  // 取某个维度的一套价格：单独配过就用单独的，否则用统一的 STEP_COST
  function priceArr(dimId) {
    var byDim = C.STEP_COST_DIMS;
    var one = byDim && dimId ? byDim[dimId] : null;
    if (one && one.length) return one;
    return C.STEP_COST || [3, 5, 8, 14];
  }
  // 升到第 to 档的价钱（to = 2..5）。
  // 支持 stepPrice(dimId, to) 和旧的 stepPrice(to) 两种写法。
  function stepPrice(dimId, to) {
    if (typeof dimId === 'number') { to = dimId; dimId = null; }
    if (to <= 1) return 0;
    var arr = priceArr(dimId);
    var v = arr[to - 2];
    return typeof v === 'number' ? v : arr[arr.length - 1];
  }
  // 广度税（对数）：本回合已经开了 n 个维度，再开新的 → + round(B * log2(1+n))
  function breadthTax(n) {
    if (n <= 0) return 0;
    return Math.round((C.BREADTH_BASE || 0) * Math.log(1 + n) / Math.LN2);
  }

  function roundDims(s) { return s.roundDims || []; }
  function inRound(s, id) { return roundDims(s).indexOf(id) >= 0; }
  function roundsLeft(s) { return (C.MAX_ROUNDS || 99) - (s.round || 1); }
  function isLocked(s) { return (s.round || 1) > (C.MAX_ROUNDS || 99); }

  // 这一档的广度税：本回合第一次开这个维度才收
  function breadthFor(s, id) {
    if (inRound(s, id)) return 0;
    return breadthTax(roundDims(s).length);
  }

  // 升这一档要多少点（深度税 + 广度税）
  function cost(s, id) {
    var t = s.tiers[id];
    if (t >= 5) return 0;
    return stepPrice(id, t + 1) + breadthFor(s, id);
  }

  // 降档退还这一步当初付的钱（广度税按本回合实际付过的退）
  function refund(s, id) {
    var t = s.tiers[id];
    if (t <= 1) return 0;
    var paid = (s.breadthPaid && s.breadthPaid[id]) || 0;
    return stepPrice(id, t) + paid;
    // 降回本回合起点 → 不再算「已动工」
    if (s.roundBase && s.tiers[id] === s.roundBase[id]) {
      s.roundDims = (s.roundDims || []).filter(function (x) { return x !== id; });
    }
  }

  // 当前状态里两种税各占多少（给界面显示用）
  function taxInfo(s, id) {
    var t = s.tiers[id];
    if (t >= 5) return { step: 0, breadth: 0, total: 0 };
    var sp = stepPrice(id, t + 1), br = breadthFor(s, id);
    return { step: sp, breadth: br, total: sp + br };
  }

  // 升级。tier 4 -> 5 必须带专精 capId
  function upgrade(s, id, capId) {
    if (isLocked(s)) return { ok: false, msg: '回合已用完，点「提交」看结果' };
    var t = s.tiers[id];
    if (t >= 5) return { ok: false, msg: '已经是「封神」了' };
    var c = cost(s, id);
    if (s.points < c) return { ok: false, msg: '点数不够，还差 ' + (c - s.points) + ' 点' };
    if (t === 4 && !capId) return { ok: false, msg: 'need-cap' };
    push(s);
    // 本回合第一次开这个维度：收广度税，记下来（降档时原样退）
    if (!inRound(s, id)) {
      s.roundDims = roundDims(s).concat([id]);
      s.breadthPaid = s.breadthPaid || {};
      s.roundBase = s.roundBase || {};
      s.roundBase[id] = t;                       // 本回合从这个档位起跑
      s.breadthPaid[id] = breadthTax(roundDims(s).length - 1);
    }
    s.points -= c;
    s.spent = (s.spent || 0) + c;
    s.tiers[id] = t + 1;
    if (s.tiers[id] === 5) s.caps[id] = capId || null;
    s.ops += 1;
    return { ok: true, cost: c, tier: s.tiers[id] };
  }

  // 结束本回合：广度税清零，进入下一回合
  function endRound(s) {
    if (isLocked(s)) return { ok: false, msg: '已经是最后一回合了' };
    push(s);
    s.round = (s.round || 1) + 1;
    s.roundDims = [];
    s.breadthPaid = {};
    s.roundBase = {};
    // 剩余点数按比例结转，再加上新回合的额度
    if (!isLocked(s)) {
      var ratio = (typeof C.CARRY_RATIO === "number") ? C.CARRY_RATIO : 1;
      var keep = Math.floor(s.points * ratio + 1e-9);
      s.points = keep + grantFor(s.round);
    }
    return { ok: true, round: s.round, locked: isLocked(s) };
  }

  // 降档，全额返还已投入点数（含两种税）
  function downgrade(s, id) {
    if (isLocked(s)) return { ok: false, msg: '回合已用完，点「提交」看结果' };
    var t = s.tiers[id];
    if (t <= 1) return { ok: false, msg: '已经到底了' };
    push(s);
    var r = refund(s, id);
    s.points += r;
    s.spent = (s.spent || 0) - r;
    s.tiers[id] = t - 1;
    if (t === 5) s.caps[id] = null;
    // 降回本回合开始时的档位 = 这个维度在本回合「没动过」：移出已开工列表，广度税作废
    if (s.roundBase && s.roundBase[id] != null && s.tiers[id] <= s.roundBase[id]) {
      s.roundDims = roundDims(s).filter(function (x) { return x !== id; });
      if (s.breadthPaid) delete s.breadthPaid[id];
      delete s.roundBase[id];
    }
    // 阵痛补偿（默认关闭，见 config）
    if (C.RELIEF > 0 && !s.relief[id] && s.tiers[id] < dim(id).init) {
      s.relief[id] = true;
      s.points += C.RELIEF;
      r += C.RELIEF;
    }
    s.ops += 1;
    return { ok: true, refund: r, tier: s.tiers[id] };
  }

  function canUndo(s) { return s.history.length > 0; }

  function undo(s) {
    if (!s.history.length) return { ok: false, msg: '没有可撤销的操作' };
    var prev = JSON.parse(s.history.pop());
    s.points = prev.points; s.spent = prev.spent || 0;
    s.round = prev.round || 1; s.items = prev.items || {}; s.roundDims = prev.roundDims || []; s.breadthPaid = prev.breadthPaid || {};
    s.tiers = prev.tiers; s.caps = prev.caps;
    s.relief = prev.relief; s.bonus = prev.bonus; s.ops = prev.ops;
    return { ok: true };
  }

  // ---- 事件对状态的影响 ----
  function addPoints(s, n) { s.points = Math.max(0, s.points + n); }

  function shiftTier(s, id, delta) {
    var t = s.tiers[id];
    var nt = Math.max(1, Math.min(5, t + delta));
    if (nt === t) return false;
    s.tiers[id] = nt;
    if (nt < 5) s.caps[id] = null;
    if (nt === 5 && !s.caps[id]) s.caps[id] = null; // 事件白给的 T5 没有专精加分
    return true;
  }

  function addBonus(s, n) { s.bonus += n; }

  // ---- 评价：只有「成就」和「称号」，没有分数 ----
  function tierName(n) { return C.TIERS[n - 1]; }

  // 一条子句是否成立
  function clauseOK(s, c) {
    if (!c || !c.t) return true;
    var ids;
    if (!c.of || c.of === "*") ids = DIMS.map(function (d) { return d.id; });
    else ids = Array.isArray(c.of) ? c.of : [c.of];
    if (!ids.length) return true;

    if (c.t === "top") {
      var id = ids[0], v = s.tiers[id] || 0, higher = false;
      DIMS.forEach(function (d) { if (d.id !== id && (s.tiers[d.id] || 0) >= v) higher = true; });
      return !higher;
    }
    var hit = ids.filter(function (id) {
      var v = s.tiers[id] || 0;
      if (c.min != null && v < c.min) return false;
      if (c.max != null && v > c.max) return false;
      return true;
    }).length;
    if (c.t === "every") return hit === ids.length;
    if (c.t === "count") return hit >= (c.n || 1);
    return false;
  }

  // 一整套条件（子句之间是「并且」）
  function ruleOK(s, cond) {
    var cs = cond || [];
    for (var i = 0; i < cs.length; i++) {
      var c = { t: cs[i].t, of: cs[i].of, min: cs[i].min, max: cs[i].max, n: cs[i].n };
      if (!clauseOK(s, c)) return false;
    }
    return true;
  }

  function achievements(s) {
    return (C.ACHIEVEMENTS || []).filter(function (a) { return ruleOK(s, a.cond); })
      .map(function (a) { return { id: a.id, name: a.name, desc: a.desc }; });
  }

  function titleOf(s) {
    var list = C.TITLES || [];
    for (var i = 0; i < list.length; i++) {
      if (ruleOK(s, list[i].cond)) return { id: list[i].id, name: list[i].name, line: list[i].line };
    }
    return { id: "", name: "改造完成", line: "" };
  }

  function summary(s) {
    var dims = {}, ups = 0;
    DIMS.forEach(function (d) {
      var t = s.tiers[d.id];
      dims[d.id] = { tier: t, steps: Math.max(0, t - d.init) };
      ups += dims[d.id].steps;
    });
    return { dims: dims, steps: ups, achievements: achievements(s), title: titleOf(s) };
  }

  // 给定最终档位，估算完成它最少要花多少点。
  // 回合制的关系：最多 4 个维度可以「一个回合开一个」，不收广度税；
  // 第 5、第 6 个维度只能挤进已有回合里，按对数收广度税。
  function costOfTiers(tiers) {
    var work = [];
    DIMS.forEach(function (d) {
      var steps = (tiers[d.id] || 0) - d.init;
      if (steps > 0) work.push({ d: d, steps: steps });
    });
    work.sort(function (a, b) { return b.steps - a.steps; });
    var total = 0;
    work.forEach(function (w, i) {
      // i < 4：独占一个回合，不罚；i >= 4：挤进同一个回合，第 5 个 +breadth(1)，第 6 个 +breadth(2)
      var br = i < (C.MAX_ROUNDS || 4) ? 0 : breadthTax(i - (C.MAX_ROUNDS || 4) + 1);
      for (var t = w.d.init + 1; t <= tiers[w.d.id]; t++) {
        total += stepPrice(w.d.id, t) + br;
      }
    });
    return total;
  }

  // ---- 道具 ----
  function addItem(s, id, n) {
    if (!id) return;
    s.items = s.items || {};
    s.items[id] = (s.items[id] || 0) + (n || 1);
  }
  function itemCount(s, id) { return (s.items && s.items[id]) || 0; }
  function itemDef(id) {
    var list = C.ITEMS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  // 用掉一个道具（先扣再执行，失败会还回去）
  function consume(s, id) {
    if (itemCount(s, id) <= 0) return false;
    s.items[id] -= 1;
    return true;
  }
  // 升档卡：免费升一档，不花点数、不触发广度税
  function useFreeUp(s, dimId, capId) {
    if (isLocked(s)) return { ok: false, msg: "回合已用完" };
    var t = s.tiers[dimId];
    if (t == null) return { ok: false, msg: "没有这个维度" };
    if (t >= 5) return { ok: false, msg: "已经是「封神」了" };
    if (t === 4 && !capId) return { ok: false, msg: "need-cap" };
    if (!consume(s, "up")) return { ok: false, msg: "没有升档卡" };
    push(s);
    s.tiers[dimId] = t + 1;
    if (s.tiers[dimId] === 5) s.caps[dimId] = capId || null;
    s.ops += 1;
    return { ok: true, tier: s.tiers[dimId] };
  }
  // 倍率卡：剩余点数 × factor，向上取整
  function useMultiply(s, id) {
    var def = itemDef(id);
    var f = (def && def.factor) || 1.5;
    if (!consume(s, id)) return { ok: false, msg: "没有这个道具" };
    push(s);
    var before = s.points;
    s.points = Math.ceil(s.points * f);
    return { ok: true, before: before, after: s.points };
  }

  // 净投入点数：直接记账（升档加、降档减），不靠公式反推——两种税让反推不可靠
  function budget(s) {
    return typeof s.spent === 'number' ? s.spent : 0;
  }

  function save(s) {
    try { return JSON.stringify({ v: 1, s: s }); } catch (e) { return null; }
  }

  function load(raw) {
    try {
      var o = JSON.parse(raw);
      if (!o || !o.s || !o.s.tiers) return null;
      var s = o.s;
      // 兼容性修补
      DIMS.forEach(function (d) {
        if (typeof s.tiers[d.id] !== 'number') s.tiers[d.id] = d.init;
        if (typeof s.spent !== 'number') s.spent = 0;
        if (typeof s.round !== 'number') s.round = 1;
        if (!Array.isArray(s.roundDims)) s.roundDims = [];
        if (!s.breadthPaid) s.breadthPaid = {};
        if (!(d.id in s.caps)) s.caps[d.id] = null;
        if (!(d.id in s.relief)) s.relief[d.id] = false;
      });
      if (typeof s.bonus !== 'number') s.bonus = 0;
      if (typeof s.ops !== 'number') s.ops = 0;
      if (typeof s.events !== 'number') s.events = 0;
      if (!Array.isArray(s.history)) s.history = [];
      return s;
    } catch (e) { return null; }
  }

  return {
    clone: clone,
    createState: createState,
    dim: dim,
    cost: cost,
    refund: refund,
    taxInfo: taxInfo,
    endRound: endRound,
    addItem: addItem,
    itemCount: itemCount,
    itemDef: itemDef,
    useFreeUp: useFreeUp,
    useMultiply: useMultiply,
    grantFor: grantFor,
    roundGrant: function (s) { return grantFor(s.round || 1); },
    isLocked: isLocked,
    roundsLeft: roundsLeft,
    inRound: inRound,
    costOfTiers: costOfTiers,
    upgrade: upgrade,
    downgrade: downgrade,
    canUndo: canUndo,
    undo: undo,
    addPoints: addPoints,
    shiftTier: shiftTier,
    addBonus: addBonus,
    shiftTierClamp: shiftTier,
    summary: summary,
    achievements: achievements,
    titleOf: titleOf,
    ruleOK: ruleOK,
    tierName: tierName,
    budget: budget,

    save: save,
    load: load,
    snapshot: snapshot
  };
});
