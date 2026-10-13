// Local demo adapter with authenticated remote service routing. Server validates ownership, answers and pricing.
const remote = require('./remote');
const invitation = require('./invitation');
const freeCards = require('../data/free-cards');
const config = require('../data/config');
const banks = require('../data/questions');
let currentPackages = config.packages;
const KEY = 'persona-demo-v1';
function read() { return wx.getStorageSync(KEY) || { drafts: {}, orders: [] }; }
function write(value) { wx.setStorageSync(KEY, value); }
function getPackage(id) { const p = currentPackages.find(p => p.id === id); if (!p) throw new Error('套餐不存在'); return p; }
function getQuestions(id,answers={}) { getPackage(id); return id==='advanced'?require('../data/advanced-flow').build(answers):banks[id]; }
function clearDependentAnswers(id,answers,questionId){if(id==='advanced')require('../data/advanced-flow').clearDescendants(answers,questionId);}
function validAnswers(id, answers) {
  return getQuestions(id,answers).every(q => Array.isArray(answers[q.id]) && answers[q.id].length > 0 && answers[q.id].every(v => q.options.includes(v)) && (q.multiple || answers[q.id].length === 1) && (!answers[q.id].includes('由设计师决定') || answers[q.id].length === 1));
}
function loadDraft(id) { getPackage(id); return read().drafts[id] || { answers: {}, index: 0 }; }
function saveDraft(id, draft) { getPackage(id); const data = read(); data.drafts[id] = Object.assign({}, data.drafts[id] || {}, draft); write(data); }
function seedOrders() {
  const data = read(); if (data.seeded) return;
  const card = '【演示成品 · 林知秋】\n定位：温柔慢热的成年创意工作者。\n外貌：简约穿搭，笑意柔和。\n性格：细腻、真诚，偶尔过度思考。\n关系：从朋友开始，缓慢建立信任。\n表达：温柔简洁，先倾听，再征求建议许可。\n边界：尊重独处与拒绝，不控制、不羞辱。\n剧情：散步、书店与日常成长。\n用途：DeepSeek 陪聊人设参考，示例内容不代表真实交付。';
  data.orders = [{ id: 'DEMO-COMPLETE', packageId: 'basic', name: '50题完整版', price: config.packages[0].price, paymentStatus:'已人工核实',productionStatus:'已交付',status:'已交付',questionVersion:config.questionVersion,quoteSnapshot:{amount:config.packages[0].price},date: '演示样例', demo: true, card }, { id: 'DEMO-WORKING', packageId: 'detailed', name: '100题精细版', price: config.packages[1].price, paymentStatus:'已人工核实',productionStatus:'制作中',status:'制作中',questionVersion:config.questionVersion,quoteSnapshot:{amount:config.packages[1].price},date: '演示样例', demo: true, card: '' }].concat(data.orders);
  data.seeded = true; write(data);
}
function gallery() {
  const data=wx.getStorageSync('persona-gallery-v1') || {favorites:[],downloads:[],cards:[]};
  let changed=false;
  freeCards.forEach(c=>{const index=data.cards.findIndex(old=>old.id===c.id);const old=index>=0?data.cards[index]:null;const updated=require('../data/catalog-upgrade')(old,c);if(updated!==old){if(index<0)data.cards.push(updated);else data.cards[index]=updated;changed=true;}});
  if(changed)saveGallery(data);
  return data;
}
function saveGallery(data) { wx.setStorageSync('persona-gallery-v1',data); }
module.exports = {
  backendEnabled: remote.enabled,
  ensureReferral: invitation.ensure,
  getMembership: () => remote.enabled ? remote.request('/api/membership','GET',{},true) : Promise.resolve({active:false,plans:config.memberships}),
  getReferrals: () => remote.enabled ? remote.request('/api/referrals','GET',{},true) : Promise.resolve({code:'',bound:0,manualVerified:0,count:0,availableCount:0,target:3,enabled:false,rebates:[],refundableOrders:[]}),
  requestRebate: orderId => remote.enabled ? remote.request('/api/referrals/rebate','POST',{orderId},true) : Promise.reject(new Error('本地演示不执行真实退款')),
  bindReferral: code => remote.enabled ? remote.request('/api/referrals/bind','POST',{code},true) : Promise.resolve({bound:false}),
  getCards: async (options = {}) => {
    if (remote.enabled) { const params=Object.keys(options).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(options[k])).join('&'); const result=await remote.request('/api/cards?'+params,'GET',{},!!options.favorites);result.items=result.items.map(c=>({...c,cover:c.cover?remote.base+c.cover:''}));return result; }
    const data=gallery();let items=data.cards.filter(c=>c.published && (!options.relationship||(c.relationship||'BG')===options.relationship)&&(!options.category||c.category===options.category) && (!options.search||[c.name,c.tag,c.intro].join(' ').includes(options.search))).map(c=>({...c, favorite:data.favorites.includes(c.id),downloads:data.downloads.includes(c.id)?1:0,favorites:data.favorites.includes(c.id)?1:0}));
    if(options.favorites)items=items.filter(c=>c.favorite);if(options.sort==='hot')items.sort((a,b)=>(b.downloads*2+b.favorites)-(a.downloads*2+a.favorites));
    const page=Number(options.page)||0;return {items:items.slice(page*20,page*20+20),hasMore:items.length>(page+1)*20,categories:[...new Set(data.cards.filter(c=>c.published).map(c=>c.category))]};
  },
  favoriteCard: async (id,enabled) => { if(remote.enabled)return remote.request('/api/cards/'+id+'/favorite','POST',{enabled},true);const data=gallery();data.favorites=data.favorites.filter(x=>x!==id);if(enabled)data.favorites.push(id);saveGallery(data);return {favorite:enabled}; },
  downloadCard: async id => { if(remote.enabled)return remote.request('/api/cards/'+id+'/download','POST',{},true);const data=gallery();const c=data.cards.find(c=>c.id===id&&c.published);if(!c)throw new Error('角色已下架');if(!data.downloads.includes(id))data.downloads.push(id);saveGallery(data);return {card:c.card,downloads:1}; },
  getPackage, getQuestions, clearDependentAnswers, loadDraft, saveDraft, validAnswers,
  quote: id => getPackage(id).price,
  getPackages: () => remote.enabled ? remote.request('/api/config').then(c=>{currentPackages=c.packages;return c.packages;}) : Promise.resolve(config.packages),
  getIdentity: () => Promise.resolve({ mode: remote.enabled ? 'server' : 'local-demo', authenticated: remote.enabled && !!wx.getStorageSync('persona-session') }),
  submitEvidence: async (id,input) => {
    if(remote.enabled)return remote.request('/api/orders/'+id+'/evidence','POST',input,true);
    const data=read(),o=data.orders.find(o=>o.id===id);if(!o)throw new Error('需求单不存在');if(!['待确认','待付款'].includes(o.paymentStatus))throw new Error('当前状态不能提交');o.evidence={submittedAt:new Date().toLocaleString(),status:'模拟提交，非真实付款核实',note:input.note,image:input.image};write(data);return o.evidence;
  },
  downloadBundle: id => remote.enabled?remote.downloadBundle(id):Promise.reject(new Error('本地模拟暂无真实交付文件，需部署后台并人工交付')),
  listOrders: () => { if(remote.enabled)return remote.request('/api/orders','GET',{},true);seedOrders(); return Promise.resolve(read().orders); },
  submitOrder: async (id, answers, options = {}) => {
    if (!validAnswers(id, answers)) return Promise.reject(new Error('请完成所有题目'));
    if (typeof options.requirements !== 'undefined' && (typeof options.requirements !== 'string' || options.requirements.length > 500)) return Promise.reject(new Error('具体要求最多500字'));
    options={...options,privateOrder:id==='private'};
    if(options.privateOrder&&options.publicationChoice==='public')throw new Error('私人定制禁止公开');
    options.publicationChoice=options.privateOrder?'hidden':options.publicationChoice;
    if(!['public','hidden'].includes(options.publicationChoice))throw new Error('请选择公开到免费大厅或仅自己可见');
    if(remote.enabled) { await invitation.ensure();const draft=loadDraft(id);if(!draft.requestId){draft.requestId='request-'+Date.now()+'-'+Math.random().toString(36).slice(2);saveDraft(id,draft);}return remote.request('/api/orders','POST',{packageId:id,answers,...options,requestId:draft.requestId},true).then(order=>{saveDraft(id,{orderId:order.id});return order;}); }
    if(options.useMembership)return Promise.reject(new Error('本地演示没有真实会员额度'));
    const p = getPackage(id), data = read();
    const draft = data.drafts[id];
    if (draft && draft.orderId) return Promise.resolve(data.orders.find(o => o.id === draft.orderId));
    const order = { id: 'DEMO-' + Date.now() + '-' + Math.random().toString(36).slice(2,10), packageId: id, name: p.name, price:p.price,quoteSnapshot:{amount:p.price,currency:'CNY',capturedAt:new Date().toISOString()},questionVersion:id==='advanced'?config.advancedVersion:config.questionVersion,questionSnapshot:getQuestions(id,answers),paymentStatus:'待确认',productionStatus:'待处理',paymentMode:'manual',terms:{deliveryAt:'',revisions:null,refundConditions:''}, relationship: options.relationship || 'BG', privateOrder: !!options.privateOrder, publicationChoice:options.publicationChoice,publicationConsent:{choice:options.publicationChoice,version:'publication-choice-v2',confirmedAt:new Date().toISOString()},publicAcknowledged:options.publicationChoice==='public', requirements: (options.requirements || '').trim(), status: '待确认需求单', date: new Date().toLocaleString(), demo: true, answers: JSON.parse(JSON.stringify(answers)), card: '' };
    data.orders.unshift(order); data.drafts[id] = { answers: order.answers, index: 0, privateOrder: order.privateOrder, requirements: order.requirements, publicationChoice:order.publicationChoice,publicAcknowledged: order.publicAcknowledged, orderId: order.id }; write(data); return Promise.resolve(order);
  },
  clearDraft: id => { const data = read(); delete data.drafts[id]; write(data); }
};
