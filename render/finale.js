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
  var LAKES = ["lake1.png", "lake2.png", "lake3.png", "lake4.jpg"];

  var KICKER = "改造计划 · 彩蛋";
  var TITLE = "这就是紫金港";
  var FOOT = "同人作品 · 与浙江大学官方无关";

  // 与 render/scene.js 完全一致的地图投影
  var MAP_CX = 500, MAP_CY = 500, MAP_R = 300, MAP_BOX = 820, PAD_W = 216, PAD_H = 120;
  var LAKE_RX = 250, LAKE_RY = 200;          // 对齐目标的半径：略大于游戏湖岸(208/158)，好把白色广场盘盖住

  // 时间轴（0~1）
  var TL = {
    lakeEnd: 0.40,
    contentStart: 0.42, contentEnd: 0.50,
    buildStart: 0.50, buildGap: 0.070, buildDur: 0.085,
    title: 0.93
  };
  // 四张湖图各自的淡入起点 / 时长
  var LAKE_TL = [[0.02, 0.10], [0.10, 0.10], [0.19, 0.10], [0.27, 0.12]];

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
      .concat(ITEMS.map(function (it) { return loadImage(b + it.file, it.file); }));
    return Promise.all(jobs).then(function (imgs) {
      var lakes = imgs.slice(0, LAKES.length);
      var rest = imgs.slice(LAKES.length);
      var dims = {}, box = {};
      ITEMS.forEach(function (it, i) {
        dims[it.id] = rest[i];
        box[it.id] = alphaBox(rest[i]) || { x: 0, y: 0, w: rest[i].width, h: rest[i].height };
      });
      cache = {
        lakes: lakes,
        dims: dims,
        box: box,
        lakeBox: alphaBox(lakes[0]) || { x: 0, y: 0, w: lakes[0].width, h: lakes[0].height }
      };
      return cache;
    });
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
  function lakeTransform(c, w, h, area) {
    var p = projection(w, h, area);
    var cx = p.ox + MAP_CX * p.scale;
    var cy = p.oy + MAP_CY * p.scale;

    var masterW = c.lakes[0].width, masterH = c.lakes[0].height;
    var lb = c.lakeBox;
    var bcx = lb.x + lb.w / 2, bcy = lb.y + lb.h / 2;

    var s = Math.max(w / masterW, h / masterH, (2 * LAKE_RX * p.scale) / lb.w);
    return { s: s, x: cx - bcx * s, y: cy - bcy * s, w: masterW * s, h: masterH * s,
      cx: cx, cy: cy, rx: lb.w * s / 2, ry: lb.h * s / 2 };
  }

  function drawLakes(g, c, w, h, area, t) {
    var T = lakeTransform(c, w, h, area);
    for (var i = 0; i < c.lakes.length; i++) {
      var a = ramp(t, LAKE_TL[i][0], LAKE_TL[i][1]);
      if (a <= 0.002) continue;
      g.globalAlpha = a;
      g.drawImage(c.lakes[i], T.x, T.y, T.w, T.h);
    }
    g.globalAlpha = 1;
  }

  /* 六栋楼固定站位：只落在湖面上下的绿地里，绝不压到中间的蓝区 */
  var SLOTS = {
    move: { col: 0, row: 0 }, food: { col: 1, row: 0 }, dorm: { col: 2, row: 0 },
    culture: { col: 0, row: 1 }, sport: { col: 1, row: 1 }, study: { col: 2, row: 1 }
  };

  /* 某栋建筑在当前时刻的进度（0=还没开始，1=落位） */
  function localAt(t, rank) {
    return clamp01((t - TL.buildStart - rank * TL.buildGap) / TL.buildDur);
  }

  function drawBuildings(g, c, w, h, area, t, order, glowId) {
    var T = lakeTransform(c, w, h, area);
    var lakeTop = T.cy - T.ry, lakeBot = T.cy + T.ry;   // 蓝区的上下边界
    var colW = w / 3;
    var maxW = colW * 0.86;
    var rowTopH = Math.max(64, lakeTop * 0.68);          // 上排可用高度
    var rowBotH = Math.max(64, (h - lakeBot) * 0.72);    // 下排可用高度

    for (var i = 0; i < order.length; i++) {
      var it = order[i];
      var img = c.dims[it.id];
      if (!img) continue;
      var e = localAt(t, i);
      if (e <= 0.002) continue;
      var a = Math.min(1, e * 1.6);

      var slot = SLOTS[it.id] || { col: 1, row: 0 };
      var px = colW * (slot.col + 0.5);
      var isTop = slot.row === 0;
      var maxH = isTop ? rowTopH : rowBotH;

      var b = c.box[it.id];
      var sc = Math.min(maxW / b.w, maxH / b.h);
      var ks = 0.86 + 0.14 * e;
      var dw = b.w * sc * ks, dh = b.h * sc * ks;
      var dx = px - dw / 2;
      var rise = (1 - e) * dh * 0.6;
      var dy = isTop ? (lakeTop * 0.94 - dh + rise) : (lakeBot + (h - lakeBot) * 0.10 + rise);

      var isGlow = glowId && it.id === glowId && e > 0.25;

      g.save();
      g.globalAlpha = a;
      if (isGlow) {
        var gg = g.createRadialGradient(px, dy + dh * 0.6, 4, px, dy + dh * 0.6, Math.max(dw, dh) * 0.62);
        gg.addColorStop(0, "rgba(255, 214, 102, 0.42)");
        gg.addColorStop(0.5, "rgba(251, 191, 36, 0.16)");
        gg.addColorStop(1, "rgba(251, 191, 36, 0)");
        g.fillStyle = gg;
        g.beginPath();
        g.ellipse(px, dy + dh * 0.6, Math.max(dw, dh) * 0.52, Math.max(dw, dh) * 0.36, 0, 0, 6.283);
        g.fill();
      }
      g.drawImage(img, b.x, b.y, b.w, b.h, dx, dy, dw, dh);
      g.restore();

      // 名字：上排写在楼上方、下排写在楼下方，都不压蓝区
      var fs2 = Math.max(13, Math.min(19, w * 0.036));
      g.save();
      g.globalAlpha = a;
      g.textAlign = "center";
      g.textBaseline = isTop ? "bottom" : "top";
      g.font = "bold " + Math.round(fs2) + "px " + font();
      g.shadowColor = "rgba(255,255,255,.85)";
      g.shadowBlur = 10;
      g.fillStyle = isGlow ? "#b45309" : "#1f2937";
      g.fillText(it.name, px, isTop ? (dy - 6) : (dy + dh + 8));
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
    drawBuildings(g, cache, w, h, area, t, opts.order || ITEMS, opts.glow || null);
    drawTitle(g, w, h, area, t);
  }

  /* 自己驱动 rAF 的便捷入口（正常模式）；headless 里可以用 ui.js 的 ?still= 定格 */
  function play(o) {
    o = o || {};
    var canvas = o.canvas;
    var w = o.w, h = o.h, dpr = o.dpr || 1;
    var duration = o.duration || 14000;
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
    drawBuildings(g, cache, w, h, area, t, opts.order || ITEMS, opts.glow || null);
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
