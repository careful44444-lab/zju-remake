/* 打包成单文件 HTML（CSS/JS 全部内联），可选把上报地址写死在里面。
 *
 * 用法：
 *   node tools/build-single.js
 *   node tools/build-single.js --collect=https://xxx.trycloudflare.com/collect
 *   node tools/build-single.js --collect=... --out=发给朋友的版本.html
 *
 * 产出：
 *   dist/<out>                    发给别人的单文件（双击即玩）
 *   dist/site/index.html          给静态托管用（只在没写上报地址时生成）
 */
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var h5 = path.join(root, 'h5');

function arg(name) {
  var list = process.argv.slice(2);
  for (var i = 0; i < list.length; i++) {
    if (list[i].indexOf('--' + name + '=') === 0) return list[i].slice(name.length + 3);
  }
  return null;
}

var collectUrl = arg('collect');
var outName = arg('out') || '紫金港改造计划.html';

var html = fs.readFileSync(path.join(h5, 'index.html'), 'utf8');

// 1) 内联 CSS
html = html.replace(/<link[^>]*href="style\.css"[^>]*>/i, function () {
  var css = fs.readFileSync(path.join(h5, 'style.css'), 'utf8');
  return '<style>\n' + css + '\n</style>';
});

// 2) 内联 JS；顺手把上报地址精准写进 config.js（只改那一个文件，避免误伤 track.js 的默认值）
html = html.replace(/<script src="([^"]+)"><\/script>/g, function (m, src) {
  var f = path.resolve(h5, src);
  var js = fs.readFileSync(f, 'utf8');
  if (collectUrl && /[\\/]config\.js$/.test(f)) {
    var before = js;
    js = js.replace(/endpoint:\s*''/, "endpoint: '" + collectUrl.replace(/'/g, "\\'") + "'");
    if (js === before) throw new Error('config.js 里没找到 endpoint 字段');
  }
  return '<script>\n/* ' + path.relative(root, f).split(path.sep).join('/') + ' */\n' + js + '\n</script>';
});

// 把问卷题库也内联进来（data/survey.json）
var surveyPath = path.join(root, "data", "survey.json");
var surveyJson = null;
try { surveyJson = JSON.parse(fs.readFileSync(surveyPath, "utf8")); } catch (e) { }
if (surveyJson && surveyJson.questions && surveyJson.questions.length) {
  html = html.replace("</head>", "<script>window.__ZJU_SURVEY__ = " + JSON.stringify(surveyJson) + ";<\/script>\n</head>");
  console.log("已内联问卷题库（" + surveyJson.questions.length + " 题）");
}

if (collectUrl && html.indexOf(collectUrl) < 0) {
  console.error('⚠️  上报地址没写进去');
  process.exit(1);
}

// 把数值设置也打进单文件（data/config-edit.json）
var cfgPath = path.join(root, "data", "config-edit.json");
var cfgJson = null;
try { cfgJson = JSON.parse(fs.readFileSync(cfgPath, "utf8")); } catch (e) { }
if (cfgJson) {
  var cfgTag = "<script>window.__ZJU_CONFIG__ = " + JSON.stringify(cfgJson) + ";<\/script>";
  var fi = html.indexOf("<script>");
  html = html.slice(0, fi) + cfgTag + "\n" + html.slice(fi);
  console.log("已内联数值设置（data/config-edit.json）");
}
// 把文案编辑器的改动也打进单文件（data/content-edit.json）
var overridePath = path.join(root, 'data', 'content-edit.json');
var overrideJson = null;
try { overrideJson = JSON.parse(fs.readFileSync(overridePath, 'utf8')); } catch (e) { }
if (overrideJson) {
  var tag = '<script>window.__ZJU_CONTENT__ = ' + JSON.stringify({ content: overrideJson, events: overrideJson.__events || [], achievements: overrideJson.__achievements, titles: overrideJson.__titles }) + ';<\/script>';
  var firstScript = html.indexOf('<script>');
  html = html.slice(0, firstScript) + tag + '\n' + html.slice(firstScript);
  console.log('已内联文案修改（data/content-edit.json）');
}
html = html.replace(/\n{3,}/g, '\n\n');

// 3) 输出
var outDir = path.join(root, 'dist');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

var out = path.join(outDir, outName);
fs.writeFileSync(out, html, 'utf8');

if (!collectUrl) {
  var siteDir = path.join(outDir, 'site');
  if (!fs.existsSync(siteDir)) fs.mkdirSync(siteDir);
  fs.writeFileSync(path.join(siteDir, 'index.html'), html, 'utf8');
}

var kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log('打包完成：' + out + '  (' + kb + ' KB)');
if (collectUrl) {
  console.log('上报地址：' + collectUrl);
  console.log('⚠️  这个文件会把玩家数据发到上面这个地址；服务关了数据会留在玩家浏览器里，下次打开再补发。');
  console.log('（写了上报地址的版本不覆盖 dist/site/）');
} else {
  console.log('上报地址：（未设置，纯离线版）');
  console.log('托管目录：' + path.join(outDir, 'site', 'index.html'));
}
