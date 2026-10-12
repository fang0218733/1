// Promise-based contract: replace this local adapter with authenticated backend requests.
// Future backend must validate package/version, answers, pricing and ownership server-side.
const config = require('../data/config');
const banks = require('../data/questions');
const KEY = 'persona-demo-v1';
function read() { return wx.getStorageSync(KEY) || { drafts: {}, orders: [] }; }
function write(value) { wx.setStorageSync(KEY, value); }
function getPackage(id) { const p = config.packages.find(p => p.id === id); if (!p) throw new Error('套餐不存在'); return p; }
function getQuestions(id) { getPackage(id); return banks[id]; }
function validAnswers(id, answers) {
  return getQuestions(id).every(q => Array.isArray(answers[q.id]) && answers[q.id].length > 0 && answers[q.id].every(v => q.options.includes(v)) && (q.multiple || answers[q.id].length === 1) && (!answers[q.id].includes('由设计师决定') || answers[q.id].length === 1));
}
function loadDraft(id) { getPackage(id); return read().drafts[id] || { answers: {}, index: 0 }; }
function saveDraft(id, draft) { getPackage(id); const data = read(); data.drafts[id] = draft; write(data); }
function seedOrders() {
  const data = read(); if (data.seeded) return;
  const card = '【演示成品 · 林知秋】\n定位：温柔慢热的成年创意工作者。\n外貌：简约穿搭，笑意柔和。\n性格：细腻、真诚，偶尔过度思考。\n关系：从朋友开始，缓慢建立信任。\n表达：温柔简洁，先倾听，再征求建议许可。\n边界：尊重独处与拒绝，不控制、不羞辱。\n剧情：散步、书店与日常成长。\n用途：DeepSeek 陪聊人设参考，示例内容不代表真实交付。';
  data.orders = [{ id: 'DEMO-COMPLETE', packageId: 'basic', name: '50题完整版', price: config.packages[0].price, status: '已完成', date: '演示样例', demo: true, card }, { id: 'DEMO-WORKING', packageId: 'detailed', name: '100题精细版', price: config.packages[1].price, status: '制作中', date: '演示样例', demo: true, card: '' }].concat(data.orders);
  data.seeded = true; write(data);
}
module.exports = {
  getPackage, getQuestions, loadDraft, saveDraft, validAnswers,
  getPackages: () => Promise.resolve(config.packages),
  // No login, payment or external AI calls in phase one.
  getIdentity: () => Promise.resolve({ mode: 'local-demo', authenticated: false }),
  listOrders: () => { seedOrders(); return Promise.resolve(read().orders); },
  submitOrder: (id, answers) => {
    if (!validAnswers(id, answers)) return Promise.reject(new Error('请完成所有题目'));
    const p = getPackage(id), data = read();
    const draft = data.drafts[id];
    if (draft && draft.orderId) return Promise.resolve(data.orders.find(o => o.id === draft.orderId));
    const order = { id: 'DEMO-' + Date.now(), packageId: id, name: p.name, price: p.price, status: '待处理', date: new Date().toLocaleString(), demo: true, answers: JSON.parse(JSON.stringify(answers)), card: '' };
    data.orders.unshift(order); data.drafts[id] = { answers: order.answers, index: 0, orderId: order.id }; write(data); return Promise.resolve(order);
  },
  clearDraft: id => { const data = read(); delete data.drafts[id]; write(data); }
};
