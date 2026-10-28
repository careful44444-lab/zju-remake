/* render/finale.js —— 彩蛋：游戏地图上，真实地标从各自位置升起，背景换成启真湖
 *
 * 六张建筑图 + 一张启真湖背景。锚点复用游戏地图的方位（-90/-30/30/90/150/210 度，
 * 半径 300，地图逻辑空间 1000×1000），所以它们正好从「食住学体文行」六个台基上长出来。
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
  var LAKE = "lake.jpg";

  var KICKER = "改造计划 · 彩蛋";
  var TITLE = "这就是紫金港";
  var FOOT = "同人作品 · 与浙江大学官方无关";

  // 与 render/scene.js 完全一致的地图投影
  var MAP_CX = 500, MAP_CY = 500, MAP_R = 300, MAP_BOX = 820, PAD_W = 216;

  var cache = null;

  /* ---------- 加载 ---------- */

  function loadImage(src, name) {
    // 单文件版把素材内联成 data URL 了，优先用它
    var inline = (typeof window !== 'undefined' && window.__ZJU_FINALE_ASSETS__) || null;
    var real = (inline && name && inline[name]) ? inline[name] : src;
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error("图片加载失败：" + real.slice(0, 40))); };
      im.src = real;
    });
  }

  /* 透明边自动裁掉（这些图上下留白很多，不裁会显得很小） */
  function alphaBox(im) {
    var w = im.width, h = im.height;
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var g = c.getContext("2d");
    g.drawImage(im, 0, 0);
    var d;
    try { d = g.getImageData(0, 0, w, h).data; }
    catch (e) { return { x: 0, y: 0, w: w, h: h }; }
    var minX = w, minY = h, maxX = -1, maxY = -1;
    for (var y = 0; y < h; y++) {
      var row = y * w * 4;
      for (var x = 0; x < w; x++) {
        if (d[row + x * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { x: 0, y: 0, w: w, h: h };
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function load(base) {
    if (cache) return Promise.resolve(cache);
    var b = base || "../assets/finale/";
    return Promise.all([
      loadImage(b + LAKE, LAKE),
      Promise.all(ITEMS.map(function (it) { return loadImage(b + it.file, it.file); }))
    ]).then(function (res) {
      cache = {
        lake: res[0],
        items: res[1].map(function (img, i) {
          return { def: ITEMS[i], img: img, box: alphaBox(img) };
        })
      };
      return cache;
    });
  }

  /* ---------- 地图坐标 → 画布坐标 ---------- */

  /* area: 地图画布在屏幕上的矩形（CSS px）。不传就按整屏估一个 */
  function projection(w, h, area) {
    var a = area || { x: 0, y: Math.round(h * 0.11), w: w, h: Math.round(h * 0.76) };
    var scale = Math.min(a.w, a.h) / MAP_BOX;
    return {
      scale: scale,
      ox: a.x + (a.w - 1000 * scale) / 2,
      oy: a.y + (a.h - 1000 * scale) / 2,
      area: a
    };
  }

  function slotOf(item, pr) {
    var rad = item.angle * Math.PI / 180;
    var R2 = MAP_R * 0.80;              // 比游戏里收一点，建筑才不会被切到屏幕外
    var lx = MAP_CX + Math.cos(rad) * R2;
    var ly = MAP_CY + Math.sin(rad) * R2;
    var padW = PAD_W * pr.scale;
    return {
      cx: pr.ox + lx * pr.scale,
      cy: pr.oy + ly * pr.scale,
      baseY: pr.oy + ly * pr.scale + padW * 0.30,   // 站在台基下沿
      w: padW * 1.15,
      h: padW * 0.88
    };
  }

  /* ---------- 绘制 ---------- */

  function ease(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - Math.pow(1 - t, 3); }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function drawLake(g, w, h, t, alpha) {
    if (alpha <= 0.001) return;
    var lake = cache.lake;
    var zoom = lerp(1.16, 1.0, ease(clamp01(t / 0.7)));
    var s = Math.max(w / lake.width, h / lake.height) * 1.32 * zoom;
    var dw = lake.width * s, dh = lake.height * s;
    var focusX = 0.52, focusY = 0.45;
    var dx = w / 2 - dw * focusX;
    var dy = h * 0.46 - dh * focusY;
    dx = Math.min(0, Math.max(w - dw, dx));
    dy = Math.min(0, Math.max(h - dh, dy));

    g.save();
    g.globalAlpha = alpha;
    g.drawImage(lake, dx, dy, dw, dh);

    var gt = g.createLinearGradient(0, 0, 0, h);
    gt.addColorStop(0, "rgba(248,250,252,0.90)");
    gt.addColorStop(0.14, "rgba(248,250,252,0.42)");
    gt.addColorStop(0.32, "rgba(248,250,252,0.02)");
    gt.addColorStop(0.80, "rgba(248,250,252,0.06)");
    gt.addColorStop(0.95, "rgba(248,250,252,0.55)");
    gt.addColorStop(1, "rgba(248,250,252,0.86)");
    g.fillStyle = gt;
    g.fillRect(0, 0, w, h);
    g.restore();
  }

  function drawItem(g, it, slot, local, w, push) {
    var a = ease(local);
    if (a <= 0) return;
    var rise = (1 - a) * (slot.h * 0.55);      // 从台基下面升上来
    var sc = lerp(0.82, 1, a) * push;

    var bw = it.box.w, bh = it.box.h;
    var k = Math.min(slot.w / bw, slot.h / bh) * sc;
    var dw = bw * k, dh = bh * k;
    var dx = slot.cx - dw / 2;
    var dy = slot.baseY - dh + rise;

    g.save();
    g.globalAlpha = a * 0.13;
    g.fillStyle = "#0f172a";
    g.beginPath();
    g.ellipse(slot.cx, slot.baseY + 2, dw * 0.30, Math.max(3, dh * 0.045), 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.save();
    g.globalAlpha = a;
    g.drawImage(it.img, it.box.x, it.box.y, bw, bh, dx, dy, dw, dh);
    g.restore();

    // 名字标签：等建筑基本就位才出现
    var la = ease(clamp01((local - 0.55) / 0.45));
    if (la > 0) {
      var fs = Math.round(clamp01(slot.w / 150) * 13 + 3);
      g.save();
      g.globalAlpha = la;
      g.textAlign = "center";
      g.textBaseline = "top";
      g.lineJoin = "round";
      g.font = "700 " + fs + "px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
      g.strokeStyle = "rgba(255,255,255,0.92)";
      g.lineWidth = Math.max(3, fs * 0.36);
      g.strokeText(it.def.name, slot.cx, slot.baseY + 6);
      g.fillStyle = "#0f172a";
      g.fillText(it.def.name, slot.cx, slot.baseY + 6);
      g.restore();
    }
  }

  function drawText(g, w, h, t) {
    var a = ease(clamp01((t - 0.74) / 0.26));
    if (a <= 0) return;
    g.save();
    g.globalAlpha = a;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.font = "600 " + Math.round(w * 0.028) + "px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
    g.fillStyle = "#b45309";
    g.fillText(KICKER, w / 2, h * 0.062);
    g.font = "800 " + Math.round(w * 0.072) + "px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
    g.fillStyle = "#0f172a";
    g.fillText(TITLE, w / 2, h * 0.118);
    g.font = "500 " + Math.round(w * 0.024) + "px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
    g.fillStyle = "#94a3b8";
    g.fillText(FOOT, w / 2, h * 0.975);
    g.restore();
  }

  /* t: 0→1 进度；area: 地图画布矩形（可省略） */
  function draw(g, w, h, t, area) {
    var pr = projection(w, h, area);
    g.save();
    g.clearRect(0, 0, w, h);

    // 背景：整片草地慢慢换成启真湖
    drawLake(g, w, h, t, ease(clamp01(t / 0.78)));

    // 六个地标从各自台基上长出来
    var push = lerp(1, 1.06, ease(clamp01((t - 0.55) / 0.45)));
    for (var i = 0; i < cache.items.length; i++) {
      var slot = slotOf(cache.items[i].def, pr);
      slot.cx = (slot.cx - w / 2) * push + w / 2;
      slot.cy = (slot.cy - h / 2) * push + h / 2;
      slot.baseY = (slot.baseY - h / 2) * push + h / 2;
      slot.w *= push;
      slot.h *= push;
      var local = clamp01((t - (0.08 + i * 0.075)) / 0.42);
      drawItem(g, cache.items[i], slot, local, w, 1);
    }

    drawText(g, w, h, t);
    g.restore();
  }

  /* ---------- 播放 ---------- */

  function play(opts) {
    var o = opts || {};
    var canvas = o.canvas;
    if (!canvas) return Promise.reject(new Error("缺少 canvas"));
    var dpr = o.dpr || (window.devicePixelRatio || 1);
    var w = o.w || canvas.clientWidth || 480;
    var h = o.h || canvas.clientHeight || 900;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    var dur = o.duration || 3000;
    var start = 0;

    return load(o.base).then(function () {
      return new Promise(function (resolve) {
        function frame(ts) {
          if (!start) start = ts;
          var t = clamp01((ts - start) / dur);
          draw(g, w, h, t, o.area);
          if (t < 1) requestAnimationFrame(frame);
          else { if (o.onDone) o.onDone(); resolve(); }
        }
        requestAnimationFrame(frame);
      });
    });
  }

  return {
    ITEMS: ITEMS,
    load: load,
    draw: function (ctx, w, h, t, area) { return draw(ctx, w, h, t, area); },
    projection: projection,
    play: play,
    clearCache: function () { cache = null; }
  };
});
