/* 档位信物（tier relic）——每个维度 5 档，各有一个「代表这个档位的东西」
 * 画在 100×100 的坐标系里，原点在中心；实际尺寸由 size 缩放。
 *
 * 用法：
 *   ZJU.drawRelic(ctx, 'steam', 3, cx, cy, 46, { gold: false })
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { var m = factory(); root.ZJU = root.ZJU || {}; for (var k in m) root.ZJU[k] = m[k]; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var LINE = 'rgba(15,23,42,.22)';

  var PAL = {
    steam:  { main: '#f59e0b', soft: '#fde68a', dark: '#b45309' },
    window: { main: '#ec4899', soft: '#fbcfe8', dark: '#9d174d' },
    book:   { main: '#3b82f6', soft: '#bfdbfe', dark: '#1d4ed8' },
    track:  { main: '#10b981', soft: '#a7f3d0', dark: '#047857' },
    stage:  { main: '#a855f7', soft: '#e9d5ff', dark: '#7e22ce' },
    bus:    { main: '#64748b', soft: '#cbd5e1', dark: '#334155' }
  };

  function rr(ctx, x, y, w, h, r) {
    var k = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + k, y);
    ctx.lineTo(x + w - k, y); ctx.quadraticCurveTo(x + w, y, x + w, y + k);
    ctx.lineTo(x + w, y + h - k); ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
    ctx.lineTo(x + k, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - k);
    ctx.lineTo(x, y + k); ctx.quadraticCurveTo(x, y, x + k, y);
    ctx.closePath();
  }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); }
  function fill(ctx, color, lw) {
    ctx.fillStyle = color; ctx.fill();
    if (lw !== false) { ctx.strokeStyle = LINE; ctx.lineWidth = lw || 3; ctx.stroke(); }
  }
  function stroke(ctx, color, lw) {
    ctx.strokeStyle = color; ctx.lineWidth = lw || 3;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  }

  // ---------------- 食：馒头 → 面食 → 盒饭 → 锅包肉 → 八宝鸭 ----------------
  var steam = [
    function (ctx, c) {                     // T1 馒头
      ctx.beginPath();
      ctx.moveTo(-27, 12);
      ctx.bezierCurveTo(-32, -16, -15, -28, 0, -28);
      ctx.bezierCurveTo(15, -28, 32, -16, 27, 12);
      ctx.quadraticCurveTo(0, 22, -27, 12);
      ctx.closePath(); fill(ctx, '#ffffff');
      ctx.beginPath(); ctx.moveTo(-13, -22); ctx.quadraticCurveTo(-8, -10, -11, 6); stroke(ctx, c.soft, 2.5);
      ctx.beginPath(); ctx.moveTo(0, -26); ctx.quadraticCurveTo(2, -12, 0, 8); stroke(ctx, c.soft, 2.5);
      ctx.beginPath(); ctx.moveTo(13, -22); ctx.quadraticCurveTo(8, -10, 11, 6); stroke(ctx, c.soft, 2.5);
    },
    function (ctx, c) {                     // T2 面食（碗面）
      ctx.beginPath(); ctx.moveTo(-30, 2); ctx.lineTo(30, 2);
      ctx.bezierCurveTo(28, 26, -28, 26, -30, 2); ctx.closePath(); fill(ctx, c.soft);
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 12 - 2, -22);
        ctx.bezierCurveTo(i * 12 + 6, -12, i * 12 - 6, -4, i * 12, 2);
        stroke(ctx, '#ffffff', 4.5);
      }
      ctx.beginPath(); ctx.moveTo(-6, -34); ctx.lineTo(24, -14); stroke(ctx, c.dark, 4);
      ctx.beginPath(); ctx.moveTo(4, -36); ctx.lineTo(28, -18); stroke(ctx, c.dark, 3);
    },
    function (ctx, c) {                     // T3 盒饭
      rr(ctx, -28, -22, 56, 44, 6); fill(ctx, '#ffffff');
      ctx.beginPath(); ctx.moveTo(-28, -4); ctx.lineTo(28, -4); stroke(ctx, c.main, 3.5);
      ctx.beginPath(); ctx.moveTo(4, -22); ctx.lineTo(4, -4); stroke(ctx, c.main, 3.5);
      ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(-4, 22); stroke(ctx, c.main, 3.5);
      rr(ctx, -22, -18, 24, 12, 3); fill(ctx, c.soft, 2);
      rr(ctx, 0, -18, 22, 12, 3); fill(ctx, '#fef3c7', 2);
      rr(ctx, 2, 0, 20, 16, 3); fill(ctx, c.soft, 2);
      rr(ctx, -26, -28, 52, 7, 3); fill(ctx, c.main, 2);
    },
    function (ctx, c) {                     // T4 锅包肉
      ctx.beginPath(); ctx.ellipse(0, 8, 34, 16, 0, 0, 6.283); fill(ctx, '#ffffff');
      var pts = [[-18, -6], [-4, -12], [10, -6], [22, -12]];
      for (var i = 0; i < pts.length; i++) {
        ctx.save(); ctx.translate(pts[i][0], pts[i][1]); ctx.rotate(-0.32 + i * 0.12);
        rr(ctx, -11, -7, 22, 14, 5); fill(ctx, i % 2 ? c.soft : c.main, 2);
        ctx.restore();
      }
      ctx.beginPath(); ctx.ellipse(0, 8, 34, 16, 0, 0, 6.283); stroke(ctx, LINE, 2.5);
    },
    function (ctx, c) {                     // T5 八宝鸭
      ctx.beginPath(); ctx.ellipse(0, 22, 36, 11, 0, 0, 6.283); fill(ctx, '#ffffff', 3);  // 盘子
      ctx.beginPath();
      ctx.moveTo(-26, 14);
      ctx.bezierCurveTo(-30, -6, -12, -16, 6, -14);
      ctx.bezierCurveTo(22, -12, 30, 0, 24, 12);
      ctx.bezierCurveTo(14, 22, -18, 24, -26, 14);
      ctx.closePath(); fill(ctx, '#b45309', 3);                    // 鸭身
      ctx.beginPath();
      ctx.moveTo(4, -14);
      ctx.bezierCurveTo(12, -24, 24, -30, 30, -26);
      ctx.bezierCurveTo(34, -22, 30, -16, 26, -12);
      ctx.closePath(); fill(ctx, '#b45309', 2.5);                  // 颈
      circle(ctx, 28, -26, 7); fill(ctx, '#b45309', 2.5);          // 头
      ctx.beginPath(); ctx.moveTo(34, -27); ctx.lineTo(43, -24); ctx.lineTo(34, -21);
      ctx.closePath(); fill(ctx, '#f59e0b', 1.8);                  // 嘴
      circle(ctx, 30, -28, 1.8); fill(ctx, '#0f172a', false);      // 眼
      ctx.beginPath();
      ctx.moveTo(-14, -2); ctx.bezierCurveTo(0, -10, 12, -4, 16, 6);
      stroke(ctx, 'rgba(255,255,255,.55)', 3);                     // 翅膀
      ctx.beginPath(); ctx.moveTo(-16, 8); ctx.quadraticCurveTo(0, 2, 16, 8);
      stroke(ctx, 'rgba(255,255,255,.35)', 2.5);
    }
  ];

  // ---------------- 行：步行 → 自行车 → 电瓶车 → 校园巴士 → 高铁 ----------------
  var bus = [
    function (ctx, c) {                     // T1 步行（脚印）
      [[-10, -12], [12, 6]].forEach(function (o) {
        ctx.save(); ctx.translate(o[0], o[1]);
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 20, 0.25, 0, 6.283); fill(ctx, c.main, 3);
        ctx.restore();
      });
      ctx.beginPath(); ctx.ellipse(-10, 14, 7, 4, 0, 0, 6.283); fill(ctx, c.dark, 2);
      ctx.beginPath(); ctx.ellipse(12, 30, 7, 4, 0, 0, 6.283); fill(ctx, c.dark, 2);
    },
    function (ctx, c) {                     // T2 自行车
      ctx.beginPath(); ctx.arc(-20, 16, 14, 0, 6.283); stroke(ctx, c.dark, 3.5);
      ctx.beginPath(); ctx.arc(20, 16, 14, 0, 6.283); stroke(ctx, c.dark, 3.5);
      ctx.beginPath();
      ctx.moveTo(-20, 16); ctx.lineTo(-2, -6); ctx.lineTo(14, -6);
      ctx.lineTo(20, 16); ctx.moveTo(-2, -6); ctx.lineTo(6, 16); ctx.lineTo(-20, 16);
      stroke(ctx, c.main, 3.5);
      ctx.beginPath(); ctx.moveTo(10, -14); ctx.lineTo(18, -14); stroke(ctx, c.main, 4);
      ctx.beginPath(); ctx.moveTo(-8, -12); ctx.lineTo(2, -12); stroke(ctx, c.dark, 4);
    },
    function (ctx, c) {                     // T3 电瓶车
      ctx.beginPath(); ctx.arc(-20, 18, 11, 0, 6.283); fill(ctx, c.dark, 2.5);
      ctx.beginPath(); ctx.arc(20, 18, 11, 0, 6.283); fill(ctx, c.dark, 2.5);
      ctx.beginPath();
      ctx.moveTo(-22, 6); ctx.lineTo(-6, -2); ctx.lineTo(12, -2); ctx.lineTo(24, 6);
      stroke(ctx, c.main, 6);
      rr(ctx, -14, -14, 24, 12, 4); fill(ctx, c.soft, 2.5);   // 电池盒
      ctx.beginPath(); ctx.moveTo(14, -2); ctx.lineTo(18, -22); stroke(ctx, c.dark, 3.5);  // 车把
      ctx.beginPath(); ctx.moveTo(10, -22); ctx.lineTo(26, -22); stroke(ctx, c.dark, 3.5);
      rr(ctx, -30, -4, 12, 6, 3); fill(ctx, c.main, 2);       // 后座
    },
    function (ctx, c) {                     // T4 校园巴士
      rr(ctx, -34, -18, 68, 34, 8); fill(ctx, c.main, 3);
      rr(ctx, -28, -12, 18, 12, 3); fill(ctx, '#ffffff', 2);
      rr(ctx, -6, -12, 18, 12, 3); fill(ctx, '#ffffff', 2);
      rr(ctx, 16, -12, 12, 12, 3); fill(ctx, '#ffffff', 2);
      ctx.beginPath(); ctx.arc(-20, 20, 7, 0, 6.283); fill(ctx, c.dark, 2.5);
      ctx.beginPath(); ctx.arc(20, 20, 7, 0, 6.283); fill(ctx, c.dark, 2.5);
      rr(ctx, -34, 4, 68, 6, 2); fill(ctx, c.dark, false);
    },
    function (ctx, c) {                     // T5 高铁
      ctx.beginPath();
      ctx.moveTo(-40, 2);
      ctx.bezierCurveTo(-30, -20, 6, -26, 26, -18);
      ctx.lineTo(40, -6); ctx.lineTo(38, 12); ctx.lineTo(-40, 12);
      ctx.closePath(); fill(ctx, '#ffffff', 3);
      rr(ctx, 4, -14, 30, 12, 4); fill(ctx, c.main, 2);
      rr(ctx, -26, -10, 24, 10, 4); fill(ctx, c.soft, 2);
      ctx.beginPath(); ctx.moveTo(-40, 12); ctx.lineTo(38, 12); stroke(ctx, c.dark, 3);
      ctx.beginPath(); ctx.arc(-18, 14, 5, 0, 6.283); fill(ctx, c.dark, 2);
      ctx.beginPath(); ctx.arc(18, 14, 5, 0, 6.283); fill(ctx, c.dark, 2);
      ctx.beginPath(); ctx.moveTo(40, -6); ctx.lineTo(48, -10); stroke(ctx, c.main, 3);
    }
  ];

  // ---------------- 学：短铅笔 → 水笔 → 尺子 → 书本 → 竺可桢 ----------------
  var book = [
    function (ctx, c) {                     // T1 很短的铅笔 + 快没的橡皮
      ctx.save(); ctx.translate(-8, 2); ctx.rotate(-0.3);
      rr(ctx, -10, -26, 20, 40, 4); fill(ctx, c.main, 3);
      ctx.beginPath(); ctx.moveTo(-10, 14); ctx.lineTo(0, 28); ctx.lineTo(10, 14); ctx.closePath();
      fill(ctx, '#ffffff', 3);
      ctx.beginPath(); ctx.moveTo(0, 28); ctx.lineTo(0, 21); stroke(ctx, '#0f172a', 3);
      rr(ctx, -10, -30, 20, 7, 3); fill(ctx, '#f9a8d4', 2);
      ctx.restore();
      ctx.save(); ctx.translate(18, 16); ctx.rotate(0.2);
      rr(ctx, -9, -8, 18, 15, 3); fill(ctx, '#fbcfe8', 3);
      ctx.beginPath(); ctx.moveTo(-9, 2); ctx.lineTo(9, 2); stroke(ctx, 'rgba(15,23,42,.25)', 2);
      ctx.restore();
    },
    function (ctx, c) {                     // T2 水笔
      ctx.save(); ctx.rotate(-0.46);
      rr(ctx, -7, -14, 14, 42, 4); fill(ctx, c.main, 3);            // 笔身
      ctx.beginPath(); ctx.moveTo(-7, 28); ctx.lineTo(0, 38); ctx.lineTo(7, 28); ctx.closePath();
      fill(ctx, c.dark, 2);                                          // 笔尖
      rr(ctx, -8, -26, 16, 14, 4); fill(ctx, c.dark, 2.5);          // 笔帽
      rr(ctx, 7, -24, 4, 16, 2); fill(ctx, '#ffffff', 1.5);         // 笔夹
      ctx.beginPath(); ctx.moveTo(-7, 6); ctx.lineTo(7, 6); stroke(ctx, 'rgba(255,255,255,.75)', 3);
      ctx.restore();
    },
    function (ctx, c) {                     // T3 一套尺子
      ctx.save(); ctx.translate(-4, -6); ctx.rotate(-0.1);
      ctx.beginPath(); ctx.moveTo(-26, 14); ctx.lineTo(22, 14); ctx.lineTo(-26, -20); ctx.closePath();
      fill(ctx, '#bfdbfe', 3);                                     // 三角板
      ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(-20, 6); ctx.lineTo(-20, -8); ctx.closePath();
      fill(ctx, '#ffffff', 2);
      ctx.restore();
      ctx.save(); ctx.translate(2, 22); ctx.rotate(0.06);
      rr(ctx, -30, -7, 60, 14, 3); fill(ctx, c.main, 3);           // 直尺
      for (var j = -3; j <= 3; j++) {
        ctx.beginPath(); ctx.moveTo(j * 8, -7); ctx.lineTo(j * 8, j % 2 ? -2 : 0);
        stroke(ctx, '#ffffff', 1.8);
      }
      ctx.restore();
    },
    function (ctx, c) {                     // T4 书本
      var ys = [16, 2, -12];
      for (var i = 0; i < 3; i++) {
        var cols = [c.main, c.soft, '#ffffff'];
        rr(ctx, -28 + i * 2, ys[i], 56 - i * 4, 13, 3); fill(ctx, cols[i], 3);
        ctx.beginPath(); ctx.moveTo(-20 + i * 2, ys[i] + 3); ctx.lineTo(-20 + i * 2, ys[i] + 10);
        stroke(ctx, 'rgba(15,23,42,.18)', 2);
      }
      ctx.beginPath(); ctx.moveTo(-28, 29); ctx.lineTo(28, 29); stroke(ctx, LINE, 2.5);
    },
    function (ctx, c) {                     // T5 竺可桢雕像
      rr(ctx, -24, 14, 48, 14, 4); fill(ctx, '#ffffff', 3);
      ctx.beginPath(); ctx.moveTo(-18, 8); ctx.lineTo(18, 8); ctx.lineTo(22, 16); ctx.lineTo(-22, 16);
      ctx.closePath(); fill(ctx, c.soft, 2.5);
      ctx.beginPath();
      ctx.moveTo(-9, 8);
      ctx.bezierCurveTo(-13, -8, -9, -24, 0, -24);
      ctx.bezierCurveTo(9, -24, 13, -8, 9, 8);
      ctx.closePath(); fill(ctx, c.main, 3);
      circle(ctx, 0, -30, 7); fill(ctx, c.main, 3);
      ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = c.dark;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('竺', 0, 21);
    }
  ];

  // ---------------- 体：乒乓球 → 篮球 → 足球 → 哑铃 → 奥运五环 ----------------
  var track = [
    function (ctx, c) {                     // T1 乒乓球（拍 + 球）
      ctx.save(); ctx.rotate(-0.4);
      ctx.beginPath(); ctx.ellipse(-6, -8, 18, 22, 0, 0, 6.283); fill(ctx, '#ef4444', 3);
      rr(ctx, -9, 12, 9, 22, 3); fill(ctx, '#f3d9b1', 3);          // 木柄
      ctx.restore();
      circle(ctx, 22, 16, 11); fill(ctx, '#ffffff', 3);
      ctx.beginPath(); ctx.arc(18, 12, 4.5, 3.6, 5.4); stroke(ctx, 'rgba(15,23,42,.18)', 2);
    },
    function (ctx, c) {                     // T2 篮球
      circle(ctx, 0, 0, 28); fill(ctx, c.main, 3);
      ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(28, 0); stroke(ctx, LINE, 3);
      ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(0, 28); stroke(ctx, LINE, 3);
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 28, 0, 0, 6.283); stroke(ctx, LINE, 3);
    },
    function (ctx, c) {                     // T3 足球
      circle(ctx, 0, 0, 28); fill(ctx, '#ffffff', 3);
      var penta = function (cx, cy, r) {
        ctx.beginPath();
        for (var i = 0; i < 5; i++) {
          var a = -1.571 + i * 1.2566;
          ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ctx.closePath(); fill(ctx, '#1f2937', 2);
      };
      penta(0, 0, 11); penta(0, -22, 7); penta(-21, 12, 7); penta(21, 12, 7);
      ctx.beginPath(); ctx.arc(0, 0, 28, 0, 6.283); stroke(ctx, LINE, 3);
    },
    function (ctx, c) {                     // T4 哑铃
      rr(ctx, -30, -6, 60, 12, 5); fill(ctx, c.soft, 3);
      rr(ctx, -34, -20, 12, 40, 4); fill(ctx, c.main, 3);
      rr(ctx, 22, -20, 12, 40, 4); fill(ctx, c.main, 3);
      rr(ctx, -42, -14, 8, 28, 3); fill(ctx, c.dark, 2.5);
      rr(ctx, 34, -14, 8, 28, 3); fill(ctx, c.dark, 2.5);
    },
    function (ctx, c) {                     // T5 奥运五环
      var cols = ['#3b82f6', '#0f172a', '#dc2626', '#f59e0b', '#10b981'];
      var pos = [[-20, -8], [0, -8], [20, -8], [-10, 10], [10, 10]];
      for (var i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.arc(pos[i][0], pos[i][1], 12, 0, 6.283);
        stroke(ctx, cols[i], 4.5);
      }
    }
  ];

  // ---------------- 文：禁止标记 → 社团招新 → 运动会 → 讲座 → 演唱会 ----------------
  var stage = [
    function (ctx, c) {                     // T1 禁止标记
      circle(ctx, 0, 0, 28); fill(ctx, '#ffffff', 3.5);
      circle(ctx, 0, 0, 21); fill(ctx, c.main, false);
      ctx.beginPath(); ctx.arc(0, 0, 21, 0, 6.283); stroke(ctx, c.main, 3);
      ctx.beginPath(); ctx.moveTo(-15, -15); ctx.lineTo(15, 15); stroke(ctx, '#ffffff', 7);
    },
    function (ctx, c) {                     // T2 社团招新（桌子 + 横幅）
      rr(ctx, -26, -34, 52, 12, 3); fill(ctx, c.main, 2.5);      // 横幅
      ctx.beginPath(); ctx.moveTo(-26, -34); ctx.lineTo(-30, -22); stroke(ctx, LINE, 2);
      ctx.beginPath(); ctx.moveTo(26, -34); ctx.lineTo(30, -22); stroke(ctx, LINE, 2);
      rr(ctx, -32, 6, 64, 10, 3); fill(ctx, c.soft, 3);          // 桌面
      rr(ctx, -28, 16, 7, 16, 2); fill(ctx, c.dark, 2);
      rr(ctx, 21, 16, 7, 16, 2); fill(ctx, c.dark, 2);
      rr(ctx, -14, -6, 16, 12, 3); fill(ctx, '#ffffff', 2.5);    // 传单
      rr(ctx, 6, -2, 12, 8, 2); fill(ctx, '#ffffff', 2);
    },
    function (ctx, c) {                     // T3 运动会（奖牌）
      ctx.beginPath(); ctx.moveTo(-16, -32); ctx.lineTo(-2, -6); stroke(ctx, c.main, 6);
      ctx.beginPath(); ctx.moveTo(16, -32); ctx.lineTo(2, -6); stroke(ctx, c.soft, 6);
      circle(ctx, 0, 12, 20); fill(ctx, '#ffffff', 3);
      circle(ctx, 0, 12, 13); fill(ctx, c.main, 2);
      ctx.beginPath();
      for (var i = 0; i < 5; i++) {
        var a = -1.571 + i * 1.2566;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 7, 12 + Math.sin(a) * 7);
      }
      ctx.closePath(); fill(ctx, '#ffffff', false);
    },
    function (ctx, c) {                     // T4 讲座（幕布 + 讲台）
      rr(ctx, -32, -30, 64, 34, 4); fill(ctx, '#ffffff', 3);
      ctx.beginPath(); ctx.moveTo(-32, -30); ctx.lineTo(32, -30); stroke(ctx, c.main, 4);
      ctx.beginPath(); ctx.moveTo(-22, -14); ctx.lineTo(2, -14); stroke(ctx, c.soft, 4);
      ctx.beginPath(); ctx.moveTo(-22, -5); ctx.lineTo(12, -5); stroke(ctx, c.soft, 4);
      rr(ctx, -16, 8, 32, 16, 4); fill(ctx, c.main, 2.5);        // 讲台
      ctx.beginPath(); ctx.arc(0, 2, 6, 0, 6.283); fill(ctx, c.dark, 2);  // 人
    },
    function (ctx, c) {                     // T5 演唱会（舞台 + 光）
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 22, -30);
        ctx.lineTo(i * 34 - 8, 8); ctx.lineTo(i * 34 + 8, 8);
        ctx.closePath();
        ctx.fillStyle = 'rgba(168,85,247,.16)'; ctx.fill();
      }
      rr(ctx, -34, 8, 68, 12, 4); fill(ctx, c.main, 3);
      ctx.beginPath(); ctx.moveTo(-14, 8); ctx.lineTo(-14, -12); stroke(ctx, c.dark, 4);
      circle(ctx, -14, -16, 7); fill(ctx, c.dark, 2.5);
      circle(ctx, 16, 0, 6); fill(ctx, c.soft, 2);
    }
  ];

  // ---------------- 住：马桶 → 阳台 → 上下铺 → 上床下桌 → 单人床 ----------------
  var window_ = [
    function (ctx, c) {                     // T1 马桶
      rr(ctx, -16, -30, 32, 18, 4); fill(ctx, '#ffffff', 3);      // 水箱
      ctx.beginPath();
      ctx.moveTo(-20, -8); ctx.lineTo(20, -8);
      ctx.bezierCurveTo(22, 14, 14, 20, 14, 20);
      ctx.lineTo(-14, 20);
      ctx.bezierCurveTo(-14, 20, -22, 14, -20, -8);
      ctx.closePath(); fill(ctx, '#ffffff', 3);
      ctx.beginPath(); ctx.ellipse(0, -8, 17, 7, 0, 0, 6.283); fill(ctx, c.soft, 2.5);
      ctx.beginPath(); ctx.moveTo(-14, 6); ctx.lineTo(14, 6); stroke(ctx, LINE, 2);
    },
    function (ctx, c) {                     // T2 阳台
      rr(ctx, -32, 16, 64, 8, 3); fill(ctx, c.soft, 3);            // 地板
      rr(ctx, -30, -14, 60, 5, 2.5); fill(ctx, c.main, 2.5);        // 上扶手
      rr(ctx, -30, 6, 60, 4, 2); fill(ctx, c.main, 2.5);            // 下横杆
      for (var i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * 14, -14); ctx.lineTo(i * 14, 8);
        stroke(ctx, c.main, 3);
      }
      ctx.beginPath(); ctx.moveTo(-34, -14); ctx.lineTo(-34, -34); stroke(ctx, c.dark, 3);
      ctx.beginPath(); ctx.moveTo(-34, -34); ctx.lineTo(30, -34); stroke(ctx, c.dark, 3);
      ctx.beginPath(); ctx.moveTo(-20, -34); ctx.lineTo(-20, -28); stroke(ctx, c.dark, 2);
      rr(ctx, -27, -29, 14, 15, 2); fill(ctx, '#ffffff', 2);        // 白衬衫
      ctx.beginPath(); ctx.moveTo(6, -34); ctx.lineTo(6, -28); stroke(ctx, c.dark, 2);
      rr(ctx, 0, -29, 13, 13, 2); fill(ctx, '#f9a8d4', 2);          // 粉衣服
    },
    function (ctx, c) {                     // T3 上下铺
      rr(ctx, -28, -30, 56, 12, 3); fill(ctx, c.main, 3);         // 上床
      rr(ctx, -28, 2, 56, 12, 3); fill(ctx, c.soft, 3);           // 下床
      [-26, -2, 22].forEach(function (x) {
        ctx.beginPath(); ctx.moveTo(x, -30); ctx.lineTo(x, 22); stroke(ctx, c.dark, 3);
      });
      for (var i = 0; i < 3; i++) {                               // 梯子
        ctx.beginPath(); ctx.moveTo(26, -18 + i * 9); ctx.lineTo(34, -18 + i * 9);
        stroke(ctx, c.dark, 2.5);
      }
      ctx.beginPath(); ctx.moveTo(26, -30); ctx.lineTo(26, 14); stroke(ctx, c.dark, 2.5);
      ctx.beginPath(); ctx.moveTo(34, -30); ctx.lineTo(34, 14); stroke(ctx, c.dark, 2.5);
    },
    function (ctx, c) {                     // T4 上床下桌
      rr(ctx, -30, -30, 60, 13, 3); fill(ctx, c.main, 3);         // 上床
      [-28, 2, 24].forEach(function (x) {
        ctx.beginPath(); ctx.moveTo(x, -30); ctx.lineTo(x, 22); stroke(ctx, c.dark, 3.5);
      });
      rr(ctx, -26, 6, 34, 7, 2); fill(ctx, c.soft, 2.5);          // 桌面
      ctx.beginPath(); ctx.moveTo(20, 2); ctx.lineTo(20, 22); stroke(ctx, LINE, 2.5);
      rr(ctx, 12, -6, 12, 10, 2); fill(ctx, '#ffffff', 2);        // 显示器
    },
    function (ctx, c) {                     // T5 单人床
      rr(ctx, -32, 0, 64, 12, 4); fill(ctx, c.main, 3);           // 床架
      rr(ctx, -32, 12, 8, 12, 3); fill(ctx, c.dark, 2);           // 床腿
      rr(ctx, 24, 12, 8, 12, 3); fill(ctx, c.dark, 2);
      rr(ctx, -36, -14, 14, 16, 4); fill(ctx, c.soft, 2.5);       // 床垫
      ctx.beginPath();
      ctx.moveTo(-24, -12); ctx.lineTo(30, -12);
      ctx.bezierCurveTo(34, -12, 34, 2, 30, 2);
      ctx.lineTo(-24, 2); ctx.closePath(); fill(ctx, '#ffffff', 2.5);  // 被子
      circle(ctx, 20, -16, 7); fill(ctx, '#fef3c7', 2.5);         // 台灯
      ctx.beginPath(); ctx.moveTo(20, -9); ctx.lineTo(20, 0); stroke(ctx, c.dark, 2.5);
    }
  ];

  var SETS = { steam: steam, bus: bus, book: book, track: track, stage: stage, window: window_ };

  /* 在 (cx, cy) 画一个 size 大小的信物 */
  function draw(ctx, motif, tier, cx, cy, size, opt) {
    var set = SETS[motif] || SETS.steam;
    var fn = set[Math.max(0, Math.min(4, (tier || 1) - 1))];
    if (!fn) return;
    var c = PAL[motif] || PAL.steam;
    var o = opt || {};

    ctx.save();
    ctx.translate(cx, cy);
    var s = size / 100;
    ctx.scale(s, s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    fn(ctx, c);
    ctx.restore();
  }

  return { drawRelic: draw, relicPalette: PAL };
});
