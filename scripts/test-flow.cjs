const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
let stored;
global.wx = { getStorageSync: () => stored && JSON.parse(JSON.stringify(stored)), setStorageSync: (key, data) => { stored = JSON.parse(JSON.stringify(data)); } };
const api = require('../miniprogram/services/api');
const config = require('../miniprogram/data/config');
async function main() {
  for (const p of config.packages) {
    const questions = api.getQuestions(p.id);
    assert.equal(questions.length, p.count);
    assert.equal(new Set(questions.map(q => q.id)).size, p.count);
    assert.equal(new Set(questions.map(q => q.title)).size, p.count);
    for (const q of questions) { assert.ok(q.category && q.title); assert.ok(q.options.length >= 4); assert.ok(q.options.includes('由设计师决定')); assert.equal(new Set(q.options).size, q.options.length); }
    const answers = Object.fromEntries(questions.map(q => [q.id, [q.options[0]]]));
    assert.equal(api.validAnswers(p.id, {}), false);
    await assert.rejects(api.submitOrder(p.id, {}));
    api.saveDraft(p.id, { answers, index: 12 });
    assert.deepEqual(api.loadDraft(p.id), { answers, index: 12 });
    const order = await api.submitOrder(p.id, answers);
    assert.equal(order.status, '待处理'); assert.equal(order.demo, true); assert.equal(order.price, p.price);
    assert.equal((await api.submitOrder(p.id, answers)).id, order.id);
    answers[questions[0].id] = ['非法答案'];
    assert.equal(api.validAnswers(p.id, answers), false);
    assert.notDeepEqual(order.answers, answers);
  }
  const orders = await api.listOrders();
  for (const status of ['待处理', '制作中', '已完成']) assert.ok(orders.some(o => o.status === status));
  assert.ok(orders.find(o => o.status === '已完成').card.includes('演示'));
  const count = orders.length; assert.equal((await api.listOrders()).length, count);
  api.clearDraft('basic');
  let definition;
  const filename = path.resolve(__dirname, '../miniprogram/pages/questionnaire/index.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { require: () => api, Page: p => { definition = p; }, wx: global.wx });
  const page = Object.assign({}, definition, { data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } });
  page.onLoad({ package: 'basic' });
  page.choose({ currentTarget: { dataset: { value: page.data.choices[0].value } } });
  assert.equal(page.data.answered, 1); page.next(); assert.equal(page.data.index, 1);
  page.prev(); assert.ok(page.data.choices[0].checked);
  page.setData({ index: 14 }); page.render();
  for (const value of page.data.question.options.slice(0, 2)) page.choose({ currentTarget: { dataset: { value } } });
  assert.equal(page.answers[page.data.question.id].length, 2);
  page.choose({ currentTarget: { dataset: { value: '由设计师决定' } } });
  assert.equal(JSON.stringify(page.answers[page.data.question.id]), JSON.stringify(['由设计师决定']));
  page.choose({ currentTarget: { dataset: { value: page.data.question.options[0] } } });
  assert.equal(page.answers[page.data.question.id].includes('由设计师决定'), false);
  console.log('通过：50/100题完整性、答案校验、草稿恢复、单/多选、设计师选项互斥、提交快照与去重、三种订单状态。');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
