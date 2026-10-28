/* 紫金港地标剪影（彩蛋用）
 *
 * 参照真实建筑的轮廓提炼：只画认得出的那几笔。
 * 坐标系 200 × 130，底线 y = 118，原点左上。
 *
 *   ZJU.drawLandmark(ctx, 'food', cx, cy, size, { color, detail, ground })
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { var m = factory(); root.ZJU = root.ZJU || {}; for (var k in m) root.ZJU[k] = m[k]; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var BASE = 118;

  // 注意：这里不 beginPath，所有子路径累积到外层那一次 beginPath 里
  function poly(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function rect(ctx, x, y, w, h) { poly(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]); }

  var ART = {

    /* 东区大食堂：L 形低矮体量 + 玻璃雨棚 + 屋顶设备 */
    food: function (ctx) {
      poly(ctx, [[14, 84], [72, 84], [72, 74], [96, 74], [96, 62], [186, 62], [186, BASE], [14, BASE]]);
      rect(ctx, 106, 52, 18, 10);           // 屋顶设备
      rect(ctx, 138, 54, 22, 8);
      rect(ctx, 22, 96, 66, 12);            // 玻璃雨棚
    },

    /* 月牙楼：弧形壳顶 + 双圆塔 + 大圆洞 */
    dorm: function (ctx) {
      ctx.moveTo(12, 100);
      ctx.bezierCurveTo(12, 42, 92, 24, 130, 32);
      ctx.bezierCurveTo(168, 40, 190, 64, 190, 100);
      ctx.lineTo(190, BASE);
      ctx.lineTo(12, BASE);
      ctx.closePath();
      // 屋脊上的两个小塔（凸起，不是独立的圆）
      poly(ctx, [[86, 36], [98, 36], [98, 46], [86, 46]]);
      poly(ctx, [[108, 38], [120, 38], [120, 47], [108, 47]]);
      // 正面的圆洞：反向绕一圈，在体内挖空
      ctx.moveTo(160, 98);
      ctx.arc(136, 98, 14, 0, Math.PI * 2, true);
      ctx.closePath();
    },

    /* 求是大讲堂：四坡大屋顶 + 屋脊 + 侧边重檐小院 */
    study: function (ctx) {
      rect(ctx, 76, 80, 110, 38);           // 主楼
      poly(ctx, [[70, 80], [192, 80], [172, 48], [90, 48]]);   // 大屋顶
      poly(ctx, [[98, 48], [164, 48], [164, 40], [98, 40]]);   // 屋脊
      rect(ctx, 16, 94, 48, 24);            // 小院主体
      poly(ctx, [[10, 94], [70, 94], [58, 74], [22, 74]]);     // 重檐下
      poly(ctx, [[20, 74], [60, 74], [50, 60], [30, 60]]);     // 重檐上
      poly(ctx, [[10, 94], [4, 88], [12, 90]]);                // 檐角
      poly(ctx, [[70, 94], [76, 88], [68, 90]]);
    },

    /* 亚运比赛馆：碗状主场馆 + 蓝色拱顶热身馆 */
    sport: function (ctx) {
      // 碗体
      ctx.moveTo(10, 96);
      ctx.ellipse(80, 96, 68, 28, 0, Math.PI, 0, false);
      ctx.lineTo(148, BASE);
      ctx.lineTo(12, BASE);
      ctx.closePath();
      // 屋顶环
      ctx.moveTo(6, 96);
      ctx.ellipse(80, 96, 74, 32, 0, 0, Math.PI, true);
      ctx.closePath();
      // 热身馆
      rect(ctx, 154, 100, 38, 18);
      ctx.moveTo(154, 100);
      ctx.quadraticCurveTo(173, 68, 192, 100);
      ctx.closePath();
    },

    /* 艺博馆：层层退台的白屋面 */
    culture: function (ctx) {
      poly(ctx, [[16, 96], [166, 96], [166, BASE], [16, BASE]]);
      poly(ctx, [[28, 84], [156, 84], [156, 96], [28, 96]]);
      poly(ctx, [[46, 72], [144, 72], [144, 84], [46, 84]]);
      poly(ctx, [[68, 62], [128, 62], [128, 72], [68, 72]]);
      rect(ctx, 96, 54, 26, 8);             // 屋顶小体量
    },

    /* 求是大道：透视路面 + 行道树 + 门架 */
    move: function (ctx) {
      poly(ctx, [[88, 44], [112, 44], [182, BASE], [18, BASE]]);
      // 行道树
      var trees = [[64, 72, 9], [40, 90, 11], [18, 112, 14], [136, 72, 9], [160, 90, 11], [182, 112, 14]];
      trees.forEach(function (t) {
        ctx.moveTo(t[0] + t[2], t[1] - t[2] * 0.3);
        ctx.arc(t[0], t[1] - t[2] * 0.3, t[2], 0, Math.PI * 2);
      });
      // 门架
      rect(ctx, 76, 30, 7, 16);
      rect(ctx, 117, 30, 7, 16);
      poly(ctx, [[70, 22], [130, 22], [130, 32], [70, 32]]);
    }
  };

  // 细节线（在剪影内部，用比主色浅一档的线画，不依赖背景色）
  var DETAIL = {
    dorm: function (ctx) {
      for (var i = 1; i <= 3; i++) {
        ctx.moveTo(20, 96 - i * 11);
        ctx.bezierCurveTo(44 + i * 8, 56 - i * 5, 108 + i * 4, 44 - i * 2, 168 - i * 2, 82 - i * 8);
      }
    },
    sport: function (ctx) {
      for (var i = 1; i < 9; i++) {
        var a = Math.PI + i * Math.PI / 9;
        ctx.moveTo(80 + Math.cos(a) * 66, 96 + Math.sin(a) * 27);
        ctx.lineTo(80 + Math.cos(a) * 64, BASE - 2);
      }
      ctx.moveTo(154, 108); ctx.lineTo(192, 108);
    },
    culture: function (ctx) {
      ctx.moveTo(16, 106); ctx.lineTo(166, 106);
      ctx.moveTo(28, 92); ctx.lineTo(156, 92);
    },
    study: function (ctx) {
      ctx.moveTo(70, 80); ctx.lineTo(192, 80);
      ctx.moveTo(10, 94); ctx.lineTo(70, 94);
    },
    food: function (ctx) {
      ctx.moveTo(92, 76); ctx.lineTo(186, 76);
      ctx.moveTo(22, 102); ctx.lineTo(88, 102);
    },
    move: function (ctx) {
      ctx.moveTo(100, 52); ctx.lineTo(100, 66);
      ctx.moveTo(100, 76); ctx.lineTo(100, 92);
      ctx.moveTo(100, 102); ctx.lineTo(100, BASE);
    }
  };

  function draw(ctx, motif, cx, cy, size, opt) {
    var fn = ART[motif] || ART.study;
    var det = DETAIL[motif];
    var o = opt || {};
    var s = size / 200;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-100, -65);

    // 地面基线
    ctx.beginPath();
    ctx.moveTo(4, BASE + 6);
    ctx.lineTo(196, BASE + 6);
    ctx.strokeStyle = o.ground || 'rgba(15,23,42,.12)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 剪影本体
    ctx.beginPath();
    fn(ctx);
    ctx.fillStyle = o.color || '#334155';
    ctx.fill('nonzero');

    // 细节线
    if (det) {
      ctx.beginPath();
      det(ctx);
      ctx.strokeStyle = o.detail || 'rgba(248,250,252,.5)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // 外轮廓
    ctx.beginPath();
    fn(ctx);
    ctx.strokeStyle = o.stroke || 'rgba(15,23,42,.5)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.restore();
  }

  return { drawLandmark: draw, landmarkMotifs: Object.keys(ART) };
});
