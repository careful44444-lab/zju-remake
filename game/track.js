/* 紫金港改造计划 · 数据上报（可插拔）
 *
 * 设计原则：
 * 1. 默认不上报（endpoint 为空时只写本地），不会把玩家数据发到任何地方
 * 2. 任何异常都不影响游戏：全部 try/catch，失败就进本地队列，下次补发
 * 3. 传输层可替换（h5 用 fetch / 小程序换成 wx.request）
 *
 * 事件模型（统一信封）：
 *   { v, eid, sid, uid, ts, app, ver, env, ev, rid, seq, props }
 *
 * 事件类型：
 *   run_start   开局
 *   action      一次升/降档或撤销
 *   card        事件卡的选择
 *   run_end     结算（含六维最终档位 + 分数）
 *   run_abandon 中途离开（用于算流失）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    var mod = factory();
    root.ZJU = root.ZJU || {};
    for (var k in mod) root.ZJU[k] = mod[k];
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var CFG = {
    app: 'zju-remake',
    version: '0.1.0',
    env: 'h5',
    endpoint: '',      // 收集服务地址；为空 = 只存本地
    enabled: true,
    debug: false,
    flushMs: 4000,
    maxBatch: 8,
    maxQueue: 300
  };

  var st = {
    uid: null, sid: null, rid: null,
    seq: 0, buf: [], ended: true,
    timer: null, inited: false
  };

  // 玩家画像（年级）。挂在每个事件的信封上，统计按它分组。
  var PROFILE = {};

  function setProfile(p) {
    if (!p) return PROFILE;
    for (var k in p) if (p[k] !== undefined) PROFILE[k] = p[k];
    return PROFILE;
  }

  var K_UID = 'zju.track.uid';
  var K_Q = 'zju.track.q';
  var K_SID = 'zju.track.sid';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

  function uuid() {
    var s = '';
    for (var i = 0; i < 4; i++) s += Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
    return s;
  }

  function log() {
    if (!CFG.debug || typeof console === 'undefined') return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[track]');
    console.log.apply(console, a);
  }

  function now() { return Date.now(); }

  function base(ev, props) {
    return {
      v: 1,
      eid: uuid(),
      sid: st.sid,
      uid: st.uid,
      prof: { year: PROFILE.year || null },
      ts: now(),
      app: CFG.app,
      ver: CFG.version,
      env: CFG.env,
      ev: ev,
      rid: st.rid,
      seq: ++st.seq,
      props: props || {}
    };
  }

  // ---------------- 队列 ----------------
  function persistQueue() {
    try {
      lsSet(K_Q, JSON.stringify(st.buf));
    } catch (e) { }
  }

  function pushQueue(list) {
    st.buf = st.buf.concat(list);
    if (st.buf.length > CFG.maxQueue) st.buf = st.buf.slice(st.buf.length - CFG.maxQueue);
    if (CFG.endpoint) persistQueue();   // 没配地址时只在内存里留一份，不写盘
  }

  var transport = null;   // 自定义传输层（小程序注入 wx.request）

  function defaultTransport(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      keepalive: true,
      mode: 'cors',
      credentials: 'omit'
    });
  }

  function flush(useBeacon) {
    if (!CFG.endpoint || !st.buf.length) return;
    var list = st.buf.splice(0, CFG.maxBatch);
    var body = JSON.stringify({ app: CFG.app, ver: CFG.version, batch: list });

    var ok = function () { log('sent', list.length); };
    var fail = function (e) {
      log('send failed', e && e.message);
      st.buf = list.concat(st.buf);   // 原样放回队首，下次再发
      persistQueue();
    };

    try {
      if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(CFG.endpoint, blob)) { ok(); persistQueue(); return; }
      }
    } catch (e) { }

    try {
      if (transport) {
        transport(CFG.endpoint, body, function (err) { if (err) fail(err); else ok(); });
      } else if (typeof fetch === 'function') {
        defaultTransport(CFG.endpoint, body).then(function (r) {
          if (!r || !r.ok) fail(new Error('http ' + (r && r.status)));
          else ok();
        }).catch(fail);
      } else {
        fail(new Error('no transport'));
      }
    } catch (e) { fail(e); }
    persistQueue();
  }

  function emit(ev, props) {
    if (!CFG.enabled) return null;
    var e = base(ev, props);
    log(ev, props);
    pushQueue([e]);
    if (st.buf.length >= CFG.maxBatch) flush(false);
    return e;
  }

  // ---------------- 生命周期 ----------------
  function configure(opt) {
    opt = opt || {};
    for (var k in opt) if (opt[k] !== undefined) CFG[k] = opt[k];
    if (st.inited) return CFG;
    st.inited = true;

    // 匿名 id（只用于串同一台设备的多次游戏，不含任何个人信息）
    st.uid = lsGet(K_UID);
    if (!st.uid) { st.uid = uuid(); lsSet(K_UID, st.uid); }
    st.sid = uuid();
    lsSet(K_SID, st.sid);

    // 补发上次没发出去的
    if (CFG.endpoint) {
      try {
        var q = JSON.parse(lsGet(K_Q) || '[]');
        if (q && q.length) {
          st.buf = q.concat(st.buf);
          log('restored queue', q.length);
          setTimeout(function () { flush(false); }, 1200);
        }
      } catch (e) { }
    }

    if (CFG.enabled && CFG.endpoint) {
      st.timer = setInterval(function () { flush(false); }, CFG.flushMs);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') { flush(true); }
      });
      window.addEventListener('pagehide', function () {
        if (!st.ended) abandon();
        flush(true);
      });
    }
    return CFG;
  }

  function setTransport(fn) { transport = fn; }

  function startRun(meta) {
    st.rid = uuid();
    st.seq = 0;
    st.ended = false;
    return { rid: st.rid, e: emit('run_start', meta || {}) };
  }

  function action(props) { return emit('action', props || {}); }
  function card(props) { return emit('card', props || {}); }

  function endRun(props, finished) {
    if (st.ended || !st.rid) return null;
    st.ended = true;
    var p = {};
    for (var k in (props || {})) p[k] = props[k];
    p.finished = finished !== false;
    var e = emit('run_end', p);
    flush(false);
    flush(false);
    return e;
  }

  function abandon(reason) {
    if (st.ended || !st.rid) return null;
    return endRun({ leftReason: reason || 'leave' }, false);
  }

  function queueSize() { return st.buf.length; }

  return {
    Track: {
      configure: configure,
      setTransport: setTransport,
      setProfile: setProfile,
      startRun: startRun,
      action: action,
      card: card,
      endRun: endRun,
      abandon: abandon,
      flush: function () { flush(false); },
      queueSize: queueSize,
      config: function () { return CFG; },
      _state: st
    }
  };
});
