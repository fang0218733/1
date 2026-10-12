const crypto = require('node:crypto');
const packages = require('../miniprogram/data/config');
const questions = require('../miniprogram/data/questions');
const seeds = require('../miniprogram/data/free-cards');
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function text(value, max, required = true) { if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('文字内容为空或超出长度限制'); return value.trim(); }
class Domain {
  constructor(store) { this.s = store;this.loyalty=new (require('./loyalty.cjs').Loyalty)(store); if (!store.get('meta', 'seeded')) store.transaction(() => { seeds.forEach((c,i) => store.put('cards', c.id, { ...c, category: ['治愈','活泼','沉稳'][i], cover: '', published: true, createdAt: Date.now()+i })); store.put('meta','seeded',true); }); }
  cardStats(card) { return { ...card, downloads: this.s.list('downloads').filter(x => x.cardId === card.id).length, favorites: this.s.list('favorites').filter(x => x.cardId === card.id).length }; }
  cards({ search = '', category = '', sort = 'new', favorites = false, relationship = '' } = {}, user, admin = false) {
    search = String(search).slice(0,100); category = String(category).slice(0,40);
    let list = this.s.list('cards').filter(c => (admin || c.published) && (!relationship || (c.relationship || 'BG') === relationship) && (!category || c.category === category) && (!search || [c.name,c.tag,c.intro].join(' ').includes(search)));
    list = list.map(c => ({ ...this.cardStats(c), favorite: !!(user && this.s.get('favorites', this.key(user,c.id))) }));
    if (favorites) list = list.filter(c => c.favorite);
    list.sort((a,b) => sort === 'hot' ? (b.downloads*2+b.favorites)-(a.downloads*2+a.favorites) || b.createdAt-a.createdAt : b.createdAt-a.createdAt);
    return list;
  }
  key(user,id) { return crypto.createHash('sha256').update(user+'\0'+id).digest('hex'); }
  card(id, admin = false) { const c = this.s.get('cards',id); if (!c || (!admin && !c.published)) fail('角色卡不存在或已下架',404); return c; }
  favorite(user,id,enabled) { this.card(id); const key = this.key(user,id); if (enabled) this.s.put('favorites',key,{ user,cardId:id }); else this.s.remove('favorites',key); return { favorite: enabled }; }
  download(user,id) { const card = this.card(id); this.s.put('downloads',this.key(user,id),{ user,cardId:id }); return { card: card.card, downloads: this.cardStats(card).downloads }; }
  relationship(value) { const result=value || 'BG';if(!packages.relationships.includes(result))fail('请选择BG、GL或BL');return result; }
  saveCard(input) {
    const id = input.id || crypto.randomUUID();
    if (!/^[\w-]{1,80}$/.test(id)) fail('角色ID不合法');
    const old = this.s.get('cards',id);
    if (old && old.orderId) fail('订单公开卡只能通过订单审核更新');
    const cover = text(input.cover || '',200,false);
    if (cover && !/^\/media\/[a-f0-9]{32}\.(png|jpg|webp)$/.test(cover)) fail('请使用后台上传的封面');
    return this.s.put('cards',id,{ id,relationship:this.relationship(input.relationship),name:text(input.name,60),tag:text(input.tag,100),intro:text(input.intro,300),category:text(input.category,40),card:text(input.card,12000),cover,symbol:(input.name || '').slice(0,1),published:!!input.published,createdAt:old ? old.createdAt : Date.now() });
  }
  submit(user,input) {
    const p = packages.packages.find(p => p.id === input.packageId); if (!p) fail('套餐不存在');
    const answers = input.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) fail('答案无效');
    const normalized = {};
    for (const q of questions[p.id]) {
      const a = answers[q.id];
      if (!Array.isArray(a) || !a.length || new Set(a).size !== a.length || a.some(v => !q.options.includes(v)) || (!q.multiple && a.length !== 1) || (a.includes('由设计师决定') && a.length !== 1)) fail('请完成全部选择，未答题可交由设计师决定');
      normalized[q.id] = a;
    }
    const privateOrder = input.privateOrder === true;
    if (!privateOrder && input.publicAcknowledged !== true) fail('请确认普通定制成品默认公开的说明');
    if (!/^[\w-]{16,100}$/.test(input.requestId || '')) fail('提交标识无效');
    const id = this.key(user,input.requestId);
    const payload = { packageId:p.id,relationship:this.relationship(input.relationship),useMembership:input.useMembership===true,answers:normalized,privateOrder,requirements:text(input.requirements || '',500,false),publicAcknowledged:!privateOrder,policyVersion:'public-v1' };
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return this.s.transaction(() => {
      const old = this.s.get('orders',id); if (old) { if (old.fingerprint !== fingerprint) fail('提交标识已使用，请重新开始',409); return this.customerOrder(old); }
      const order = { ...payload,id,owner:user,fingerprint,name:p.name,price:Number((p.price*(privateOrder?packages.privateMultiplier:1)).toFixed(2)),payment:'disabled',status:'待处理',date:new Date().toISOString(),createdAt:Math.max(Date.now(),(this.s.get('meta','lastOrderTime')||0)+1),revision:0,card:'',generated:'',generationError:'',publicCardId:'' };
      if(input.useMembership===true)this.loyalty.useQuota(user,order);this.s.put('meta','lastOrderTime',order.createdAt);this.s.put('orders',id,order); return this.customerOrder(order);
    });
  }
  customerOrder(o) { const { owner,fingerprint,generated,generatedParts,generationError,generationStarted, ...safe } = o; return safe; }
  orders(user) { return this.s.list('orders').filter(o => o.owner === user).sort((a,b) => b.createdAt-a.createdAt).map(o => o.type==='membership'?this.loyalty.purchaseView(o):this.customerOrder(o)); }
  order(id) { const order = this.s.get('orders',id); if (!order) fail('订单不存在',404); return order; }
  async generate(id, generator) {
    const revision = this.s.transaction(() => {
      const o = this.order(id);
      if(o.type==='membership')fail('会员订单无需生成');if(o.payment==='awaiting_topup')fail('私人差价尚未支付，不能生成');
      if (o.status === '已完成') fail('已完成订单不能重新生成',409);
      if (o.generationStarted && Date.now()-o.generationStarted < 120000) fail('正在生成，请稍后',409);
      o.revision++; o.generationStarted=Date.now(); o.status='制作中'; o.generationError=''; this.s.put('orders',id,o); return o.revision;
    });
    try {
      const o = this.order(id);
      const result = await generator(o, questions[o.packageId]);
      let generatedParts=null;
      if(o.packageId==='ultra') { const parts=typeof result==='string'?JSON.parse(result):result;generatedParts={};for(const key of ['card','biography','worldView','worldBackground'])generatedParts[key]=text(parts&&parts[key],8000); }
      const generated = generatedParts?generatedParts.card:text(result,12000);
      this.s.transaction(() => { const current=this.order(id); if (current.revision!==revision) fail('订单已变化，请刷新',409); current.generated=generated;current.generatedParts=generatedParts; current.generationStarted=0; current.revision++; this.s.put('orders',id,current); });
      return this.order(id);
    } catch(e) {
      this.s.transaction(() => { const current=this.order(id); if(current.revision===revision) { current.generationStarted=0; current.generationError='生成失败，请检查服务配置后重试，也可手动制作'; current.revision++; this.s.put('orders',id,current); } }); throw e;
    }
  }
  review(id,input) {
    return this.s.transaction(() => {
      const o=this.order(id);if(o.type==='membership')fail('会员订单不能交付人物卡');if(o.payment==='awaiting_topup')fail('私人差价尚未支付，不能交付'); if(input.revision!==o.revision) fail('订单已变化，请刷新后再审核',409);
      const card=text(input.card,12000); let parts={};if(o.packageId==='ultra')for(const key of ['biography','worldView','worldBackground'])parts[key]=text(input[key],8000);const completeCard=[card,...Object.entries(parts).map(([key,value])=>({'biography':'人物生平','worldView':'世界观','worldBackground':'世界背景'}[key])+'\n'+value)].join('\n\n'); const publish=input.publish===true;
      if(o.privateOrder && publish) fail('私人定制禁止公开',403);
      if(publish && !o.publicAcknowledged) fail('没有公开告知确认，不能发布',403);
      const publicId='order-'+id;
      if(publish) { this.s.put('cards',publicId,{ id:publicId,orderId:id,relationship:o.relationship||'BG',name:text(input.name,60),category:text(input.category,40),tag:text(input.tag,100),intro:text(input.intro,300),card:completeCard,cover:'',symbol:input.name.slice(0,1),published:true,createdAt:Date.now() }); o.publicCardId=publicId; }
      else { this.s.remove('cards',publicId); o.publicCardId=''; }
      o.card=card;Object.assign(o,parts); o.status='已完成'; o.revision++; o.generationStarted=0; this.s.put('orders',id,o); return o;
    });
  }
}
module.exports={Domain,fail};
