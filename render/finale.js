/* render/finale.js —— 彩蛋：启真湖一层层铺上来，真实地标按档位依次出现
 *
 * 时间轴（t=0..1）：
 *   0.00–0.40  启真湖 1→2→3→4 依次淡入；镜头从「贴合游戏里的湖」推到「铺满整屏」
 *   0.42–0.50  游戏内容（台基 / 档位 / 文字）淡回来 —— 等于只换了一个背景
 *   0.50–0.92  建筑按档位 低→高 依次升起，原地块的矢量建筑同时淡出、文字换成建筑名
 *   0.93–1.00  标题
 *
 * 全部画在同一个 canvas 上，游戏画面在下面，全程不隐藏。
 * 依赖：无（纯 canvas）。UMD：浏览器挂 window.ZJUFinale，Node 里 require。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ZJUFinale = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  /* 与 game/config.js 的 DIMS 一一对应：id / 图标文件 / 维度字 / 真实名字 / 方位角 */
  var ITEMS = [
    { id: "food", file: "food.png", dim: "食", name: "玉湖餐厅", angle: -90 },
    { id: "dorm", file: "dorm.png", dim: "住", name: "月牙楼", angle: -30 },
    { id: "study", file: "study.png", dim: "学", name: "求是大讲堂", angle: 30 },
    { id: "sport", file: "sport.png", dim: "体", name: "亚运篮球馆", angle: 90 },
    { id: "culture", file: "culture.png", dim: "文", name: "艺博馆", angle: 150 },
    { id: "move", file: "move.png", dim: "行", name: "南大门", angle: 210 }
  ];

  /* 四层湖：同一张 1399×1124 画布上的同心图（1=湖面 / 2=+树 / 3=+路 / 4=全景） */
  var LAKES = ["lake1.png", "lake2.png", "lake3.png", "lake4.png"];

  var KICKER = "改造计划 · 彩蛋";
  var TITLE = "我们的紫金港";
  var FOOT = "同人作品 · 与浙江大学官方无关";

  // 与 render/scene.js 完全一致的地图投影
  var MAP_CX = 500, MAP_CY = 500, MAP_R = 300, MAP_BOX = 820, PAD_W = 216, PAD_H = 120;
  var LAKE_RX = 250, LAKE_RY = 200;          // 对齐目标的半径：略大于游戏湖岸(208/158)，好把白色广场盘盖住

  // 时间轴（0~1）
  var TL = {
    lakeEnd: 0.26,
    contentStart: 0.27, contentEnd: 0.32,
    buildStart: 0.38, buildGap: 0.092, buildDur: 0.064,
    title: 0.93
  };
  // 四张湖图各自的淡入起点 / 时长
  var LAKE_TL = [[0.01, 0.07], [0.08, 0.07], [0.15, 0.07], [0.21, 0.06]];

  var ROAD_DIR = "roads2/";
  var ROAD_IMG = { road: "road1.png", bridge: "bridge1.png", pier: "pier.png" };
  var ANG = 0.46;
  var DECK = { y: 54, h: 41 };
  var BASE = "../assets/finale/";
  var cache = null;

  function font() {
    return '-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(v) { v = clamp01(v); return 1 - Math.pow(1 - v, 3); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function ramp(t, start, dur) { return ease(clamp01((t - start) / dur)); }

  function loadImage(src, key) {
    return new Promise(function (res, rej) {
      var inline = (typeof window !== "undefined" && window.__ZJU_FINALE_ASSETS__) || null;
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error("加载失败: " + src)); };
      img.src = (inline && key && inline[key]) ? inline[key] : src;
    });
  }

  /* 用 alpha 求「有内容」的包围盒（跨域时退回整图） */
  function alphaBox(img) {
    var w = 140, h = Math.max(1, Math.round(140 * img.height / img.width));
    var cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    var g = cv.getContext("2d");
    g.drawImage(img, 0, 0, w, h);
    var data;
    try { data = g.getImageData(0, 0, w, h).data; } catch (e) { return null; }
    var x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 12) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 <= x0 || y1 <= y0) return null;
    var k = img.width / w;
    return { x: x0 * k, y: y0 * k, w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k };
  }

  function load(base) {
    if (cache) return Promise.resolve(cache);
    var b = base || BASE;
    var jobs = LAKES.map(function (f) { return loadImage(b + f, f); })
      .concat(ITEMS.map(function (it) { return loadImage(b + it.file, it.file); }))
      .concat(Object.keys(ROAD_IMG).map(function (k) {
        return loadImage(b + ROAD_DIR + ROAD_IMG[k], ROAD_IMG[k]).catch(function () { return null; });
      }));
    return Promise.all(jobs).then(function (imgs) {
      var lakes = imgs.slice(0, LAKES.length);
      var rest = imgs.slice(LAKES.length);
      var dims = {}, box = {};
      ITEMS.forEach(function (it, i) {
        dims[it.id] = rest[i];
        box[it.id] = alphaBox(rest[i]) || { x: 0, y: 0, w: rest[i].width, h: rest[i].height };
      });
      var rimg = {};
      var rs = LAKES.length + ITEMS.length;
      Object.keys(ROAD_IMG).forEach(function (k, i) {
        var im = imgs[rs + i];
        rimg[k] = im ? { img: im, box: alphaBox(im) || { x: 0, y: 0, w: im.width, h: im.height } } : null;
      });
      var water = lakes.map(function (im) { return waterCenter(im); });
      cache = {
        roads: rimg,
        lakes: lakes,
        water: water,
        dims: dims,
        box: box,
        lakeBox: alphaBox(lakes[0]) || { x: 0, y: 0, w: lakes[0].width, h: lakes[0].height }
      };
      return cache;
    });
  }

  /* 在缩略图上找「过中心那一行/那一列的水面」，得到水面中心（相对于图片尺寸的比例） */
  /* 在缩略图上取「最大连通水面」的包围盒，用它给四张图做配准（位置 + 缩放） */
  function waterCenter(img) {
    var W = 300, H = Math.max(1, Math.round(W * img.height / img.width));
    var cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    var g2 = cv.getContext("2d");
    g2.drawImage(img, 0, 0, W, H);
    var d;
    try { d = g2.getImageData(0, 0, W, H).data; } catch (e) { return { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }; }
    var mask = new Uint8Array(W * H);
    for (var i = 0; i < W * H; i++) {
      var r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], al = d[i * 4 + 3];
      if (al > 40 && b > r + 35 && b > 150 && gg > 110 && gg < b) mask[i] = 1;
    }
    // 从中心附近找一个水像素当种子
    var seed = -1, cx0 = Math.floor(W / 2), cy0 = Math.floor(H / 2);
    for (var rr = 0; rr < H / 2 && seed < 0; rr += 2) {
      for (var th = 0; th < 6.283 && seed < 0; th += 0.3) {
        var xx = Math.round(cx0 + Math.cos(th) * rr), yy = Math.round(cy0 + Math.sin(th) * rr);
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && mask[yy * W + xx]) seed = yy * W + xx;
      }
    }
    if (seed < 0) return { x: 0.5, y: 0.5, w: 0.5, h: 0.5 };
    // 洪水填充，取最大连通块
    var stack = [seed], seen = new Uint8Array(W * H), minX = W, maxX = -1, minY = H, maxY = -1;
    seen[seed] = 1;
    while (stack.length) {
      var cur = stack.pop(), px = cur % W, py = (cur - px) / W;
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
      var nb = [cur - 1, cur + 1, cur - W, cur + W];
      for (var k = 0; k < 4; k++) {
        var id = nb[k];
        if (id < 0 || id >= W * H || seen[id] || !mask[id]) continue;
        seen[id] = 1; stack.push(id);
      }
    }
    return {
      x: ((minX + maxX) / 2) / W, y: ((minY + maxY) / 2) / H,
      w: (maxX - minX) / W, h: (maxY - minY) / H
    };
  }

  function projection(w, h, area) {
    var aw = (area && area.w) || w, ah = (area && area.h) || h;
    var scale = Math.min(aw, ah) / MAP_BOX;
    var ox = (area ? area.x : 0) + (aw - 1000 * scale) / 2;
    var oy = (area ? area.y : 0) + (ah - 1000 * scale) / 2;
    return { scale: scale, ox: ox, oy: oy };
  }

  /* 湖图变换：t=0 时「图1 的湖」刚好盖住游戏的湖；t 到 lakeEnd 时铺满整屏 */
  /* 固定变换：全程不移动、不缩放，四张图永远像素级重合。
   * 缩放取「铺满整屏」——图1 的湖会略大于游戏里的湖（几何上无法两全），
   * 但湖心始终停在游戏湖的中心，看起来就是「湖从原地长出来」。 */
  /* 固定变换：全程不动、不缩放。四张图按各自水面中心对齐，像素级重合。 */
  /* 固定变换，全程不动不缩放。每张图各自按水面配准（缩放 + 平移），所以四层完全重合。 */
  function lakeTransform(c, w, h, area) {
    var p = projection(w, h, area);
    var cx = p.ox + MAP_CX * p.scale;
    var cy = p.oy + MAP_CY * p.scale;
    var w0 = c.water[0];
    var iw0 = c.lakes[0].width;
    var s0 = Math.max((2 * LAKE_RX * p.scale * 1.04) / (w0.w * iw0), 0.05);
    return { cx: cx, cy: cy, s0: s0 };
  }

  function drawLakes(g, c, w, h, area, t) {
    var T = lakeTransform(c, w, h, area);
    for (var i = 0; i < c.lakes.length; i++) {
      var a = ramp(t, LAKE_TL[i][0], LAKE_TL[i][1]);
      if (a <= 0.002) continue;
      var im = c.lakes[i], wc = c.water[i], w0 = c.water[0];
      var s = T.s0 * (w0.w / wc.w);          // 水面宽度对齐 ⇒ 内容等比重合
      var dw = im.width * s, dh = im.height * s;
      var dx = T.cx - wc.x * dw;
      var dy = T.cy - wc.y * dh;
      g.globalAlpha = a;
      g.drawImage(im, dx, dy, dw, dh);
    }
    g.globalAlpha = 1;
  }

  /* 六栋楼固定站位：只落在湖面上下的绿地里，绝不压到中间的蓝区 */
  var SLOTS = {
    move: { col: 0, row: 0 }, food: { col: 1, row: 0 }, dorm: { col: 2, row: 0 },
    culture: { col: 0, row: 1 }, sport: { col: 1, row: 1 }, study: { col: 2, row: 1 }
  };

  /* 某栋建筑在当前时刻的进度（0=还没开始，1=落位） */
  var RING = ['move', 'food', 'dorm', 'study', 'sport', 'culture'];
  function isAdjacent(a, b) {
    var i = RING.indexOf(a), j = RING.indexOf(b);
    if (i < 0 || j < 0) return false;
    var d = Math.abs(i - j);
    return d === 1 || d === RING.length - 1;
  }
  function revealOrder(order) {
    var out = [], gate = null;
    for (var i = 0; i < order.length; i++) {
      if (order[i].id === 'move') gate = order[i]; else out.push(order[i]);
    }
    return gate ? [gate].concat(out) : order.slice();
  }
  function roadPos(it, p) {
    var R = MAP_R * p.scale * 1.02;
    var rad = it.angle * Math.PI / 180;
    return { x: p.ox + MAP_CX * p.scale + Math.cos(rad) * R,
             y: p.oy + MAP_CY * p.scale + Math.sin(rad) * R };
  }
  function lay(g, asset, box, p, ax, ay, bx, by, prog, dw, ext) {
    if (!asset || prog <= 0) return;
    var dx = bx - ax, dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 4) return;
    var ux = dx / len, uy = dy / len;
    var dh = dw * box.h / box.w;             // 保持素材原始比例，不拉伸
    var rot = Math.atan2(dy, dx) + ANG;
    var step = dw * 0.70;                    // 30% 重叠，接缝藏在上一段底下
    var n = Math.max(1, Math.ceil((len + (ext || 0) * 2) / step));
    var shown = prog * n;
    for (var i = 0; i < n; i++) {
      if (i > shown) break;
      var cx = ax - ux * (ext || 0) + ux * i * step;
      var cy = ay - uy * (ext || 0) + uy * i * step;
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      g.drawImage(asset, box.x, box.y, box.w, box.h, 0, -dh * 0.55, dw, dh);
      g.restore();
    }
  }
  function baseOf(it, p, c) {
    var R = MAP_R * p.scale * 1.02;
    var rad = it.angle * Math.PI / 180;
    var px = p.ox + MAP_CX * p.scale + Math.cos(rad) * R;
    var py = p.oy + MAP_CY * p.scale + Math.sin(rad) * R;
    var b = c.box[it.id];
    if (!b) return { x: px, y: py };
    var sc = Math.min(PAD_W * 1.10 * p.scale / b.w, PAD_H * 0.90 * p.scale / b.h);
    return { x: px, y: py - b.h * sc * 0.58 + b.h * sc };   // 图片有像素的底边中点
  }
  function drawRoads(g, c, w, h, area, t, order) {
    if (!c.roads || !c.roads.road) return;
    var p = projection(w, h, area);
    var byId = {};
    for (var i = 0; i < ITEMS.length; i++) byId[ITEMS[i].id] = ITEMS[i];
    // 顺时针：南大门 → 食 → 住 → 学 → 体 → 文 → 回南大门
    var SEQ = ["move", "food", "dorm", "study", "sport", "culture"];
    var list = [];
    for (var s = 0; s < SEQ.length; s++) {
      if (byId[SEQ[s]] && c.box[SEQ[s]]) list.push(byId[SEQ[s]]);
    }
    if (list.length < 2) return;
    var base = list.map(function (it) { return baseOf(it, p, c); });
    var legs = [];
    legs.push({ a: { x: base[0].x - 300, y: base[0].y + 150 }, b: base[0],
                t0: TL.buildStart - 0.045, dur: 0.046 });
    for (var k = 1; k < list.length; k++) {
      legs.push({ a: base[k - 1], b: base[k],
                  t0: TL.buildStart + k * TL.buildGap - 0.030, dur: 0.044 });
    }
    legs.push({ a: base[list.length - 1], b: base[0],
                t0: TL.buildStart + (list.length - 1) * TL.buildGap + 0.050, dur: 0.050 });
    var rd = c.roads.road;
    var bw = 112 * p.scale;
    for (var n = 0; n < legs.length; n++) {
      var L2 = legs[n];
      var prog = ramp(t, L2.t0, L2.dur);
      if (prog <= 0) continue;
      lay(g, rd.img, rd.box, p, L2.a.x, L2.a.y, L2.b.x, L2.b.y, prog, bw, 6);
    }
  }
  function localAt(t, rank) {
    return clamp01((t - TL.buildStart - rank * TL.buildGap) / TL.buildDur);
  }

  function drawBuildings(g, c, w, h, area, t, order, glowId) {
    var p = projection(w, h, area);
    var R = MAP_R * p.scale * 1.02;              // 与游戏里六个维度的相对位置一致
    for (var i = 0; i < order.length; i++) {
      var it = order[i];
      var img = c.dims[it.id];
      if (!img) continue;
      var e = localAt(t, i);
      if (e <= 0.002) continue;
      var a = Math.min(1, e * 1.6);

      var rad = it.angle * Math.PI / 180;
      var px = p.ox + (MAP_CX + Math.cos(rad) * R / p.scale) * p.scale;
      var py = p.oy + (MAP_CY + Math.sin(rad) * R / p.scale) * p.scale;

      var slotW = PAD_W * 1.10 * p.scale;
      var slotH = PAD_H * 0.90 * p.scale;
      var b = c.box[it.id];
      var sc = Math.min(slotW / b.w, slotH / b.h);
      var ks = 0.86 + 0.14 * e;
      var dw = b.w * sc * ks, dh = b.h * sc * ks;
      var dx = px - dw / 2;
      var rise = (1 - e) * dh * 0.55;
      var dy = py - dh * 0.58 + rise;
      var isGlow = glowId && it.id === glowId && e > 0.25;

      g.save();
      g.globalAlpha = a;
      if (isGlow) {
        var gg = g.createRadialGradient(px, dy + dh * 0.6, 4, px, dy + dh * 0.6, Math.max(dw, dh) * 0.55);
        gg.addColorStop(0, "rgba(255, 214, 102, 0.40)");
        gg.addColorStop(0.5, "rgba(251, 191, 36, 0.15)");
        gg.addColorStop(1, "rgba(251, 191, 36, 0)");
        g.fillStyle = gg;
        g.beginPath();
        g.ellipse(px, dy + dh * 0.6, Math.max(dw, dh) * 0.48, Math.max(dw, dh) * 0.34, 0, 0, 6.283);
        g.fill();
      }
      g.drawImage(img, b.x, b.y, b.w, b.h, dx, dy, dw, dh);
      g.restore();

      // 只写建筑名
      var fs2 = Math.max(12, Math.min(17, w * 0.032));
      g.save();
      g.globalAlpha = a;
      g.textAlign = "center";
      g.textBaseline = "top";
      g.font = "bold " + Math.round(fs2) + "px " + font();
      g.shadowColor = "rgba(255,255,255,.85)";
      g.shadowBlur = 9;
      g.fillStyle = isGlow ? "#b45309" : "#1f2937";
      g.fillText(it.name, px, dy + dh + 6);
      g.restore();
    }
  }

  function drawTitle(g, w, h, area, t) {
    var a = ramp(t, TL.title, 0.05);
    if (a <= 0.002) return;
    var top = (area ? area.y : 0);
    var fs = Math.max(15, Math.min(26, w * 0.048));
    g.save();
    g.globalAlpha = a;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.shadowColor = "rgba(15,23,42,.35)";
    g.shadowBlur = 10;

    g.fillStyle = "#0f172a";
    g.font = "bold " + Math.round(fs * 1.5) + "px " + font();
    g.fillText(TITLE, w / 2, top + fs * 2.2);

    g.shadowBlur = 0;
    g.globalAlpha = a * 0.72;
    g.fillStyle = "#475569";
    g.font = "600 " + Math.round(fs * 0.56) + "px " + font();
    g.fillText(FOOT, w / 2, h - Math.max(14, h * 0.022));
    g.restore();
  }

  /* 主绘制：t=0..1；order 是「按档位从低到高」排好的 ITEMS */
  function draw(g, w, h, t, area, opts) {
    opts = opts || {};
    if (!cache) return;
    g.clearRect(0, 0, w, h);
    drawLakes(g, cache, w, h, area, t);
    try { drawRoads(g, cache, w, h, area, t, opts.order || ITEMS); } catch (e) {}
    drawBuildings(g, cache, w, h, area, t, revealOrder(opts.order || ITEMS), opts.glow || null);
    drawTitle(g, w, h, area, t);
  }

  /* 自己驱动 rAF 的便捷入口（正常模式）；headless 里可以用 ui.js 的 ?still= 定格 */
  function play(o) {
    o = o || {};
    var canvas = o.canvas;
    var w = o.w, h = o.h, dpr = o.dpr || 1;
    var duration = o.duration || 30000;
    var g = canvas.getContext("2d");
    var t0 = 0;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    return load(o.base).then(function () {
      return new Promise(function (resolve) {
        function frame(now) {
          if (!t0) t0 = now;
          var t = Math.min(1, (now - t0) / duration);
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          draw(g, w, h, t, o.area, o);
          if (o.onFrame) o.onFrame(t);
          if (t >= 1) return resolve(true);
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
    });
  }

  function stop() { /* 循环随 t=1 自行结束 */ }

  // 供 scene 的两层钩子使用：backdrop 只画湖，front 只画建筑和标题
  function backdrop(g, w, h, t, area) {
    if (!cache) return;
    drawLakes(g, cache, w, h, area, t);
  }
  function front(g, w, h, t, area, opts) {
    if (!cache) return;
    opts = opts || {};
    try { drawRoads(g, cache, w, h, area, t, opts.order || ITEMS); } catch (e) {}
    drawBuildings(g, cache, w, h, area, t, revealOrder(opts.order || ITEMS), opts.glow || null);
    drawTitle(g, w, h, area, t);
  }

  return {
    ITEMS: ITEMS,
    backdrop: backdrop,
    front: front,
    LAKES: LAKES,
    TL: TL,
    LAKE_TL: LAKE_TL,
    load: load,
    draw: draw,
    play: play,
    stop: stop,
    localAt: localAt
  };
});
