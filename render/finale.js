/* render/finale.js —— 彩蛋：从游戏画面渐变到「真实的紫金港」
 *
 * 六张建筑图 + 一张启真湖背景，按 2×3 摆在湖上，逐个浮起。
 * 依赖：无（纯 canvas）。UMD：浏览器挂 window.ZJUFinale，Node 里 require。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ZJUFinale = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  /* 素材清单：id 与六个维度一一对应 */
  var ITEMS = [
    { id: "food", file: "food.png", dim: "食", name: "玉湖餐厅" },
    { id: "dorm", file: "dorm.png", dim: "住", name: "月牙楼" },
    { id: "study", file: "study.png", dim: "学", name: "求是大讲堂" },
    { id: "sport", file: "sport.png", dim: "体", name: "亚运篮球馆" },
    { id: "culture", file: "culture.png", dim: "文", name: "艺博馆" },
    { id: "move", file: "move.png", dim: "行", name: "南大门" }
  ];
  var LAKE = "lake.jpg";

  var TITLE = "这就是紫金港";
  var KICKER = "改造计划 · 彩蛋";
  var FOOT = "同人作品 · 与浙江大学官方无关";

  var cache = null; // { lake:{img,...}, items:[{img,box}], } }

  /* ---------- 加载 ---------- */

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error("图片加载失败：" + src)); };
      im.src = src;
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
    catch (e) { return { x: 0, y: 0, w: w, h: h }; } // 跨域就放弃裁边
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
    // 页面在 h5/ 下，素材在项目根的 assets/finale/
    var b = base || "../assets/finale/";
    return Promise.all([
      loadImage(b + LAKE),
      Promise.all(ITEMS.map(function (it) { return loadImage(b + it.file); }))
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

  /* ---------- 布局 ---------- */

  function layout(w, h) {
    var pad = Math.round(w * 0.05);
    var top = Math.round(h * 0.165);
    var bottom = Math.round(h * 0.07);
    var rows = 3, cols = 2;
    var cellH = (h - top - bottom) / rows;
    var cellW = (w - pad * 2) / cols;
    var out = [];
    for (var i = 0; i < 6; i++) {
      var r = Math.floor(i / cols), c = i % cols;
      var cellTop = top + cellH * r;
      out.push({
        cx: pad + cellW * (c + 0.5),
        // 图片区占一个格子上部，标签固定落在下面那条带子里，互不重叠
        imgCy: cellTop + cellH * 0.36,
        labelY: cellTop + cellH * 0.78,
        maxW: cellW * 0.92,
        maxH: cellH * 0.58
      });
    }
    return out;
  }

  /* ---------- 绘制 ---------- */

  function ease(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - Math.pow(1 - t, 3); }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawLake(g, w, h, t) {
    var lake = cache.lake;
    var zoom = lerp(1.12, 1.0, ease(clamp01(t / 0.55)));
    // 先铺满，再乘一个放大系数，并把「湖心」对准画面中部（原图是横构图，
    // 直接 cover 会只截到两侧的树林）
    var s = Math.max(w / lake.width, h / lake.height) * 1.32 * zoom;
    var dw = lake.width * s, dh = lake.height * s;
    var focusX = 0.52, focusY = 0.45;          // 湖心在原图里的相对位置
    var dx = w / 2 - dw * focusX;
    var dy = h * 0.46 - dh * focusY;
    // 别露出空白
    dx = Math.min(0, Math.max(w - dw, dx));
    dy = Math.min(0, Math.max(h - dh, dy));
    g.drawImage(lake, dx, dy, dw, dh);

    // 上下的软遮罩，只压住标题和尾注，湖面尽量露出来
    var gt = g.createLinearGradient(0, 0, 0, h);
    gt.addColorStop(0, "rgba(248,250,252,0.94)");
    gt.addColorStop(0.13, "rgba(248,250,252,0.55)");
    gt.addColorStop(0.28, "rgba(248,250,252,0.06)");
    gt.addColorStop(0.80, "rgba(248,250,252,0.10)");
    gt.addColorStop(0.94, "rgba(248,250,252,0.62)");
    gt.addColorStop(1, "rgba(248,250,252,0.90)");
    g.fillStyle = gt;
    g.fillRect(0, 0, w, h);
  }

  function drawItem(g, it, slot, local, w) {
    var a = ease(local);
    if (a <= 0) return;
    var lift = (1 - a) * 16;
    var sc = lerp(0.94, 1, a);

    var bw = it.box.w, bh = it.box.h;
    var k = Math.min(slot.maxW / bw, slot.maxH / bh) * sc;
    var dw = bw * k, dh = bh * k;
    var dx = slot.cx - dw / 2;
    var dy = slot.imgCy - dh / 2 + lift;

    // 地面投影
    g.save();
    g.globalAlpha = a * 0.14;
    g.fillStyle = "#0f172a";
    g.beginPath();
    g.ellipse(slot.cx, dy + dh + 3, dw * 0.32, Math.max(4, dh * 0.05), 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // 建筑
    g.save();
    g.globalAlpha = a;
    g.drawImage(it.img, it.box.x, it.box.y, bw, bh, dx, dy, dw, dh);
    g.restore();

    // 标签：固定落在格子下部，不跟着图片高度跑
    var fs = Math.round(w * 0.030);
    g.save();
    g.globalAlpha = a;
    g.textAlign = "center";
    g.textBaseline = "top";
    g.lineJoin = "round";
    var ly = slot.labelY + lift * 0.4;

    // 白描边，压在花花绿绿的湖面上也读得清
    g.font = "700 " + fs + "px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
    g.strokeStyle = "rgba(255,255,255,0.92)";
    g.lineWidth = Math.max(3, fs * 0.34);
    g.strokeText(it.def.name, slot.cx, ly);
    g.fillStyle = "#0f172a";
    g.fillText(it.def.name, slot.cx, ly);

    var fs2 = Math.round(fs * 0.82);
    g.font = "500 " + fs2 + "px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
    g.lineWidth = Math.max(3, fs2 * 0.34);
    g.strokeText(it.def.dim + " · 现实中的这一块", slot.cx, ly + fs + 5);
    g.fillStyle = "#64748b";
    g.fillText(it.def.dim + " · 现实中的这一块", slot.cx, ly + fs + 5);
    g.restore();
  }

  function drawText(g, w, h, t) {
    var a = ease(clamp01((t - 0.55) / 0.32));
    if (a <= 0) return;
    g.save();
    g.globalAlpha = a;
    g.textAlign = "center";

    // 顶部小字
    g.textBaseline = "alphabetic";
    g.font = "600 " + Math.round(w * 0.030) + "px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
    g.fillStyle = "#b45309";
    g.fillText(KICKER, w / 2, h * 0.075);

    // 主标题
    g.font = "800 " + Math.round(w * 0.078) + "px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
    g.fillStyle = "#0f172a";
    g.fillText(TITLE, w / 2, h * 0.135);

    // 尾注
    g.font = "500 " + Math.round(w * 0.026) + "px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
    g.fillStyle = "#94a3b8";
    g.fillText(FOOT, w / 2, h * 0.975);
    g.restore();
  }

  function draw(g, w, h, t) {
    g.save();
    g.fillStyle = "#f8fafc";
    g.fillRect(0, 0, w, h);
    drawLake(g, w, h, t);
    var slots = layout(w, h);
    for (var i = 0; i < cache.items.length; i++) {
      var local = clamp01((t - (0.16 + i * 0.085)) / 0.30);
      drawItem(g, cache.items[i], slots[i], local, w);
    }
    drawText(g, w, h, t);
    g.restore();
  }

  /* ---------- 播放 ---------- */

  /* opts: {canvas, w, h, dpr, duration, onDone} */
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

    var dur = o.duration || 2600;
    var start = 0;

    return load(o.base).then(function () {
      return new Promise(function (resolve) {
        function frame(ts) {
          if (!start) start = ts;
          var t = clamp01((ts - start) / dur);
          draw(g, w, h, t);
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
    draw: function (ctx, w, h, t) { return draw(ctx, w, h, t); },
    layout: layout,
    play: play,
    clearCache: function () { cache = null; }
  };
});
