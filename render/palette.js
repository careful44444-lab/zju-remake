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
      bg: rgb(28, 33, 41), ground: rgb(52, 58, 55), grass: rgb(60, 68, 61),
      road: rgb(38, 43, 48), water: rgb(46, 58, 66), accent: rgb(126, 138, 145),
      glow: rgb(120, 140, 155), fog: 0.42, weather: 'rain'
    },
    2: {
      bg: rgb(38, 45, 55), ground: rgb(64, 72, 66), grass: rgb(74, 84, 73),
      road: rgb(50, 56, 62), water: rgb(56, 72, 82), accent: rgb(146, 158, 162),
      glow: rgb(150, 170, 180), fog: 0.26, weather: 'drizzle'
    },
    3: {
      bg: rgb(52, 68, 84), ground: rgb(82, 98, 78), grass: rgb(96, 114, 84),
      road: rgb(72, 78, 82), water: rgb(86, 132, 158), accent: rgb(176, 196, 196),
      glow: rgb(220, 240, 230), fog: 0.1, weather: 'none'
    },
    4: {
      bg: rgb(72, 104, 134), ground: rgb(98, 122, 84), grass: rgb(118, 142, 90),
      road: rgb(92, 96, 98), water: rgb(104, 164, 190), accent: rgb(226, 202, 140),
      glow: rgb(255, 226, 160), fog: 0.0, weather: 'petal'
    },
    5: {
      bg: rgb(86, 132, 178), ground: rgb(112, 142, 92), grass: rgb(136, 166, 100),
      road: rgb(110, 116, 120), water: rgb(126, 194, 214), accent: rgb(255, 214, 106),
      glow: rgb(255, 244, 184), fog: 0.0, weather: 'sparkle'
    }
  };

  var BUILD = {
    1: { wall: rgb(94, 88, 80), roof: rgb(70, 66, 61), side: rgb(64, 60, 55), win: rgb(52, 50, 46), lit: rgb(120, 110, 92) },
    2: { wall: rgb(124, 118, 106), roof: rgb(96, 92, 84), side: rgb(88, 84, 77), win: rgb(62, 62, 58), lit: rgb(160, 146, 112) },
    3: { wall: rgb(186, 194, 196), roof: rgb(146, 160, 166), side: rgb(128, 140, 146), win: rgb(96, 124, 138), lit: rgb(214, 226, 190) },
    4: { wall: rgb(228, 236, 238), roof: rgb(198, 212, 218), side: rgb(170, 186, 194), win: rgb(118, 168, 196), lit: rgb(255, 216, 140) },
    5: { wall: rgb(246, 250, 252), roof: rgb(226, 238, 244), side: rgb(190, 210, 220), win: rgb(140, 200, 226), lit: rgb(255, 240, 170) }
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
