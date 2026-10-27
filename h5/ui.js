/* 紫金港改造计划 · 浏览器界面层 */
(function () {
  'use strict';

  var Z = window.ZJU;
  var DIMS = Z.DIMS, CONTENT = Z.CONTENT, TIERS = Z.TIERS;
  var KEY = 'zju.remake.v1';

  var state = null, scene = null, queue = [], sel = null, muted = false, toastTimer = null;
  var Track = null, runStartTs = 0, cardsUsed = [], lastAction = null;
  var sheetOpenedAt = 0;   // 用来吃掉「打开面板那一下」的后续 click

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, txt) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (txt !== undefined) d.textContent = txt;
    return d;
  }
  function show(id) {
    // 通用：所有 .screen 里只有 id 匹配的显示（新增屏幕不用再改这里）
    var all = document.querySelectorAll(".screen");
    for (var i = 0; i < all.length; i++) all[i].classList.toggle("active", all[i].id === id);
  }

  /* 按钮点击：斜切白光扫过，动画放完再执行回调 */
  function triggerFlash(el2, callback, delay) {
    if (!el2) { if (callback) callback(); return; }
    if (el2.classList.contains("flashing")) return;
    el2.classList.add("flashing");
    if (!muted) beep(880, 0.05, "triangle", 0.02);
    setTimeout(function () {
      el2.classList.remove("flashing");
      if (callback) callback();
    }, delay || 340);
  }

  /* ----------------------------- 音效 ----------------------------- */
  var ac = null;
  function beep(freq, dur, type, vol) {
    if (muted) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ac) ac = new AC();
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, ac.currentTime);
      g.gain.linearRampToValueAtTime(vol || 0.05, ac.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + (dur || 0.16));
      o.connect(g); g.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + (dur || 0.16) + 0.02);
    } catch (e) { /* 忽略 */ }
  }
  function sfxUp() { beep(520, 0.1, 'triangle', 0.05); setTimeout(function () { beep(780, 0.14, 'triangle', 0.045); }, 70); }
  function sfxDown() { beep(420, 0.12, 'sawtooth', 0.03); setTimeout(function () { beep(260, 0.16, 'sawtooth', 0.03); }, 70); }
  function sfxTap() { beep(660, 0.05, 'sine', 0.03); }

  /* ----------------------------- 数据上报 ----------------------------- */
  function initTrack() {
    Track = Z.Track;
    if (!Track) return;
    var qm = /collect=([^&]+)/.exec(location.search);
    Track.configure({
      endpoint: qm ? decodeURIComponent(qm[1]) : (Z.TRACK.endpoint || ''),
      enabled: Z.TRACK.enabled !== false && !/notrack=1/.test(location.search),
      debug: Z.TRACK.debug,
      version: Z.TRACK.version,
      env: 'h5'
    });
    window.__zjuTrack = Track;
  }

  function trackStart(mode) {
    if (!Track) return;
    runStartTs = Date.now();
    cardsUsed = [];
    lastAction = null;
    Track.startRun({
      mode: mode,
      year: state.grade || null,
      points: state.points,
      tiers: Z.clone(state.tiers)
    });
  }

  /* ---------------------- 数值覆盖（设置页的修改） ---------------------- */
  function applyConfigOverride(o) {
    if (!o) return;
    if (typeof o.points === "number") Z.INIT_POINTS = o.points;
    if (typeof o.rounds === "number") Z.MAX_ROUNDS = o.rounds;
    if (Object.prototype.toString.call(o.roundPoints) === "[object Array]" && o.roundPoints.length) {
      Z.ROUND_POINTS = o.roundPoints.slice();
      Z.MAX_ROUNDS = Z.ROUND_POINTS.length;
      Z.INIT_POINTS = Z.ROUND_POINTS.reduce(function (a, b) { return a + b; }, 0);
    }
    if (typeof o.carryRatio === "number") Z.CARRY_RATIO = Math.max(0, Math.min(1, o.carryRatio));
    if (typeof o.itemsEnabled === "boolean") Z.ITEMS_ENABLED = o.itemsEnabled;
    if (typeof o.relics === "boolean") Z.RELICS = o.relics;
    if (o.stepCostDims && typeof o.stepCostDims === "object") Z.STEP_COST_DIMS = o.stepCostDims;
    else if (o.stepCostDims === null) Z.STEP_COST_DIMS = null;
    if (Object.prototype.toString.call(o.items) === "[object Array]" && o.items.length) Z.ITEMS = o.items;
    if (Object.prototype.toString.call(o.stepCost) === "[object Array]" && o.stepCost.length === 4) {
      Z.STEP_COST = o.stepCost.map(function (v) { return Math.max(0, Math.round(v)); });
    }
    if (typeof o.breadthBase === "number") Z.BREADTH_BASE = o.breadthBase;
    if (o.inits) {
      Z.DIMS.forEach(function (d) {
        var v = o.inits[d.id];
        if (typeof v === "number" && v >= 1 && v <= 5) d.init = Math.round(v);
      });
    }
  }

  function loadConfigOverride() {
    if (window.__ZJU_CONFIG__) { applyConfigOverride(window.__ZJU_CONFIG__); return Promise.resolve(); }
    try {
      return fetch("/config-edit", { cache: "no-store" }).then(function (r) { return r.json(); })
        .then(function (d) { applyConfigOverride(d && d.current); }).catch(function () { });
    } catch (e) { return Promise.resolve(); }
  }

  /* ---------------------- 文案覆盖（编辑器的修改） ---------------------- */
  function applyOverrides(data) {
    if (!data) return;
    if (data.achievements && data.achievements.length) Z.ACHIEVEMENTS = data.achievements;
    if (data.titles && data.titles.length) Z.TITLES = data.titles;
    if (!data.content) return;
    Object.keys(data.content).forEach(function (k) {
      if (!CONTENT[k]) return;
      var src = data.content[k];
      (src.tiers || []).forEach(function (t, i) {
        var b = CONTENT[k].tiers[i];
        if (!b) return;
        if (t.title != null) b.title = t.title;
        if (t.desc != null) b.desc = t.desc;
        if (t.tags && t.tags.length) b.tags = t.tags;
      });
      (src.caps || []).forEach(function (t, i) {
        var b = CONTENT[k].caps[i];
        if (!b) return;
        if (t.name != null) b.name = t.name;
        if (t.desc != null) b.desc = t.desc;
      });
    });
    (data.events || []).forEach(function (e) {
      var list = Z.EVENTS || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id !== e.id) continue;
        if (e.title != null) list[i].title = e.title;
        if (e.text != null) list[i].text = e.text;
        if (e.when !== undefined) list[i].when = e.when;
        (e.options || []).forEach(function (o, k) {
          if (!list[i].options[k]) return;
          if (typeof o === 'string') { list[i].options[k].label = o; return; }
          Object.keys(o).forEach(function (key) { list[i].options[k][key] = o[key]; });
        });
        break;
      }
    });
  }

  function loadOverrides() {
    if (window.__ZJU_CONTENT__) { applyOverrides(window.__ZJU_CONTENT__); return Promise.resolve(); }
    try {
      return fetch("/content-edit", { cache: "no-store" }).then(function (r) { return r.json(); })
        .then(applyOverrides).catch(function () { });
    } catch (e) { return Promise.resolve(); }
  }

  /* ----------------------------- 渲染 ----------------------------- */
  function refresh() {
    var sm = Z.summary(state);
    $('pts').textContent = state.points;
    $('ach').textContent = sm.achievements.length;
    $('hud').classList.remove('flash');
    void $('hud').offsetWidth;
    $('hud').classList.add('flash');

    var ids = sm.achievements.map(function (a) { return a.id; });
    var s2 = { tiers: state.tiers, caps: state.caps, synergyIds: ids };
    scene.setState(s2);
    renderStrip();
    renderRound();
    renderItems();
    $('btnUndo').style.opacity = state.history.length ? 1 : 0.35;

    if (state.points < 2 && !sel) {
      var h = $('hint');
      h.textContent = '点数用完了 · 点右上角「提交」看结果';
      h.style.opacity = 1;
    }
  }

  function renderItems() {
    var bar = $("itemBar");
    if (!bar) return;
    bar.innerHTML = "";
    if (!Z.ITEMS_ENABLED || !Z.ITEMS) return;
    Z.ITEMS.forEach(function (def) {
      var n = Z.itemCount ? Z.itemCount(state, def.id) : 0;
      if (!n) return;
      var b = el("button", "item-chip");
      b.innerHTML = "<b>" + def.name + "</b>" + (n > 1 ? "<span class=\"cnt\">×" + n + "</span>" : "");
      b.title = def.desc || "";
      b.addEventListener("click", function () { useItem(def); });
      bar.appendChild(b);
    });
  }

  function useItem(def) {
    if (def.type === "multiply") {
      var r = Z.useMultiply(state, def.id);
      if (!r.ok) { toast(r.msg); return; }
      sfxUp();
      toast(def.name + " 生效：" + r.before + " → " + r.after + " 点");
      if (Track) Track.action({ type: "item", item: def.id, before: r.before, after: r.after, points: state.points, round: state.round });
      persist(); refresh(); updateSheet();
      return;
    }
    if (def.type === "freeUp") {
      pendingItem = def.id;
      closeSheet();
      toast("点一个地块，用「" + def.name + "」免费升一档");
      return;
    }
  }

  function renderRound() {
    var max = Z.MAX_ROUNDS || 4;
    var r = state.round || 1;
    var locked = Z.isLocked ? Z.isLocked(state) : false;
    var dims = (state.roundDims || []).map(function (id) { return Z.dim(id).name; });

    $('roundInfo').innerHTML = locked
      ? '四个回合都用完了 · 不能再改，点右边结算'
      : (r >= max
        ? '第 <b>' + r + '/' + max + '</b> 回合 · <b>最后一回合</b>，改完直接提交'
        : '第 <b>' + r + '/' + max + '</b> 回合' +
          (dims.length ? ' · 本回合已开工 <b>' + dims.join('、') + '</b>' : ' · 本回合还没动工'));

    var btn = $('btnRound');
    var isLast = r >= max;                       // 最后一回合没有「结束回合」这一步
    btn.textContent = (locked || isLast) ? '提交方案' : '结束本回合';
    btn.classList.toggle('final', locked || isLast);
  }

  function nextRound() {
    if (Z.isLocked(state)) { endRun(); return; }
    // 最后一回合没有「结束回合」，直接提交
    if ((state.round || 1) >= (Z.MAX_ROUNDS || 4)) { endRun(); return; }
    var r = Z.endRound(state);
    if (!r.ok) { toast(r.msg); return; }
    beep(620, 0.06, 'sine', 0.03);
    persist();
    refresh();
    updateSheet();
    var grant = Z.grantFor ? Z.grantFor(r.round) : 0;
    if (r.locked) {
      toast('回合用完了，点「提交方案」看结果');
    } else if (state.events < eventTotal()) {
      // 除最后一回合外，每次回合结束都插一张事件卡
      pendingToast = '第 ' + r.round + ' 回合开始 · 本回合 +' + grant + ' 点';
      setTimeout(function () { openEvent(); }, 280);
    } else {
      toast('第 ' + r.round + ' 回合开始 · 本回合 +' + grant + ' 点');
    }
  }

  function renderStrip() {
    var wrap = $('strip');
    if (!wrap.children.length) {
      DIMS.forEach(function (d) {
        var p = el('div', 'pill');
        p.dataset.id = d.id;
        p.innerHTML = '<div class="pc">' + d.name + '</div><div class="pips"></div><div class="pn"></div>';
        p.addEventListener('click', function () { openSheet(d.id); });
        wrap.appendChild(p);
      });
    }
    for (var i = 0; i < wrap.children.length; i++) {
      var p = wrap.children[i], d = DIMS[i], t = state.tiers[d.id];
      var pips = p.querySelector('.pips');
      pips.innerHTML = '';
      for (var k = 1; k <= 5; k++) {
        var it = el('i', k <= t ? 'on' : '');
        if (k === 5 && k <= t) it.className += ' t5';
        pips.appendChild(it);
      }
      p.querySelector('.pn').textContent = TIERS[t - 1].name;
      p.classList.toggle('sel', sel === d.id);
    }
  }

  /* ----------------------------- 抽屉 ----------------------------- */
  function openSheet(id) {
    sel = id;
    sheetOpenedAt = Date.now();
    scene.select(id);
    sfxTap();
    $('hint').style.opacity = 0;
    $('sheet').classList.add('show');
    $('sheetMask').classList.remove('hidden');
    requestAnimationFrame(function () { $('sheetMask').classList.add('show'); });
    renderStrip();
    updateSheet();
  }
  function closeSheet() {
    sel = null;
    scene.select(null);
    $('sheet').classList.remove('show');
    $('sheetMask').classList.remove('show');
    setTimeout(function () { $('sheetMask').classList.add('hidden'); }, 260);
    renderStrip();
  }

  function updateSheet() {
    if (!sel) return;
    var d = Z.dim(sel), t = state.tiers[sel], c = CONTENT[sel];
    var info = c.tiers[t - 1], tier = TIERS[t - 1];
    $('shTag').textContent = d.name;
    $('shTier').textContent = 'T' + t + ' · ' + tier.name;
    $('shPeer').textContent = '横向对比：' + tier.peer;
    $('shTitle').textContent = info.title;

    var desc = info.desc;
    if (t === 5 && state.caps[sel]) {
      var cap = c.caps.filter(function (x) { return x.id === state.caps[sel]; })[0];
      if (cap) desc = cap.desc;
    }
    $('shDesc').textContent = desc;

    var tagsEl = $('shTags');
    tagsEl.innerHTML = '';
    var tags = info.tags;
    if (t === 5 && state.caps[sel]) {
      var cp = c.caps.filter(function (x) { return x.id === state.caps[sel]; })[0];
      if (cp) tags = cp.tags;
    }
    tags.forEach(function (x) { tagsEl.appendChild(el('span', '', x)); });

    var pips = $('shPips');
    pips.innerHTML = '';
    for (var k = 1; k <= 5; k++) pips.appendChild(el('i', k <= t ? 'on' : ''));

    // 税与回合说明
    var taxEl = $('shTax');
    var ti = Z.taxInfo ? Z.taxInfo(state, sel) : null;
    var maxR = Z.MAX_ROUNDS || 4;
    var locked = Z.isLocked && Z.isLocked(state);
    var others = (state.roundDims || []).filter(function (x) { return x !== sel; });
    var lines = [];
    if (locked) {
      lines.push('四个回合已经用完了，不能再改——点下面「提交方案」结算。');
    } else if (ti) {
      if (Z.inRound && Z.inRound(state, sel)) {
        lines.push('这个维度本回合已经在动工了，继续升不再收广度税。');
      } else if (ti.breadth > 0) {
        lines.push('本回合已经开工 ' + others.length + ' 个维度，现在新开这个要多付 <b>+' + ti.breadth + '</b> 点广度税。');
      } else {
        lines.push('本回合第一件事，不收广度税。');
      }
      if (ti.step > 0) lines.push('这一档 <b>' + ti.step + '</b> 点。');
    }
    if (lines.length) {
      taxEl.innerHTML = lines.join(' ');
      taxEl.classList.add('on');
    } else {
      taxEl.classList.remove('on');
    }

    var act = $('shActions');
    act.innerHTML = '';
    act.className = 'sheet-actions' + (t === 4 ? ' col' : '');

    // 降档
    var down = el('button', 'btn-down');
    var rf = Z.refund(state, sel);
    down.innerHTML = t > 1 ? ('降一档 <small>返还 ' + rf + ' 点</small>') : ('已到底 <small>—</small>');
    if (t <= 1) down.disabled = true;
    down.addEventListener('click', function () { triggerFlash(this, function () { doDown(sel); }, 260); });

    if (t < 5) {
      var cost = Z.cost(state, sel);
      var brTax = (Z.taxInfo && Z.taxInfo(state, sel).breadth) || 0;
      var surTxt = brTax ? '（含广度税 +' + brTax + '）' : '';
      if (t === 4) {
        var box = el('div', 'cap-pick');
        box.appendChild(el('div', 'cap-title',
          state.points >= cost
            ? '升到「封神」二选一 · 花 ' + cost + ' 点' + surTxt
            : '点数不够（需要 ' + cost + ' 点，你还有 ' + state.points + ' 点）'));
        c.caps.forEach(function (cap) {
          var b = el('button', 'cap-btn');
          b.innerHTML = '<b>' + cap.name + '</b><small>' + cap.desc + '</small>';
          if (state.points < cost) b.disabled = true;
          b.addEventListener('click', function () { triggerFlash(this, function () { doUp(sel, cap.id); }, 260); });
          box.appendChild(b);
        });
        act.appendChild(box);
        act.appendChild(down);
      } else {
        act.appendChild(down);
        var up = el('button', 'btn-up');
        up.innerHTML = '升一档 <small>' +
          (state.points >= cost ? '花 ' + cost + ' 点' + surTxt : '还差 ' + (cost - state.points) + ' 点' + surTxt) +
          '</small>';
        if (state.points < cost) up.disabled = true;
        up.addEventListener('click', function () { triggerFlash(this, function () { doUp(sel, null); }, 260); });
        act.appendChild(up);
      }
    } else {
      act.appendChild(down);
      var done = el('button', 'btn-up');
      var capName = state.caps[sel]
        ? (c.caps.filter(function (x) { return x.id === state.caps[sel]; })[0] || {}).name
        : '封神';
      done.innerHTML = '已封神 <small>' + (capName || '') + '</small>';
      done.disabled = true;
      act.appendChild(done);
    }
  }

  /* ----------------------------- 操作 ----------------------------- */
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1700);
  }

  function doUp(id, capId) {
    var from = state.tiers[id];
    var r = Z.upgrade(state, id, capId);
    if (!r.ok) { toast(r.msg); return; }
    sfxUp();
    toast(Z.dim(id).name + ' +1 档 · 花了 ' + r.cost + ' 点');
    lastAction = { type: 'upgrade', dim: id, from: from, to: r.tier, cap: capId || null };
    if (Track) Track.action({
      type: 'upgrade', dim: id, from: from, to: r.tier, cost: r.cost,
      cap: capId || null, points: state.points, round: state.round, ops: state.ops
    });
    afterOp();
  }
  function doDown(id) {
    var from = state.tiers[id];
    var r = Z.downgrade(state, id);
    if (!r.ok) { toast(r.msg); return; }
    sfxDown();
    toast(Z.dim(id).name + ' -1 档 · 退回 ' + r.refund + ' 点');
    lastAction = { type: 'downgrade', dim: id, from: from, to: r.tier };
    if (Track) Track.action({
      type: 'downgrade', dim: id, from: from, to: r.tier, refund: r.refund,
      points: state.points, round: state.round, ops: state.ops
    });
    afterOp();
  }

  function doItemUp(id) {
    var from = state.tiers[id];
    var r = Z.useFreeUp(state, id, null);
    if (!r.ok) {
      if (r.msg === "need-cap") { toast("T4→T5 要先选专精，请用点数升"); return; }
      toast(r.msg); return;
    }
    sfxUp();
    toast("升档卡：" + Z.dim(id).name + " → T" + r.tier);
    if (Track) Track.action({ type: "item", item: "up", dim: id, from: from, to: r.tier, points: state.points, round: state.round });
    afterOp();
  }

  function afterOp() {
    persist();
    refresh();
    updateSheet();
    $('hint').style.opacity = 0;
  }

  /* 事件改为「回合结束时抽一张」，开局不再抽卡 */
  function eventTotal() { return Math.max(1, (Z.MAX_ROUNDS || 4) - 1); }

  /* ----------------------------- 事件 ----------------------------- */
  var curEvent = null;
  var pendingToast = '';
  var pendingItem = '';
  function openEvent() {
    // 到这里才抽：只看此刻的局势，条件不满足的卡不会出现
    if (!queue[state.events]) {
      queue[state.events] = Z.pickEvent ? Z.pickEvent(state, cardsUsed) : null;
    }
    curEvent = queue[state.events];
    if (!curEvent) {
      // 没有符合条件的卡：这一回合就不出事件
      state.events += 1;
      persist();
      toast("这一回合风平浪静，没有事件发生");
      return;
    }
    $('evIdx').textContent = Math.min(state.events + 1, eventTotal()) + '/' + eventTotal();
    $('evTitle').textContent = curEvent.title;
    $('evText').textContent = curEvent.text;
    $('evResult').classList.add('hidden');
    $('evOpts').classList.remove('hidden');
    var opts = $('evOpts');
    opts.innerHTML = '';
    curEvent.options.forEach(function (o, i) {
      var b = el('button', 'ev-opt');
      var can = Z.afford(state, o);
      b.innerHTML = '<span>' + o.label + '</span>' + (o.cost ? '<span class="cost">-' + o.cost + ' 点</span>' : '');
      if (!can) b.disabled = true;
      b.addEventListener('click', function () { triggerFlash(this, function () { pickEvent(i); }, 300); });
      opts.appendChild(b);
    });
    $('evModal').classList.remove('hidden');
    beep(300, 0.2, 'sine', 0.04);
  }

  function pickEvent(i) {
    var o = curEvent.options[i];
    var text = Z.apply(state, o);
    state.events += 1;
    cardsUsed.push(curEvent.id);
    if (Track) Track.card({
      id: curEvent.id, title: curEvent.title, option: i,
      label: o.label, cost: o.cost || 0,
      points: state.points,
      tiers: Z.clone(state.tiers)
    });
    persist();
    $('evOpts').classList.add('hidden');
    $('evResultText').textContent = text;
    $('evResult').classList.remove('hidden');
    beep(480, 0.14, 'triangle', 0.04);
    refresh();
  }

  function closeEvent() {
    $('evModal').classList.add('hidden');
    updateSheet();
    if (pendingToast) { toast(pendingToast); pendingToast = ''; }
  }

  /* ----------------------------- 撤销 ----------------------------- */
  function undo() {
    var r = Z.undo(state);
    if (!r.ok) { toast(r.msg); return; }
    sfxTap();
    if (Track) Track.action({
      type: 'undo', undone: lastAction,
      points: state.points, ops: state.ops
    });
    lastAction = { type: 'undo' };
    persist();
    refresh();
    updateSheet();
    toast('已撤销一步');
  }

  /* ----------------------------- 结算 ----------------------------- */
  function endRun() {
    // 回合用完后必须能提交，否则「一步没改 + 空过四个回合」会卡死
    var locked = Z.isLocked && Z.isLocked(state);
    var onLast = (state.round || 1) >= (Z.MAX_ROUNDS || 4);
    if (state.ops === 0 && !locked && !onLast) { toast("先改点什么吧（或者把四个回合空过完，也会进入结算）"); return; }
    var sm = Z.summary(state);
    if (Track) Track.endRun({
      title: sm.title.name,
      achievements: sm.achievements.map(function (a) { return a.id; }),
      year: state.grade || null,
      pointsLeft: state.points, pointsSpent: Z.budget(state), round: state.round,
      ops: state.ops, durationMs: runStartTs ? Date.now() - runStartTs : 0,
      tiers: Z.clone(state.tiers),
      caps: Z.clone(state.caps),
      cards: cardsUsed.slice()
    });

    $('resTitle').textContent = sm.title.name;
    $('resLine').textContent = sm.title.line;

    var ach = $('resAch');
    ach.innerHTML = '';
    if (sm.achievements.length) {
      sm.achievements.forEach(function (a) {
        ach.appendChild(el('span', 'ach-badge', a.name));
      });
    } else {
      ach.appendChild(el('span', 'ach-none', '这一局没有解锁任何成就'));
    }

    var rows = $('resDims');
    rows.innerHTML = '';
    DIMS.forEach(function (d) {
      var t = state.tiers[d.id], info = CONTENT[d.id].tiers[t - 1];
      var row = el('div', 'res-row');
      var bar = '';
      for (var k = 1; k <= 5; k++) bar += '<i class="' + (k <= t ? 'on' : '') + '"></i>';
      row.innerHTML = '<div class="rn">' + d.name + '</div>' +
        '<div class="rt">T' + t + ' ' + info.title + '</div>' +
        '<div class="rbar">' + bar + '</div>' +
        '<div class="rp">' + (t > d.init ? '+' + (t - d.init) : '—') + '</div>';
      rows.appendChild(row);
    });

    state.finished = true;
    try { localStorage.removeItem(KEY); } catch (e) { }
    show('result');
    sfxUp();
  }

  /* ----------------------------- 分享图 ----------------------------- */
  function drawShare() {
    var sm = Z.summary(state);
    var cv = $('shareCanvas'), ctx = cv.getContext('2d');
    var W = 750, H = 1180;
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#141b22');
    g.addColorStop(0.5, '#0f151b');
    g.addColorStop(1, '#1a222b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    var rg = ctx.createRadialGradient(W * 0.5, 180, 40, W * 0.5, 200, 520);
    rg.addColorStop(0, 'rgba(255,190,90,.20)');
    rg.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, 600);

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,215,106,.85)';
    ctx.font = '500 22px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('紫 金 港 改 造 计 划 · 第 1 学 期', 64, 96);

    ctx.fillStyle = '#f2f7fb';
    ctx.font = 'bold 46px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('我把浙大改成了', 64, 168);

    ctx.font = 'bold 54px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#ffe08a';
    ctx.fillText('「' + sm.title.name + '」', 64, 238);

    // 成就
    ctx.textAlign = 'left';
    if (sm.achievements.length) {
      ctx.fillStyle = '#6fe0bd';
      ctx.font = '500 24px "PingFang SC",sans-serif';
      var names = sm.achievements.map(function (a) { return a.name; }).join('   ');
      ctx.fillText(names, 64, 300);
    }

    // 六维
    var y0 = 380;
    DIMS.forEach(function (d, i) {
      var t = state.tiers[d.id], info = CONTENT[d.id].tiers[t - 1];
      var y = y0 + i * 82;
      ctx.fillStyle = 'rgba(255,255,255,.04)';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(64, y - 34, 622, 66, 16) : ctx.rect(64, y - 34, 622, 66);
      ctx.fill();

      ctx.fillStyle = '#ffe08a';
      ctx.font = 'bold 30px "PingFang SC",sans-serif';
      ctx.fillText(d.name, 92, y + 10);

      ctx.fillStyle = '#cfdae4';
      ctx.font = '500 24px "PingFang SC",sans-serif';
      ctx.fillText('T' + t + ' ' + info.title, 140, y + 9);

      for (var k = 0; k < 5; k++) {
        ctx.fillStyle = k < t ? '#ffd76a' : '#2c3742';
        ctx.fillRect(540 + k * 26, y - 6, 18, 12);
      }
    });

    ctx.fillStyle = '#5d6a77';
    ctx.font = '500 20px "PingFang SC",sans-serif';
    ctx.fillText('同人创作 · 与浙江大学官方无关', 64, H - 54);

    ctx.fillStyle = '#ffd76a';
    ctx.font = '500 20px "PingFang SC",sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('第 ' + (state.round || 1) + '/' + (Z.MAX_ROUNDS || 4) + ' 回合结束', W - 64, H - 54);

    $('shareDl').href = cv.toDataURL('image/png');
    $('shareWrap').classList.remove('hidden');
  }

  /* ----------------------------- 存档 ----------------------------- */
  function persist() {
    try { localStorage.setItem(KEY, Z.save(state)); } catch (e) { }
  }
  function readSave() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var s = Z.load(raw);
      if (!s || s.finished) return null;
      return s;
    } catch (e) { return null; }
  }

  /* ----------------------------- 启动 ----------------------------- */
  /* 手势自测：模拟「点地块 → 浏览器补发 click」，
   * 用来确认面板不会被那一下 click 当场关掉（?demo=tap） */
  function runTapTest() {
    var cv = $('map');
    var r = cv.getBoundingClientRect();
    var p = scene.zones.food;
    var x = r.left + scene.ox + p.x * scene.scale;
    var y = r.top + scene.oy + p.y * scene.scale;
    cv.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true
    }));
    var opened = $('sheet').classList.contains('show');
    setTimeout(function () {
      var hit = document.elementFromPoint(x, y);
      if (hit) hit.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
      setTimeout(function () {
        var still = $('sheet').classList.contains('show');
        var h = $('hint');
        h.textContent = 'TAP-TEST opened=' + opened + ' afterClick=' + still +
          ' hit=' + (hit ? (hit.id || hit.className) : 'null');
        h.style.cssText = 'position:fixed;z-index:9999;top:40px;left:8px;right:8px;' +
          'transform:none;opacity:1;background:#000;color:#0f0;padding:10px;' +
          'border-radius:0;font:13px monospace;text-align:center';
      }, 150);
    }, 80);
  }

  /* 开局：先选年级，再进游戏 */
  /* ----------------------------- 新手引导 ----------------------------- */
  var tutStep = 0, tutReturn = "intro";

  function tutSlides() { return document.querySelectorAll("#tutor .tutor-slide"); }

  function renderTutor() {
    var slides = tutSlides();
    for (var i = 0; i < slides.length; i++) slides[i].classList.toggle("on", i === tutStep);
    var dots = $("tutDots");
    if (dots) {
      dots.innerHTML = "";
      for (var k = 0; k < slides.length; k++) dots.appendChild(el("i", k === tutStep ? "on" : ""));
    }
    $("tutPrev").style.visibility = tutStep === 0 ? "hidden" : "visible";
    $("tutNext").textContent = (tutStep >= slides.length - 1) ? "开始改造" : "下一步";
  }

  function openTutor(from) {
    tutReturn = from || "intro";
    tutStep = 0;
    renderTutor();
    show("tutor");
  }

  function finishTutor() {
    if (tutReturn === "game") { show("game"); return; }
    show("intro");
    openGradePicker();
  }

  function openGradePicker() {
    var box = $('gradeOpts');
    box.innerHTML = '';
    (Z.GRADES || []).forEach(function (g) {
      var b = document.createElement('button');
      b.className = 'grade-opt';
      b.innerHTML = '<b>' + g.name + '</b><small>' + g.desc + '</small><span class="arrow">→</span>';
      b.addEventListener('click', function () {
        $('gradeModal').classList.add('hidden');
        beep(520, 0.1, 'triangle', 0.04);
        beginRun('new', g.id);
      });
      box.appendChild(b);
    });
    $('gradeModal').classList.remove('hidden');
  }

  function beginRun(mode, grade) {
    state = Z.createState();
    state.grade = grade || null;
    queue = [];   // 每回合按当时的局势现抽（见 openEvent）
    sel = null;
    if (Track) Track.setProfile({ year: state.grade });
    trackStart(mode);
    show('game');
    scene.resize();
    refresh();
    setTimeout(function () { $('hint').style.opacity = 1; }, 100);
  }

  function boot() {
    var started = false;
    function go() { if (started) return; started = true; startUI(); }
    try {
      Promise.all([loadConfigOverride(), loadOverrides()]).then(go).catch(go);
      setTimeout(go, 500);
    } catch (e) { go(); }
  }

  function startUI() {
    initTrack();
    scene = new Z.Scene($('map'));
    scene.contentLookup = function (id, tier) { return CONTENT[id].tiers[tier - 1]; };
    scene.start();
    window.__zjuScene = scene;

    window.addEventListener('resize', function () { scene.resize(); });

    $('map').addEventListener('pointerdown', function (e) {
      var id = scene.hitTest(e.clientX, e.clientY);
      if (!id) return;
      if (pendingItem === 'up') {
        pendingItem = '';
        doItemUp(id);
        return;
      }
      openSheet(id);
    });

    $('btnStart').addEventListener('click', function () { triggerFlash(this, function () { openTutor('intro'); }, 340); });
    $('tutNext').addEventListener('click', function () {
      if (tutStep >= tutSlides().length - 1) { finishTutor(); return; }
      tutStep += 1; renderTutor();
    });
    $('tutPrev').addEventListener('click', function () {
      if (tutStep > 0) { tutStep -= 1; renderTutor(); }
    });
    $('tutSkip').addEventListener('click', finishTutor);
    $('btnHelp').addEventListener('click', function () { openTutor('game'); });

    $('btnResume').addEventListener('click', function () {
      var s = readSave();
      if (!s) return;
      state = s;
      if (Track) Track.setProfile({ year: s.grade || null });
      queue = [];   // 每回合按当时的局势现抽（见 openEvent）
      trackStart('resume');
      show('game');
      scene.resize();
      refresh();
      toast('已恢复上次进度');
      });

    $('btnUndo').addEventListener('click', undo);
    $('btnEnd').addEventListener('click', function () { triggerFlash(this, endRun, 340); });
    $('btnRound').addEventListener('click', function () { triggerFlash(this, nextRound, 340); });
    $('btnAgain').addEventListener('click', function () {
      beginRun('again', state ? state.grade : null);
    });
    $('btnShare').addEventListener('click', function () { triggerFlash(this, drawShare, 340); });
    $('shareClose').addEventListener('click', function () { $('shareWrap').classList.add('hidden'); });

    $('shClose').addEventListener('click', closeSheet);

    // 点遮罩关闭：用 pointerdown 而不是 click。
    // 手机上「点地块」会在手指抬起后补发一个 click，那时遮罩已经盖在上面了，
    // 用 click 会导致面板刚打开就被关掉（表现为「必须长按才能打开」）。
    $('sheetMask').addEventListener('pointerdown', function () {
      if (Date.now() - sheetOpenedAt < 400) return;
      closeSheet();
    });
    $('evNext').addEventListener('click', function () { triggerFlash(this, closeEvent, 340); });

    $('btnSound').addEventListener('click', function () {
      muted = !muted;
      this.classList.toggle('on', !muted);
      this.textContent = muted ? '✕' : '♪';
      if (!muted) beep(700, 0.08, 'sine', 0.04);
    });
    $('btnSound').classList.add('on');

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('shareWrap').classList.contains('hidden')) $('shareWrap').classList.add('hidden');
        else closeSheet();
      }
    });

    // 有存档则显示继续
    if (readSave()) $('btnResume').classList.remove('hidden');

    show('intro');
    setTimeout(function () { scene.resize(); }, 60);

    // 开发预览：?demo=map / ?demo=sheet 直接进入一局并做两步改造
    var dm = /demo=(\w+)/.exec(location.search);
    if (dm && dm[1] === 'tutor') {
      var tutStepParam = parseInt((/tut=(\d)/.exec(location.search) || [])[1] || '1', 10) - 1;
      setTimeout(function () { openTutor('intro'); tutStep = Math.max(0, tutStepParam); renderTutor(); }, 120);
    } else if (dm && dm[1] === 'grade') {
      setTimeout(openGradePicker, 400);
    } else if (dm) {
      beginRun('new', 'y3');
      setTimeout(function () {
        if (dm[1] === 'open3') {
          // 自动把开局三张事件都选一遍，用来验证「连发 + 收尾」逻辑
          var n = 0;
          var iv = setInterval(function () {
            if (n >= 3) { clearInterval(iv); $('hint').textContent = '开三张事件已处理完，事件计数=' + state.events; $('hint').style.opacity = 1; return; }
            if ($('evModal').classList.contains('hidden')) return;
            if (!$('evResult').classList.contains('hidden')) { $('evNext').click(); n++; return; }
            var b = document.querySelector('#evOpts .ev-opt:not([disabled])');
            if (b) b.click();
          }, 500);
          return;
        }
        if (dm[1] === 'empty') {
          // 回归：一步不改、空过四个回合，然后提交
          state.events = 99;
          for (var q = 0; q < (Z.MAX_ROUNDS || 4); q++) Z.endRound(state);
          setTimeout(endRun, 200);
          return;
        }
        if (dm[1] === 'last') {
          // 预览最后一回合：连过三回合，停在 round 4
          state.events = 99;
          for (var q2 = 0; q2 < (Z.MAX_ROUNDS || 4) - 1; q2++) Z.endRound(state);
          setTimeout(function () { doUp('food'); refresh(); }, 200);
          return;
        }
        if (dm[1] === 'item') {
          // 预览：发两个道具 + 做一步改造
          state.events = 3;
          if (Z.addItem) { Z.addItem(state, 'up', 1); Z.addItem(state, 'x15', 2); }
          doUp('food');
          persist(); refresh();
          return;
        }
        if (dm[1] === 'roundend') {
          // 验证「回合结算 → 弹事件卡」
          setTimeout(function () { doUp('food'); setTimeout(nextRound, 160); }, 200);
          return;
        }
        if (dm[1] !== 'open') state.events = 3;   // 除 ?demo=open 外都跳过开局三连，方便截图
        if (dm[1] === 'open') return;
        if (dm[1] === 'tap') { setTimeout(runTapTest, 250); return; }
        if (dm[1] === 'hero') {
          state.events = 3;            // 预览用：关掉事件弹窗
          doUp('food', 'quality');     // 食 3 -> 4
          doUp('food', 'quality');     // 食 4 -> 5（带专精）
          doUp('dorm', null);          // 住 1 -> 2
          doUp('dorm', null);          // 住 2 -> 3
          doUp('dorm', null);          // 住 3 -> 4
          doUp('move', null);          // 行 1 -> 2
          doUp('move', null);          // 行 2 -> 3
          doUp('sport', null);         // 体 2 -> 3
          doUp('sport', null);         // 体 3 -> 4
          return;
        }
        doUp('dorm', null);
        doUp('dorm', null);
        if (dm[1] === 'event') { doUp('move', null); return; }
        if (dm[1] === 'sheet') openSheet('dorm');
        if (dm[1] === 'result') { endRun(); }
        if (dm[1] === 'share') { endRun(); setTimeout(drawShare, 300); }
      }, 120);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
