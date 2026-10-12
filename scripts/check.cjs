const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const source = path.join(root, 'miniprogram');
for (const file of [...walk(source), path.join(root, 'project.config.json'), path.join(root, 'package.json')]) {
  if (file.endsWith('.wxml')) {
    const template = fs.readFileSync(file, 'utf8');
    for (const match of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
      if (/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i.test(match[1])) throw new Error('WXML 表达式不能使用 HTML 实体编码: ' + path.relative(root, file));
    }
  }
  if (file.endsWith('.json')) JSON.parse(fs.readFileSync(file, 'utf8'));
  if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
const app = JSON.parse(fs.readFileSync(path.join(source, 'app.json'), 'utf8'));
if (!Array.isArray(app.pages) || app.pages.length === 0) throw new Error('app.json 必须注册首页');
for (const page of app.pages) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    if (!fs.existsSync(path.join(source, page + '.' + ext))) throw new Error('页面文件缺失: ' + page + '.' + ext);
  }
}
const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
if (path.resolve(root, project.miniprogramRoot) !== source) throw new Error('小程序源码目录不匹配');
if (!fs.existsSync(path.join(source, app.sitemapLocation))) throw new Error('sitemap 缺失');
console.log('检查通过：JavaScript 语法、JSON 格式、页面文件及源码目录。');
