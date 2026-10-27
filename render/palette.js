/* 紫金港改造计划 · 色谱
 * 5 档色板 + 建筑材质 + 混合工具。 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.ZJU = root.ZJU || {};
    for (var k in mod) root.ZJU[k] = mod[k];
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function rgb(r, g, b) { return [r, g, b]; }

  var TIER_PAL = {
    1: {
      bg: rgb(246, 248, 250), ground: rgb(238, 242, 246), grass: rgb(218, 236, 222),
      road: rgb(222, 228, 235), water: rgb(180, 220, 245), accent: rgb(160, 175, 190),
      glow: rgb(255, 255, 255), fog: 0.08, weather: 'drizzle'
    },
    2: {
      bg: rgb(248, 250, 252), ground: rgb(241, 245, 249), grass: rgb(210, 238, 218),
      road: rgb(226, 232, 240), water: rgb(165, 215, 245), accent: rgb(180, 195, 210),
      glow: rgb(255, 255, 255), fog: 0.03, weather: 'none'
    },
    3: {
      bg: rgb(250, 252, 255), ground: rgb(244, 248, 252), grass: rgb(198, 240, 212),
      road: rgb(228, 235, 242), water: rgb(140, 205, 245), accent: rgb(217, 119, 6),
      glow: rgb(255, 255, 255), fog: 0.0, weather: 'none'
    },
    4: {
      bg: rgb(255, 255, 255), ground: rgb(248, 250, 252), grass: rgb(185, 242, 205),
      road: rgb(232, 238, 245), water: rgb(110, 195, 245), accent: rgb(234, 88, 12),
      glow: rgb(255, 255, 255), fog: 0.0, weather: 'petal'
    },
    5: {
      bg: rgb(255, 255, 255), ground: rgb(250, 252, 255), grass: rgb(172, 245, 198),
      road: rgb(236, 242, 248), water: rgb(90, 188, 245), accent: rgb(217, 119, 6),
      glow: rgb(255, 255, 255), fog: 0.0, weather: 'sparkle'
    }
  };

  var BUILD = {
    1: { wall: rgb(210, 216, 222), roof: rgb(170, 178, 186), side: rgb(155, 164, 172), win: rgb(140, 160, 175), lit: rgb(255, 215, 130) },
    2: { wall: rgb(225, 230, 235), roof: rgb(185, 192, 200), side: rgb(170, 178, 186), win: rgb(150, 180, 200), lit: rgb(255, 225, 145) },
    3: { wall: rgb(240, 244, 248), roof: rgb(195, 208, 218), side: rgb(180, 192, 202), win: rgb(140, 195, 225), lit: rgb(255, 235, 160) },
    4: { wall: rgb(250, 252, 255), roof: rgb(210, 225, 238), side: rgb(195, 210, 222), win: rgb(125, 205, 240), lit: rgb(255, 240, 175) },
    5: { wall: rgb(255, 255, 255), roof: rgb(225, 238, 248), side: rgb(210, 225, 235), win: rgb(110, 215, 250), lit: rgb(255, 248, 190) }
  };

  // 专精色调
  var CAP_TINT = {
    quality: rgb(255, 214, 120), value: rgb(255, 176, 92),
    luxury: rgb(198, 214, 255), social: rgb(255, 196, 150),
    fast: rgb(150, 224, 255), romance: rgb(255, 190, 210),
    grind: rgb(255, 236, 150), chill: rgb(160, 230, 200),
    elite: rgb(255, 160, 120), joy: rgb(170, 240, 170),
    fireworks: rgb(255, 150, 190), academic: rgb(170, 190, 255)
  };

  function mix(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }
  function css(c, alpha) {
    if (alpha === undefined) return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
  }
  function shade(c, k) {
    return [Math.max(0, Math.min(255, Math.round(c[0] * k))),
            Math.max(0, Math.min(255, Math.round(c[1] * k))),
            Math.max(0, Math.min(255, Math.round(c[2] * k)))];
  }

  // 连续档位（1..5）插值出整套色板
  function palAt(m) {
    m = Math.max(1, Math.min(5, m));
    var lo = Math.floor(m), hi = Math.min(5, lo + 1), t = m - lo;
    if (lo === hi) t = 0;
    var a = TIER_PAL[lo], b = TIER_PAL[hi];
    var out = {};
    ['bg', 'ground', 'grass', 'road', 'water', 'accent', 'glow'].forEach(function (k) {
      out[k] = mix(a[k], b[k], t);
    });
    out.fog = a.fog + (b.fog - a.fog) * t;
    out.weather = t < 0.5 ? a.weather : b.weather;
    return out;
  }

  function buildAt(m) {
    m = Math.max(1, Math.min(5, m));
    var lo = Math.floor(m), hi = Math.min(5, lo + 1), t = m - lo;
    if (lo === hi) t = 0;
    var a = BUILD[lo], b = BUILD[hi], out = {};
    ['wall', 'roof', 'side', 'win', 'lit'].forEach(function (k) { out[k] = mix(a[k], b[k], t); });
    return out;
  }

  return { TIER_PAL: TIER_PAL, BUILD: BUILD, CAP_TINT: CAP_TINT, mix: mix, css: css, shade: shade, palAt: palAt, buildAt: buildAt };
});
