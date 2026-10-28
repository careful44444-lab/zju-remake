/* 背景音乐与校歌：全部用 WebAudio 实时合成，不加载任何音频文件 */
(function (root) {
  var ctx = null, master = null, bgmGain = null, songGain = null;
  var bgmTimer = null, songTimer = null, muted = false;

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.22; master.connect(ctx.destination);
    bgmGain = ctx.createGain(); bgmGain.gain.value = 0.5; bgmGain.connect(master);
    songGain = ctx.createGain(); songGain.gain.value = 0.85; songGain.connect(master);
    return ctx;
  }

  // 音乐盒音色：正弦 + 快速衰减 + 轻微泛音
  function pluck(freq, when, dur, gainNode, vol) {
    if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol || 0.5, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(dur, 0.18));
    o.connect(g); g.connect(gainNode);
    o.start(when); o.stop(when + Math.max(dur, 0.2) + 0.05);

    var o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o2.type = 'triangle'; o2.frequency.value = freq * 2;
    g2.gain.setValueAtTime(0, when);
    g2.gain.linearRampToValueAtTime((vol || 0.5) * 0.18, when + 0.008);
    g2.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
    o2.connect(g2); g2.connect(gainNode);
    o2.start(when); o2.stop(when + 0.35);
  }

  var midiToFreq = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  // —— 日常 BGM：慢速分解和弦，四小节一循环 ——
  var CH = [
    [57, 60, 64, 67],   // Am7
    [53, 57, 60, 64],   // F
    [48, 52, 55, 59],   // C
    [55, 59, 62, 65]    // G
  ];
  var step = 0;
  function bgmTick() {
    if (!ctx || muted) return;
    var bar = Math.floor(step / 8) % CH.length, k = step % 8;
    var chord = CH[bar];
    var t = ctx.currentTime + 0.05;
    if (k === 0) pluck(midiToFreq(chord[0] - 12), t, 1.6, bgmGain, 0.30);
    var note = chord[k % chord.length] + (k >= 4 ? 12 : 0);
    pluck(midiToFreq(note), t, 0.9, bgmGain, 0.16);
    if (k === 4) pluck(midiToFreq(chord[2] + 12), t, 0.8, bgmGain, 0.10);
    step++;
  }

  function startBgm() {
    if (!ensure() || bgmTimer) return;
    if (ctx.state === 'suspended') ctx.resume();
    bgmTick();
    bgmTimer = setInterval(bgmTick, 480);
  }
  function stopBgm() { if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } }

  // —— 校歌（音乐盒版）：读 window.ZJU_SONG ——
  function startSong(limit) {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    stopSong();
    var data = root.ZJU_SONG;
    if (!data || !data.notes) return;
    var notes = data.notes.slice(0, limit || 96);   // 默认只放前 96 个音
    var t0 = ctx.currentTime + 0.15;
    notes.forEach(function (n) {
      var when = t0 + n[1] * 0.5;                    // 0.5 = 放慢一半，留出余韵
      pluck(midiToFreq(n[0]), when, n[2] * 0.5, songGain, 0.26);
      pluck(midiToFreq(n[0] - 12), when, n[2] * 0.5, songGain, 0.10);
    });
    var dur = (notes[notes.length - 1][1] + notes[notes.length - 1][2]) * 0.5 + 2;
    songTimer = setTimeout(stopSong, dur * 1000);
  }
  function stopSong() { if (songTimer) { clearTimeout(songTimer); songTimer = null; } }

  function setMuted(v) {
    muted = !!v;
    if (master) master.gain.value = muted ? 0 : 0.22;
  }

  root.ZJUAudio = {
    startBgm: startBgm, stopBgm: stopBgm,
    startSong: startSong, stopSong: stopSong,
    setMuted: setMuted,
    isMuted: function () { return muted; },
    resume: function () { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  };
})(typeof window !== 'undefined' ? window : this);