/* 紫金港改造计划 · 地图渲染
 * Canvas 2D，逻辑坐标 1000x1000，浏览器与小程序共用。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./palette.js'), require('../game/config.js'), null);
  } else {
    var z = root.ZJU || {};
    var mod = factory(z, z, z);
    for (var k in mod) root.ZJU[k] = mod[k];
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P, C, Z) {

  var FONT = '"PingFang SC","Microsoft YaHei","Hiragino Sans GB",sans-serif';
  var CX = 500, CY = 500, R = 300;
  var PAD_W = 216, PAD_H = 152;

  var TIER_COLOR = {
    1: [122, 136, 148],
    2: [147, 165, 160],
    3: [121, 184, 160],
    4: [224, 185, 104],
    5: [255, 215, 106]
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function rr(ctx, x, y, w, h, r) {
    var m = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + m, y);
    ctx.lineTo(x + w - m, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + m);
    ctx.lineTo(x + w, y + h - m);
    ctx.quadraticCurveTo(x + w, y + h, x + w - m, y + h);
    ctx.lineTo(x + m, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - m);
    ctx.lineTo(x, y + m);
    ctx.quadraticCurveTo(x, y, x + m, y);
    ctx.closePath();
  }

  function Scene(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dims = C.DIMS;
    this.anim = {};
    this.target = {};
    this.pulse = {};
    this.caps = {};
    this.zones = {};
    this.synergy = [];
    this.selected = null;
    this.bursts = [];
    this.time = 0;
    this.last = 0;
    this.mood = 3;
    this.moodTarget = 3;
    this.running = false;

    var self = this;
    this.dims.forEach(function (d) {
      var a = d.angle * Math.PI / 180;
      self.zones[d.id] = { x: CX + Math.cos(a) * R, y: CY + Math.sin(a) * R };
      self.anim[d.id] = d.init;
      self.target[d.id] = d.init;
      self.pulse[d.id] = 0;
    });

    var rnd = mulberry32(20240917);
    this.rand = rnd;
    this.trees = [];
    var rr2 = mulberry32(777);
    for (var i = 0; i < 150; i++) {
      var ok = false, x = 0, y = 0;
      for (var tryN = 0; tryN < 40 && !ok; tryN++) {
        x = -320 + rr2() * 1640;
        y = -320 + rr2() * 1640;
        ok = true;
        var dxl = (x - CX) / 200, dyl = (y - CY) / 150;
        if (dxl * dxl + dyl * dyl < 1) ok = false;
        for (var j = 0; j < this.dims.length && ok; j++) {
          var p = this.zones[this.dims[j].id];
          if (Math.hypot(x - p.x, y - p.y) < 165) ok = false;
        }
      }
      if (ok) this.trees.push({ x: x, y: y, s: 0.6 + rr2() * 0.9, ph: rr2() * 6.28 });
    }

    this.drops = [];
    for (var k = 0; k < 70; k++) {
      this.drops.push({ x: rnd() * 1000, y: rnd() * 1000, sp: 260 + rnd() * 340, ln: 12 + rnd() * 22 });
    }
    this.petals = [];
    for (var m = 0; m < 46; m++) {
      this.petals.push({ x: rnd() * 1000, y: rnd() * 1000, sp: 14 + rnd() * 30, ph: rnd() * 6.28, r: 2 + rnd() * 3 });
    }
    this.stars = [];
    for (var n = 0; n < 60; n++) {
      this.stars.push({ x: rnd() * 1000, y: rnd() * 1000, ph: rnd() * 6.28, r: 1 + rnd() * 2.2 });
    }

    this.resize();
    this._loop = this.loop.bind(this);
  }

  Scene.prototype.resize = function () {
    var c = this.canvas;
    var cssW = c.clientWidth || 360;
    var cssH = c.clientHeight || 480;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    this.cssW = cssW; this.cssH = cssH; this.dpr = dpr;
    this.scale = Math.min(cssW, cssH) / 820;
    this.ox = (cssW - 1000 * this.scale) / 2;
    this.oy = (cssH - 1000 * this.scale) / 2;
  };

  Scene.prototype.setState = function (s) {
    var self = this;
    this.dims.forEach(function (d) {
      var t = s.tiers[d.id];
      if (t !== self.target[d.id]) {
        self.pulse[d.id] = 1;
        if (t > self.target[d.id]) self.burst(d.id, TIER_COLOR[t]);
      }
      self.target[d.id] = t;
      self.caps[d.id] = s.caps ? s.caps[d.id] : null;
    });
    var sum = 0;
    this.dims.forEach(function (d) { sum += self.target[d.id]; });
    this.moodTarget = sum / this.dims.length;
    this.synergy = (s.synergyIds || []).slice();
  };

  Scene.prototype.select = function (id) { this.selected = id; };

  Scene.prototype.burst = function (id, color) {
    var p = this.zones[id];
    for (var i = 0; i < 26; i++) {
      var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 150;
      this.bursts.push({
        x: p.x, y: p.y - 30,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: 0.7 + Math.random() * 0.5, t: 0,
        r: 1.5 + Math.random() * 3,
        c: color || [255, 230, 160]
      });
    }
  };

  Scene.prototype.hitTest = function (clientX, clientY) {
    var r = this.canvas.getBoundingClientRect();
    var lx = (clientX - r.left - this.ox) / this.scale;
    var ly = (clientY - r.top - this.oy) / this.scale;
    var best = null, bestD = 1e9;
    for (var i = 0; i < this.dims.length; i++) {
      var d = this.dims[i], p = this.zones[d.id];
      var dx = Math.abs(lx - p.x) - PAD_W / 2;
      var dy = Math.abs(ly - p.y) - PAD_H / 2;
      var dist = Math.max(0, Math.hypot(Math.max(0, dx), Math.max(0, dy)));
      if (dist < 90 && dist < bestD) { best = d.id; bestD = dist; }
    }
    return best;
  };

  Scene.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this._loop);
  };
  Scene.prototype.stop = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  };

  Scene.prototype.loop = function (ts) {
    if (!this.running) return;
    var dt = this.last ? Math.min(0.05, (ts - this.last) / 1000) : 0.016;
    this.last = ts;
    this.time += dt;
    var k = 1 - Math.pow(0.0008, dt);
    for (var i = 0; i < this.dims.length; i++) {
      var id = this.dims[i].id;
      this.anim[id] += (this.target[id] - this.anim[id]) * k * 0.9;
      this.pulse[id] = Math.max(0, this.pulse[id] - dt * 1.8);
    }
    this.mood += (this.moodTarget - this.mood) * k * 0.7;

    for (var b = this.bursts.length - 1; b >= 0; b--) {
      var q = this.bursts[b];
      q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 190 * dt; q.vx *= 0.98;
      if (q.t > q.life) this.bursts.splice(b, 1);
    }
    this.draw();
    this.raf = requestAnimationFrame(this._loop);
  };

  // ---------------------------------------------------------------- 绘制

  Scene.prototype.draw = function () {
    var ctx = this.ctx, W = this.cssW, H = this.cssH, dpr = this.dpr;
    var pal = P.palAt(this.mood);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var gg = ctx.createLinearGradient(0, 0, 0, H);
    gg.addColorStop(0, P.css(P.shade(pal.grass, 1.04)));
    gg.addColorStop(0.55, P.css(pal.grass));
    gg.addColorStop(1, P.css(P.shade(pal.grass, 0.72)));
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, W, H);
    var rg = ctx.createRadialGradient(W * 0.5, H * 0.34, 10, W * 0.5, H * 0.5, Math.max(W, H) * 0.95);
    rg.addColorStop(0, 'rgba(255,255,255,.085)');
    rg.addColorStop(0.6, 'rgba(255,255,255,0)');
    rg.addColorStop(1, 'rgba(0,0,0,.22)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.ox, dpr * this.oy);

    this.drawGround(pal);
    this.drawLake(pal);
    this.drawRoads(pal);
    this.drawTrees(pal);

    // 彩蛋：背景层（启真湖）画在游戏背景之上、地块之下
    if (this.backdrop) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.backdrop(ctx, W, H);
      ctx.restore();
    }

    var order = this.dims.slice();
    ctx.save();
    ctx.globalAlpha = (this.contentAlpha == null ? 1 : this.contentAlpha);
    for (var i = 0; i < order.length; i++) {
      var zA = this.zoneAlpha ? this.zoneAlpha(order[i]) : 1;
      if (zA <= 0.01) continue;                    // 彩蛋里被真建筑替换掉的地块直接不画
      ctx.globalAlpha = (this.contentAlpha == null ? 1 : this.contentAlpha) * zA;
      this.drawZone(order[i], pal);
    }
    ctx.globalAlpha = (this.contentAlpha == null ? 1 : this.contentAlpha);
    this.drawSynergy(pal);
    ctx.restore();

    // 彩蛋：前景层（真实建筑 / 标题）画在地块之上
    if (this.overlay) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.overlay(ctx, W, H);
      ctx.restore();
    }
    this.drawWeather(pal);
    this.drawBursts();
    this.drawVignette();
  };

  Scene.prototype.drawGround = function (pal) {
    var ctx = this.ctx;
    ctx.save();
    // 草地斑块（延伸到画布外，避免上下留白）
    var rnd = mulberry32(4242);
    for (var i = 0; i < 90; i++) {
      var x = -320 + rnd() * 1640, y = -320 + rnd() * 1640;
      var r = 18 + rnd() * 60;
      ctx.fillStyle = P.css(P.shade(pal.grass, 0.9 + rnd() * 0.18), 0.42);
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, rnd() * 3, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  };

  Scene.prototype.drawLake = function (pal) {
    var ctx = this.ctx, t = this.time;
    ctx.save();
    // 湖岸
    ctx.fillStyle = P.css(P.shade(pal.ground, 1.05));
    ctx.beginPath(); ctx.ellipse(CX, CY, 208, 158, 0, 0, 6.283); ctx.fill();

    var g = ctx.createRadialGradient(CX - 40, CY - 40, 20, CX, CY, 200);
    g.addColorStop(0, P.css(P.shade(pal.water, 1.15)));
    g.addColorStop(0.65, P.css(pal.water));
    g.addColorStop(1, P.css(P.shade(pal.water, 0.88)));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(CX, CY, 188, 140, 0, 0, 6.283); ctx.fill();

    // 波纹
    ctx.strokeStyle = P.css(P.shade(pal.water, 1.3), 0.4);
    ctx.lineWidth = 2;
    for (var i = 0; i < 4; i++) {
      var ph = (t * 0.22 + i * 0.25) % 1;
      ctx.globalAlpha = 0.35 * (1 - ph);
      ctx.beginPath();
      ctx.ellipse(CX + 10, CY - 6, 40 + ph * 130, 26 + ph * 92, 0.1, 0, 6.283);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 反光
    ctx.fillStyle = P.css([255, 255, 255], 0.35);
    ctx.beginPath(); ctx.ellipse(CX - 60, CY - 44, 54, 20, -0.5, 0, 6.283); ctx.fill();

    ctx.fillStyle = 'rgba(30, 58, 95, 0.75)';
    ctx.font = '700 20px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('启 真 湖', CX, CY + 6);
    ctx.font = '500 13px ' + FONT;
    ctx.fillStyle = 'rgba(50, 80, 115, 0.55)';
    ctx.fillText('ZU  ·  ZIJINGANG', CX, CY + 30);
    ctx.restore();
  };

  Scene.prototype.drawRoads = function (pal) {
    var ctx = this.ctx;
    var pts = this.dims.map(function (d) { return this.zones[d.id]; }, this);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // 路基
    ctx.strokeStyle = P.css(P.shade(pal.road, 0.6), 0.85);
    ctx.lineWidth = 44;
    this.pathPoly(pts); ctx.stroke();
    // 路面
    ctx.strokeStyle = P.css(pal.road);
    ctx.lineWidth = 34;
    this.pathPoly(pts); ctx.stroke();
    // 中线
    ctx.strokeStyle = P.css([255, 255, 255], 0.3);
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 24]);
    ctx.lineDashOffset = -this.time * 26;
    this.pathPoly(pts); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };

  Scene.prototype.pathPoly = function (pts) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  };

  Scene.prototype.polyPoint = function (pts, u) {
    var n = pts.length;
    var seg = 1 / n;
    var i = Math.min(n - 1, Math.floor(u / seg));
    var f = (u - i * seg) / seg;
    var a = pts[i], b = pts[(i + 1) % n];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  };

  Scene.prototype.drawTrees = function (pal) {
    var ctx = this.ctx;
    for (var i = 0; i < this.trees.length; i++) {
      var tr = this.trees[i];
      var s = tr.s * 9;
      var sway = Math.sin(this.time * 1.1 + tr.ph) * 1.6;
      ctx.fillStyle = P.css(P.shade(pal.grass, 0.55), 0.5);
      ctx.beginPath(); ctx.ellipse(tr.x + 2, tr.y + 3, s * 0.8, s * 0.34, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = P.css(P.shade(pal.grass, 0.74 + (i % 3) * 0.08));
      ctx.beginPath(); ctx.arc(tr.x + sway, tr.y - s * 0.5, s * 0.62, 0, 6.283); ctx.fill();
      ctx.fillStyle = P.css(P.shade(pal.grass, 1.06), 0.7);
      ctx.beginPath(); ctx.arc(tr.x + sway - s * 0.18, tr.y - s * 0.72, s * 0.36, 0, 6.283); ctx.fill();
    }
  };

  Scene.prototype.drawSynergy = function (pal) {
    if (!this.synergy.length) return;
    var ctx = this.ctx, t = this.time;
    var map = { life: ['food', 'dorm'], edu: ['study', 'sport'], city: ['move', 'culture'] };
    var self = this;
    this.synergy.forEach(function (id) {
      var pair = map[id];
      if (!pair) return;
      var a = self.zones[pair[0]], b = self.zones[pair[1]];
      ctx.save();
      ctx.strokeStyle = P.css([255, 218, 120], 0.35 + 0.25 * Math.sin(t * 2.4));
      ctx.lineWidth = 5;
      ctx.setLineDash([14, 14]);
      ctx.lineDashOffset = -t * 40;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
    });
  };

  // ---- 单个地块 ----
  Scene.prototype.drawZone = function (d, pal) {
    if (this.hideAllZones) return;   // 彩蛋期间地块全部由彩蛋自己画，顺序只由一条时间轴决定
    var ctx = this.ctx, self = this;
    var zm = (this.zoneMap && this.zoneMap[d.id]) || null;
    var zoneA = zm && zm.zone != null ? zm.zone : 1;   // 建筑本体的透明度（彩蛋里被真建筑替代时淡出）
    if (zoneA <= 0.002) zoneA = 0;
    var t = this.anim[d.id];
    var p = this.zones[d.id];
    var tier = Math.max(1, Math.min(5, Math.round(t)));
    var col = TIER_COLOR[tier];
    var build = P.buildAt(t);
    var pulse = this.pulse[d.id];
    var sc = 1 + pulse * 0.07;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(sc, sc);
    ctx.translate(-p.x, -p.y);

    // 彩蛋：只藏白台基，建筑和文字照画
    ctx.save();
    if (this.hidePads) ctx.globalAlpha = 0;

    // 阴影
    ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + PAD_H / 2 - 4, PAD_W / 2 - 4, 24, 0, 0, 6.283); ctx.fill();

    // 台基
    ctx.fillStyle = 'rgba(226, 232, 240, 0.8)';
    rr(ctx, p.x - PAD_W / 2, p.y - PAD_H / 2 + 6, PAD_W, PAD_H, 24); ctx.fill();

    var pg = ctx.createLinearGradient(0, p.y - PAD_H / 2, 0, p.y + PAD_H / 2);
    pg.addColorStop(0, '#ffffff');
    pg.addColorStop(1, '#f1f5f9');
    ctx.fillStyle = pg;
    rr(ctx, p.x - PAD_W / 2, p.y - PAD_H / 2, PAD_W, PAD_H - 6, 24); ctx.fill();

    // 台基描边
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.8)';
    ctx.lineWidth = 1.5;
    rr(ctx, p.x - PAD_W / 2 + 1, p.y - PAD_H / 2 + 1, PAD_W - 2, PAD_H - 8, 23); ctx.stroke();

    // 选中圈
    if (this.selected === d.id) {
      ctx.save();
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 3.5;
      ctx.setLineDash([9, 9]);
      ctx.lineDashOffset = -this.time * 30;
      rr(ctx, p.x - PAD_W / 2 - 9, p.y - PAD_H / 2 - 9, PAD_W + 18, PAD_H + 12, 30);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // —— 以下（跑道/建筑/装饰/信物）属于「建筑本体」，彩蛋替换时单独淡出 ——
    var g0 = ctx.globalAlpha;
    ctx.globalAlpha = g0 * zoneA;
    if (zoneA > 0.002) {
    // 场馆类：先画跑道
    if (d.motif === 'track') this.drawTrack(p, t);

    // 建筑
    var boxes = this.layout(d.motif, t);
    boxes.sort(function (a, b) { return a.dy - b.dy; });
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      this.box(p.x + b.dx, p.y + b.dy, b.w, b.h, b.hh, build, t, tier, d.motif);
    }

    // 母题装饰
    this.decor(d, p, t, tier, col);

    // 档位信物（config.RELICS = false 可关掉，回到纯建筑版）
    if (C.RELICS !== false && Z && Z.drawRelic) this.relic(d, p, t, tier);

    }
    ctx.globalAlpha = g0;
    if (window.__FIN_DBG) { var _d = ctx.getImageData(Math.round(p.x * (window.devicePixelRatio||1)), Math.round((p.y - 60) * (window.devicePixelRatio||1)), 1, 1).data; console.log("px", d.id, _d[0], _d[1], _d[2], _d[3]); }

    if (!this.hidePads) {
    // 档位徽章
    var bx = p.x + PAD_W / 2 - 6, by = p.y - PAD_H / 2 + 4;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(bx, by, 20, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(tier), bx, by + 1);
    }

    // 名称（彩蛋里 name 会被换成真实建筑名）
    var ly = p.y + PAD_H / 2 + 38;
    var ct = (this.contentLookup && this.contentLookup(d.id, tier)) || null;
    var bigName = (zm && zm.name) ? zm.name : d.name;
    var swapped = !!(zm && zm.name);
    var glow = !!(zm && zm.glow);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

    if (glow) {
      // 金色光晕：玩家最看重的那一维
      var gg2 = ctx.createRadialGradient(p.x, ly - 8, 6, p.x, ly - 8, 96);
      gg2.addColorStop(0, 'rgba(252, 211, 77, 0.75)');
      gg2.addColorStop(0.45, 'rgba(251, 191, 36, 0.30)');
      gg2.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = gg2;
      ctx.beginPath(); ctx.ellipse(p.x, ly - 6, 96, 54, 0, 0, 6.283); ctx.fill();
    }

    if (swapped) {
      // 建筑名：不加白描边，用极淡的暗影保证在湖面上可读
      ctx.font = 'bold 30px ' + FONT;
      ctx.save();
      ctx.shadowColor = 'rgba(255, 255, 255, 0.55)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = glow ? '#b45309' : '#0f172a';
      ctx.fillText(bigName, p.x, ly);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.font = 'bold 34px ' + FONT;
      ctx.fillText(bigName, p.x + 1, ly + 1);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(bigName, p.x, ly);
    }

    if (ct) {
      ctx.font = '700 19px ' + FONT;
      ctx.fillStyle = glow ? '#b45309' : '#2563eb';
      ctx.fillText(swapped ? (d.name + ' · ' + ct.title) : ct.title, p.x, ly + 26);
    }
    ctx.font = '600 14px ' + FONT;
    ctx.fillStyle = '#64748b';
    ctx.fillText('T' + tier + ' · ' + C.TIERS[tier - 1].name, p.x, ly + 47);

    ctx.restore();
  };

  Scene.prototype.layout = function (motif, t) {
    var hh = function (base, per) { return base + per * t; };
    if (motif === 'steam') {
      return [
        { dx: 0, dy: 18, w: 112, h: 60, hh: hh(28, 9) },
        { dx: -72, dy: 40, w: 54, h: 34, hh: hh(12, 3) }
      ];
    }
    if (motif === 'window') {
      return [
        { dx: -58, dy: 30, w: 42, h: 34, hh: hh(34, 15) },
        { dx: 0, dy: 16, w: 46, h: 36, hh: hh(42, 18) },
        { dx: 60, dy: 34, w: 42, h: 34, hh: hh(30, 14) }
      ];
    }
    if (motif === 'book') {
      return [
        { dx: -16, dy: 20, w: 98, h: 58, hh: hh(26, 10) },
        { dx: 66, dy: 44, w: 46, h: 32, hh: hh(14, 5) }
      ];
    }
    if (motif === 'track') {
      return [
        { dx: 0, dy: -14, w: 122, h: 40, hh: hh(12, 7) }
      ];
    }
    if (motif === 'stage') {
      return [
        { dx: 0, dy: 40, w: 116, h: 54, hh: hh(14, 5) },
        { dx: -74, dy: 52, w: 26, h: 26, hh: hh(34, 7) },
        { dx: 74, dy: 52, w: 26, h: 26, hh: hh(34, 7) }
      ];
    }
    // bus
    return [
      { dx: -22, dy: 34, w: 108, h: 44, hh: hh(20, 4) },
      { dx: 52, dy: 20, w: 30, h: 28, hh: hh(38, 9) }
    ];
  };

  Scene.prototype.box = function (x, y, w, h, hh, build, t, tier, motif) {
    var ctx = this.ctx;
    var dep = 12 + t * 2.5;
    var top = y - hh;

    // 右侧面
    ctx.fillStyle = P.css(build.side);
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2 + dep, y - dep);
    ctx.lineTo(x + w / 2 + dep, top - dep);
    ctx.lineTo(x + w / 2, top);
    ctx.closePath(); ctx.fill();

    // 正面
    ctx.fillStyle = P.css(build.wall);
    ctx.fillRect(x - w / 2, top, w, hh);

    // 顶面
    ctx.fillStyle = P.css(build.roof);
    ctx.beginPath();
    ctx.moveTo(x - w / 2, top);
    ctx.lineTo(x + w / 2, top);
    ctx.lineTo(x + w / 2 + dep, top - dep);
    ctx.lineTo(x - w / 2 + dep, top - dep);
    ctx.closePath(); ctx.fill();

    // 窗
    if (hh > 22) {
      var rows = Math.max(2, Math.floor(hh / 22));
      var cols = Math.max(2, Math.floor(w / 22));
      var padX = w * 0.14, padY = hh * 0.16;
      var cw = (w - padX * 2) / cols, ch = (hh - padY * 2) / rows;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var lit = (tier >= 3) && ((r * 7 + c * 3 + Math.floor(this.time * 0.6 + r)) % 4 !== 0);
          ctx.fillStyle = lit ? P.css(build.lit, 0.55 + 0.35 * Math.sin(this.time + r + c)) : P.css(build.win, 0.85);
          ctx.fillRect(x - w / 2 + padX + c * cw + 1.5, top + padY + r * ch + 1.5, cw - 3.5, ch - 3.5);
        }
      }
      if (tier >= 4) {
        ctx.save();
        ctx.shadowColor = P.css(build.lit, 0.9);
        ctx.shadowBlur = 16;
        ctx.fillStyle = P.css(build.lit, 0.12);
        ctx.fillRect(x - w / 2, top, w, hh);
        ctx.restore();
      }
    }
  };

  Scene.prototype.drawTrack = function (p, t) {
    var ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = P.css([190, 96, 82], 0.85);
    ctx.lineWidth = 16 + t * 1.5;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 30, 94, 42, 0, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = P.css([255, 255, 255], 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 30, 94, 42, 0, 0, 6.283); ctx.stroke();
    ctx.restore();
  };

  // 楼前的「档位信物」：一个小台座 + 代表这个档位的物件
  // 楼前的「档位信物」：圆底徽章 + 代表这个档位的物件
  Scene.prototype.relic = function (d, p, t, tier) {
    var ctx = this.ctx;
    var ry = p.y + PAD_H / 2 - 30;
    var pulse = this.pulse[d.id] || 0;
    var pop = pulse > 0.02 ? 1 + pulse * 0.3 : 1;
    var R = 25;

    ctx.save();

    // 投影
    ctx.beginPath();
    ctx.ellipse(p.x + 1, ry + R - 2, R - 3, 7, 0, 0, 6.283);
    ctx.fillStyle = "rgba(15,23,42,.09)";
    ctx.fill();

    // 圆底
    ctx.beginPath(); ctx.arc(p.x, ry, R, 0, 6.283);
    ctx.fillStyle = tier >= 5 ? "#fffbeb" : "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = tier >= 5 ? "#f59e0b" : (tier >= 4 ? "#fcd34d" : "rgba(203,213,225,.95)");
    ctx.stroke();

    // T5 光晕
    if (tier >= 5) {
      var g = ctx.createRadialGradient(p.x, ry, R, p.x, ry, R + 22);
      g.addColorStop(0, "rgba(245,158,11,.30)");
      g.addColorStop(1, "rgba(245,158,11,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, ry, R + 22, 0, 6.283); ctx.fill();
    }

    Z.drawRelic(ctx, d.motif, tier, p.x, ry, 40 * pop, {});
    ctx.restore();
  };

  Scene.prototype.decor = function (d, p, t, tier, col) {
    var ctx = this.ctx;
    if (d.motif === 'steam') {
      for (var i = 0; i < 4; i++) {
        var ph = (this.time * 0.5 + i * 0.25) % 1;
        var px = p.x - 10 + i * 12 + Math.sin(this.time + i) * 8;
        var py = p.y + 10 - ph * (60 + t * 12);
        ctx.fillStyle = P.css([255, 255, 255], 0.16 * (1 - ph));
        ctx.beginPath(); ctx.arc(px, py, 8 + ph * 16, 0, 6.283); ctx.fill();
      }
      if (t > 4.4) {
        var roofY = p.y + 18 - (28 + 9 * t) - 4;
        ctx.fillStyle = P.css([255, 214, 110], 0.92);
        ctx.beginPath(); ctx.arc(p.x, roofY - 8, 13, 0, 6.283); ctx.fill();
        ctx.strokeStyle = P.css(col, 0.9); ctx.lineWidth = 2; ctx.stroke();
      }
    } else if (d.motif === 'stage') {
      if (t > 4.2) {
        ctx.save();
        for (var b = 0; b < 5; b++) {
          var a = -Math.PI / 2 + (b - 2) * 0.32 + Math.sin(this.time * 1.2 + b) * 0.06;
          ctx.strokeStyle = P.css([255, 220, 150], 0.18);
          ctx.lineWidth = 14;
          ctx.beginPath();
          ctx.moveTo(p.x + (b - 2) * 18, p.y + 30);
          ctx.lineTo(p.x + (b - 2) * 18 + Math.cos(a) * 190, p.y + 30 + Math.sin(a) * 190);
          ctx.stroke();
        }
        ctx.restore();
        // 烟花
        for (var f = 0; f < 3; f++) {
          var ft = (this.time * 0.5 + f * 0.33) % 1;
          var fx = p.x + Math.sin(f * 2.1) * 54, fy = p.y - 60 - ft * 70;
          ctx.strokeStyle = P.css([255, 180 + f * 20, 200], 0.6 * (1 - ft));
          ctx.lineWidth = 2;
          for (var k = 0; k < 8; k++) {
            var ang = k / 8 * 6.283 + ft * 2;
            ctx.beginPath();
            ctx.moveTo(fx + Math.cos(ang) * 6, fy + Math.sin(ang) * 6);
            ctx.lineTo(fx + Math.cos(ang) * (10 + ft * 26), fy + Math.sin(ang) * (10 + ft * 26));
            ctx.stroke();
          }
        }
      }
    } else if (d.motif === 'track' && t > 2.5) {
      for (var r = 0; r < 3; r++) {
        var ang2 = this.time * (0.5 + r * 0.12) + r * 2.1;
        var rx = p.x + Math.cos(ang2) * 94, ry = p.y + 30 + Math.sin(ang2) * 42;
        ctx.fillStyle = P.css([255, 255, 255], 0.8);
        ctx.beginPath(); ctx.arc(rx, ry, 3.4, 0, 6.283); ctx.fill();
      }
    } else if (d.motif === 'book') {
      // 一堆书
      var bx = p.x - 84, by = p.y + 44;
      var ws = [30, 25, 20];
      for (var bi = 0; bi < 3; bi++) {
        ctx.fillStyle = P.css([[168, 96, 68], [198, 132, 92], [222, 178, 120]][bi], 0.92);
        ctx.fillRect(bx + (bi === 1 ? 2 : 0), by - bi * 8, ws[bi], 7);
      }
    } else if (d.motif === 'bus' && t > 2) {
      // 候车的人
      for (var q = 0; q < 3; q++) {
        var qx = p.x - 18 + q * 16, qy = p.y + 44 + Math.sin(this.time * 1.5 + q) * 1.2;
        ctx.fillStyle = P.css([40, 46, 52], 0.75);
        ctx.beginPath(); ctx.arc(qx, qy - 8, 3.6, 0, 6.283); ctx.fill();
        ctx.fillRect(qx - 3, qy - 4, 6, 9);
      }
    }

    // 封神专精的小旗
    var cap = this.caps[d.id];
    if (cap) {
      var tint = P.CAP_TINT[cap] || [255, 220, 140];
      ctx.save();
      ctx.strokeStyle = P.css([255, 255, 255], 0.55);
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(p.x - 90, p.y - 18); ctx.lineTo(p.x - 90, p.y - 70); ctx.stroke();
      ctx.fillStyle = P.css(tint, 0.95);
      ctx.beginPath();
      ctx.moveTo(p.x - 90, p.y - 70);
      ctx.lineTo(p.x - 52, p.y - 61);
      ctx.lineTo(p.x - 90, p.y - 50);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  };

  Scene.prototype.drawWeather = function (pal) {
    var ctx = this.ctx, w = pal.weather;
    if (w === 'rain' || w === 'drizzle') {
      var a = w === 'rain' ? 0.28 : 0.14;
      ctx.save();
      ctx.strokeStyle = P.css([200, 220, 240], a);
      ctx.lineWidth = w === 'rain' ? 2.4 : 1.3;
      for (var i = 0; i < this.drops.length; i++) {
        var d = this.drops[i];
        var y = (d.y + this.time * d.sp) % 1080 - 40;
        var x = (d.x + y * 0.18) % 1000;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + d.ln * 0.18, y + d.ln);
        ctx.stroke();
      }
      ctx.restore();
    } else if (w === 'petal') {
      ctx.save();
      for (var j = 0; j < this.petals.length; j++) {
        var p = this.petals[j];
        var yy = (p.y + this.time * p.sp) % 1040;
        var xx = (p.x + Math.sin(this.time * 0.8 + p.ph) * 26 + 1000) % 1000;
        ctx.fillStyle = P.css([255, 190, 210], 0.42);
        ctx.beginPath(); ctx.ellipse(xx, yy, p.r, p.r * 0.62, this.time + p.ph, 0, 6.283); ctx.fill();
      }
      ctx.restore();
    } else if (w === 'sparkle') {
      ctx.save();
      for (var k = 0; k < this.stars.length; k++) {
        var s = this.stars[k];
        var tw = 0.35 + 0.65 * Math.abs(Math.sin(this.time * 1.6 + s.ph));
        ctx.fillStyle = P.css([255, 248, 210], 0.55 * tw);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * tw * 1.6, 0, 6.283); ctx.fill();
      }
      // 少量金线
      ctx.strokeStyle = P.css([255, 226, 150], 0.25);
      ctx.lineWidth = 1.5;
      for (var m = 0; m < 6; m++) {
        var ax = 120 + m * 150, ay = 120 + (m % 3) * 100;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 40, ay + 22); ctx.stroke();
      }
      ctx.restore();
    }
  };

  Scene.prototype.drawBursts = function () {
    var ctx = this.ctx;
    for (var i = 0; i < this.bursts.length; i++) {
      var b = this.bursts[i];
      var a = Math.max(0, 1 - b.t / b.life);
      ctx.fillStyle = P.css(b.c, a * 0.95);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * a + 0.6, 0, 6.283); ctx.fill();
    }
  };

  Scene.prototype.drawVignette = function () {
    var ctx = this.ctx;
    ctx.save();
    var g = ctx.createRadialGradient(CX, CY, 320, CX, CY, 820);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(240,244,248,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(-500, -500, 2000, 2000);
    ctx.restore();
  };

  return { Scene: Scene };
});
