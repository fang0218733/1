const crypto = require('node:crypto');
const packages = require('../miniprogram/data/config');
const questions = require('../miniprogram/data/questions');
const seeds = require('../miniprogram/data/free-cards');
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function text(value, max, required = true) { if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('文字内容为空或超出长度限制'); return value.trim(); }
class Domain {
  constructor(store) {
    this.s=store;this.loyalty=new (require('./loyalty.cjs').Loyalty)(store);
    const legacySeeded=!!store.get('meta','seeded');
    store.transaction(()=>{
      seeds.forEach((c,i)=>{
        const key='catalog-import-'+c.id;
        if(store.get('meta',key))return;
        // Preserve existing edits/downlisting and legacy deletions; add new catalog cards once.
        if(!store.get('cards',c.id)&&(!legacySeeded||i>=3))store.put('cards',c.id,{...c,category:c.category||['治愈','活泼','沉稳'][i]||'其他',cover:'',published:true,createdAt:Date.now()+i});
        store.put('meta',key,true);
      });
      store.put('meta','seeded',true);
    });
  }
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
    const p = this.getConfig().packages.find(p => p.id === input.packageId); if (!p) fail('套餐不存在');
    const answers = input.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) fail('答案无效');
    const normalized = {};
    const resolvedQuestions=p.id==='advanced'?require('../miniprogram/data/advanced-flow').build(answers):questions[p.id];
    for (const q of resolvedQuestions) {
      const a = answers[q.id];
      if (!Array.isArray(a) || !a.length || new Set(a).size !== a.length || a.some(v => !q.options.includes(v)) || (!q.multiple && a.length !== 1) || (a.includes('由设计师决定') && a.length !== 1)) fail('请完成全部选择，未答题可交由设计师决定');
      normalized[q.id] = a;
    }
    const privateOrder = p.id === 'private';
    const publicationChoice=privateOrder?'hidden':input.publicationChoice;
    if(!['public','hidden'].includes(publicationChoice))fail('请选择公开到免费大厅或仅自己可见');
    if(privateOrder&&input.publicationChoice==='public')fail('私人定制禁止公开');
    if (!/^[\w-]{16,100}$/.test(input.requestId || '')) fail('提交标识无效');
    const id = this.key(user,input.requestId);
    const payload = { packageId:p.id,relationship:this.relationship(input.relationship),answers:normalized,privateOrder,requirements:text(input.requirements || '',500,false),publicationChoice,publicAcknowledged:publicationChoice==='public',policyVersion:'publication-choice-v2',publicationConsent:{choice:publicationChoice,version:'publication-choice-v2'} };
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return this.s.transaction(() => {
      const old = this.s.get('orders',id); if (old) { if (old.fingerprint !== fingerprint) fail('提交标识已使用，请重新开始',409); return this.customerOrder(old); }
      const order = { ...payload,publicationConsent:{...payload.publicationConsent,confirmedAt:new Date().toISOString()},id,owner:user,fingerprint,name:p.name,price:p.price,quoteSnapshot:{amount:p.price,currency:'CNY',capturedAt:new Date().toISOString()},questionVersion:p.id==='advanced'?packages.advancedVersion:packages.questionVersion,questionSnapshot:resolvedQuestions,paymentMode:'manual',paymentStatus:'待确认',productionStatus:'待处理',payment:'manual_unconfirmed',status:'待确认需求单',terms:{deliveryAt:'',revisions:null,refundConditions:''},audit:[],date:new Date().toISOString(),createdAt:Math.max(Date.now(),(this.s.get('meta','lastOrderTime')||0)+1),revision:0,card:'',generated:'',generationError:'',publicCardId:'' };
      if(input.useMembership===true)fail('当前人工确认流程不使用会员额度');this.s.put('meta','lastOrderTime',order.createdAt);this.s.put('orders',id,order); return this.customerOrder(order);
    });
  }
  submitEvidence(user,id,input) {
    return this.s.transaction(()=>{
      const o=this.order(id);if(o.owner!==user)fail('需求单不存在',404);
      if(!['待确认','待付款'].includes(o.paymentStatus)||o.productionStatus==='已取消')fail('当前状态不接受凭证');
      const note=text(input.note||'',300,false),data=input.image||'';let mime='';
      if(data){if(typeof data!=='string'||data.length>2800000||! /^[A-Za-z0-9+/]*={0,2}$/.test(data))fail('凭证图片无效');const b=Buffer.from(data,'base64');if(b.length>2*1024*1024)fail('凭证图片须小于2MB');if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';else if(b[0]===255&&b[1]===216&&b[2]===255)mime='image/jpeg';else if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')mime='image/webp';else fail('只支持PNG、JPEG或WebP');}
      if(!note&&!data)fail('请提交截图或核对说明');
      const receipt={orderId:id,note,image:data,mime,submittedAt:new Date().toISOString(),status:'待管理员核对'};
      this.s.put('receipts',id,receipt);o.revision++;this.s.put('orders',id,o);return {submittedAt:receipt.submittedAt,status:receipt.status};
    });
  }
  referralReport() {
    return this.s.list('profiles').map(p=>{
      const bindings=this.s.list('referralBindings').filter(b=>b.inviter===p.user);
      const rows=bindings.map(b=>{const orders=this.s.list('orders').filter(o=>o.owner===b.user&&o.type!=='membership'&&!o.membershipId);const paid=orders.find(o=>o.paymentStatus==='已人工核实'&&o.agreedQuote&&o.agreedQuote.amount>0);return {customerId:this.key(b.user,'report').slice(0,12),boundAt:b.createdAt,orderId:paid?paid.id:orders[0]&&orders[0].id||'',state:paid?'已人工核实':orders.some(o=>o.paymentStatus==='已退款')?'已退款，不计入':'尚未核实付款'};});
      return {code:p.code,bound:rows.length,manualVerified:rows.filter(r=>r.state==='已人工核实').length,rows,providerVerified:this.loyalty.referral(p.user).count};
    });
  }
  customerOrder(o) { const { owner,fingerprint,audit,generated,generatedParts,generationError,generationStarted, ...safe } = o; const receipt=this.s.get('receipts',o.id);return {...safe,evidence:receipt?{submittedAt:receipt.submittedAt,status:receipt.status}:null}; }
  orders(user) { return this.s.list('orders').filter(o => o.owner === user).sort((a,b) => b.createdAt-a.createdAt).map(o => o.type==='membership'?this.loyalty.purchaseView(o):this.customerOrder(o)); }
  order(id) { const order = this.s.get('orders',id); if (!order) fail('订单不存在',404); return order; }
  getConfig() { const prices=this.s.get('meta','manualPrices')||{};return {...packages,paymentEnabled:false,paymentMode:'manual',packages:packages.packages.map(p=>({...p,price:Object.hasOwn(prices,p.id)?prices[p.id]:p.price}))}; }
  updatePrices(input) { const prices={};for(const p of packages.packages){const value=Object.hasOwn(input,p.id)?input[p.id]:this.getConfig().packages.find(x=>x.id===p.id).price;if(value!==null&&(!Number.isFinite(value)||value<0||Math.abs(Math.round(value*100)-value*100)>0.000001))fail('价格应为非负金额（最多两位小数），或空值');prices[p.id]=value;}this.s.put('meta','manualPrices',prices);return this.getConfig(); }
  manage(id,input,adminId='authenticated-admin') {
    return this.s.transaction(()=>{
      const o=this.order(id);if(input.revision!==o.revision)fail('需求单已变化，请刷新',409);
      if(!o.paymentStatus)fail('历史订单需另行核对，不自动迁移付款状态');
      const action=input.action;
      if(action==='quote') {
        if(o.paymentStatus==='已人工核实'||o.paymentStatus==='已退款'||o.productionStatus==='已取消')fail('当前状态不能重新报价');
        if(!Number.isFinite(input.amount)||input.amount<0||Math.abs(Math.round(input.amount*100)-input.amount*100)>0.000001)fail('约定金额无效');
        if(!Number.isInteger(input.revisions)||input.revisions<0||input.revisions>100)fail('请输入0至100的修改次数');
        if(typeof input.deliveryAt!=='string'||!Number.isFinite(Date.parse(input.deliveryAt)))fail('请录入有效约定交付时间');
        o.price=input.amount;o.agreedQuote={amount:input.amount,currency:'CNY',confirmedAt:new Date().toISOString()};o.terms={deliveryAt:input.deliveryAt,revisions:input.revisions,refundConditions:text(input.refundConditions,1000)};o.paymentStatus='待付款';
      } else if(action==='confirmReceipt') {
        if(o.paymentStatus!=='待付款'||o.productionStatus==='已取消'||!o.agreedQuote)fail('请先确认报价，当前不能核实收款');
        if(input.amount!==o.agreedQuote.amount)fail('收款金额与约定报价不一致');
        o.paymentStatus='已人工核实';o.payment='manual_verified';
      } else if(action==='refund') {if(o.paymentStatus!=='已人工核实')fail('只有已人工核实收款的需求单可记录退款');if(input.amount!==o.agreedQuote.amount)fail('当前只记录全额退款，金额必须一致');o.paymentStatus='已退款';o.payment='manual_refunded';o.productionStatus='已取消';}
      else if(action==='start') {if(o.paymentStatus!=='已人工核实'||o.productionStatus!=='待处理')fail('核实收款后才能开始制作');o.productionStatus='制作中';}
      else if(action==='cancel') {if(o.productionStatus==='已交付')fail('已交付订单不能直接取消');o.productionStatus='已取消';}
      else fail('操作无效');
      o.revision++;o.audit=(o.audit||[]).concat({action,adminId,at:new Date().toISOString()});this.s.put('orders',id,o);return o;
    });
  }
  async generate() { fail('本阶段采用人工制作，不调用AI生成',503); }
  review(id,input) {
    return this.s.transaction(() => {
      const o=this.order(id);if(o.paymentStatus!=='已人工核实'||!['待处理','制作中','已交付'].includes(o.productionStatus))fail('核实收款且未取消后才能交付');if(o.type==='membership')fail('会员订单不能交付人物卡');if(o.payment==='awaiting_topup')fail('私人差价尚未支付，不能交付'); if(input.revision!==o.revision) fail('订单已变化，请刷新后再审核',409);
      const publish=input.publish===true;
      if(o.privateOrder && publish) fail('私人定制禁止公开',403);
      if(publish && (o.publicationChoice!=='public'||o.publicationConsent?.version!=='publication-choice-v2')) fail('没有公开告知确认，不能发布',403);
      const schema=require('../miniprogram/data/deliverables')[o.packageId];if(!schema)fail('历史套餐需单独核对交付内容');const sections={};for(const part of schema)sections[part.key]=text(input.sections&&input.sections[part.key],8000);const card=sections.persona; const parts={};const completeCard=schema.map(p=>p.label+'\n'+sections[p.key]).join('\n\n');
      const publicId='order-'+id;
      if(publish) { this.s.put('cards',publicId,{ id:publicId,orderId:id,relationship:o.relationship||'BG',name:text(input.name,60),category:text(input.category,40),tag:text(input.tag,100),intro:text(input.intro,300),card:completeCard,cover:'',symbol:input.name.slice(0,1),published:true,createdAt:Date.now() }); o.publicCardId=publicId; }
      else { this.s.remove('cards',publicId); o.publicCardId=''; }
      o.deliverySections=sections;o.deliverySchema=schema;o.deliveryFormat='zip-v1';o.card=card;Object.assign(o,parts); o.productionStatus='已交付';o.status='已交付';o.audit=(o.audit||[]).concat({action:'deliver',adminId:'authenticated-admin',at:new Date().toISOString()}); o.revision++; o.generationStarted=0; this.s.put('orders',id,o); return o;
    });
  }
}
module.exports={Domain,fail};
