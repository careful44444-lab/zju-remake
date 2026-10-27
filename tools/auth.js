/* 后台密码 / 会话
 *
 * - 密码只存 scrypt 哈希（不存明文），文件 data/admin.json
 * - 会话是无状态签名 cookie：payload = 过期时间戳，签名用 secret
 * - 失败次数按 IP 计数，5 次锁 60 秒
 */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var root = path.join(__dirname, '..');
var FILE = path.join(root, 'data', 'admin.json');
var COOKIE = 'zju_admin';
var TTL_MS = 7 * 24 * 3600 * 1000;   // 7 天

var state = null;
var fails = {};   // ip -> { n, until }

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    state = {};
  }
  if (!state.secret) {
    state.secret = crypto.randomBytes(32).toString('hex');
    save();
  }
  return state;
}

function save() {
  try {
    var dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) { }
}

function hasPassword() {
  var s = load();
  return !!(s.salt && s.hash);
}

function setPassword(pw) {
  var s = load();
  pw = String(pw || '');
  if (pw.length < 4) return { ok: false, msg: '密码至少 4 位' };
  s.salt = crypto.randomBytes(16).toString('hex');
  s.hash = crypto.scryptSync(pw, s.salt, 32).toString('hex');
  s.updatedAt = new Date().toISOString();
  save();
  return { ok: true };
}

function clearPassword() {
  var s = load();
  delete s.salt;
  delete s.hash;
  save();
  return { ok: true };
}

function checkPassword(pw) {
  var s = load();
  if (!s.salt || !s.hash) return false;
  var h = crypto.scryptSync(String(pw || ''), s.salt, 32);
  var want = Buffer.from(s.hash, 'hex');
  if (h.length !== want.length) return false;
  try { return crypto.timingSafeEqual(h, want); } catch (e) { return false; }
}

function sign(payload) {
  var s = load();
  return crypto.createHmac('sha256', s.secret).update(payload).digest('hex').slice(0, 40);
}

function issueToken() {
  var exp = String(Date.now() + TTL_MS);
  return exp + '.' + sign(exp);
}

function verifyToken(tok) {
  if (!tok) return false;
  var parts = String(tok).split('.');
  if (parts.length !== 2) return false;
  var exp = parts[0];
  if (sign(exp) !== parts[1]) return false;
  return Number(exp) > Date.now();
}

function parseCookies(req) {
  var out = {};
  String(req.headers.cookie || '').split(';').forEach(function (kv) {
    var i = kv.indexOf('=');
    if (i < 0) return;
    out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
  });
  return out;
}

function isAuthed(req) {
  return verifyToken(parseCookies(req)[COOKIE]);
}

function cookieFor(req) {
  var secure = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  return COOKIE + '=' + encodeURIComponent(issueToken()) +
    '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(TTL_MS / 1000) +
    (secure ? '; Secure' : '');
}

function clearCookie() {
  return COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

// ---- 失败次数限制 ----
function lockedFor(ip) {
  var f = fails[ip];
  if (!f) return 0;
  var left = (f.until || 0) - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

function noteFail(ip) {
  var f = fails[ip] || (fails[ip] = { n: 0, until: 0 });
  f.n += 1;
  if (f.n >= 5) { f.until = Date.now() + 60 * 1000; f.n = 0; }
}

function noteOk(ip) { delete fails[ip]; }

module.exports = {
  hasPassword: hasPassword,
  setPassword: setPassword,
  clearPassword: clearPassword,
  checkPassword: checkPassword,
  isAuthed: isAuthed,
  issueToken: issueToken,
  verifyToken: verifyToken,
  cookieFor: cookieFor,
  clearCookie: clearCookie,
  lockedFor: lockedFor,
  noteFail: noteFail,
  noteOk: noteOk,
  COOKIE: COOKIE
};
