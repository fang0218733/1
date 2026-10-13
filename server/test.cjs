const {test}=require('node:test'),assert=require('node:assert/strict');
const Store=require('./store.cjs'),{Domain}=require('./domain.cjs'),{createApp}=require('./index.cjs');
const config=require('../miniprogram/data/config'),bank=require('../miniprogram/data/questions');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function sections(content='内容',id='basic'){return Object.fromEntries(require('../miniprogram/data/deliverables')[id].map(p=>[p.key,p.key==='persona'?content:'人工撰写的'+p.label]));}
function input(id='basic',requestId='manual-demand-request-unique'){return {packageId:id,requestId,answers:Object.fromEntries(bank[id].map(q=>[q.id,['由设计师决定']])),publicationChoice:id==='private'?'hidden':'public'};}
function quote(d,o,amount=12.8){return d.manage(o.id,{action:'quote',revision:o.revision,amount,deliveryAt:'2026-11-01T18:00:00+08:00',revisions:2,refundConditions:'未开始制作可协商全额退款，制作后按双方约定处理'});}
test('三档独立价格、题库与报价快照、需求幂等及客户隔离',()=>{
 const s=new Store(':memory:'),d=new Domain(s);try{
  assert.equal(config.packages.length,4);assert.equal(bank.basic.length,50);assert.equal(bank.detailed.length,100);assert.equal(bank.private.length,100);
  const o=d.submit('alice',{...input(),paymentStatus:'已人工核实',productionStatus:'已交付',price:0,owner:'bob'});
  assert.equal(o.paymentStatus,'待确认');assert.equal(o.productionStatus,'待处理');assert.equal(o.quoteSnapshot.amount,12.8);assert.equal(o.questionSnapshot.length,50);assert.ok(o.questionVersion);assert.equal(d.orders('bob').length,0);assert.equal(d.submit('alice',input()).id,o.id);
  const p=d.submit('bob',input('private'));assert.equal(p.price,null);assert.equal(p.privateOrder,true);
  d.updatePrices({basic:null,detailed:22,private:40});assert.equal(d.order(o.id).quoteSnapshot.amount,12.8);assert.equal(d.submit('next',input()).price,null);assert.equal(d.getConfig().packages[2].price,40);
  assert.throws(()=>d.updatePrices({basic:-1,detailed:null,private:null}),/价格/);
  assert.throws(()=>d.submit('new',{...input(),answers:{}}),/选择/);
 }finally{s.close();}
});
test('报价、收款核实、人工交付和退款独立流转，私人不可公开',async()=>{
 const s=new Store(':memory:'),d=new Domain(s);try{
  let o=d.submit('a',input());assert.throws(()=>d.manage(o.id,{action:'confirmReceipt',revision:0,amount:12.8}),/先确认/);
  assert.throws(()=>d.review(o.id,{revision:0,card:'未付不能交付'}),/核实/);
  o=quote(d,o);assert.equal(o.paymentStatus,'待付款');assert.equal(o.productionStatus,'待处理');assert.equal(o.quoteSnapshot.amount,12.8);
  assert.throws(()=>d.manage(o.id,{action:'confirmReceipt',revision:o.revision,amount:1}),/金额/);
  o=d.manage(o.id,{action:'confirmReceipt',revision:o.revision,amount:12.8});assert.equal(o.paymentStatus,'已人工核实');
  o=d.manage(o.id,{action:'start',revision:o.revision});assert.equal(o.productionStatus,'制作中');
  o=d.review(o.id,{revision:o.revision,sections:sections('经人工制作的成年人物卡'),publish:false});assert.equal(o.productionStatus,'已交付');assert.equal(o.paymentStatus,'已人工核实');assert.equal(d.orders('a')[0].card,o.card);assert.equal(d.orders('a')[0].audit,undefined);
  assert.throws(()=>d.manage(o.id,{action:'start',revision:0}),/刷新/);
  o=d.manage(o.id,{action:'refund',revision:o.revision,amount:12.8});assert.equal(o.paymentStatus,'已退款');assert.equal(o.productionStatus,'已取消');
  let p=quote(d,d.submit('p',input('private')),42);p=d.manage(p.id,{action:'confirmReceipt',revision:p.revision,amount:42});assert.throws(()=>d.review(p.id,{revision:p.revision,card:'私人卡',publish:true}),/禁止公开/);
  await assert.rejects(d.generate(o.id),/人工制作/);
 }finally{s.close();}
});
test('真实模式HTTP管理员鉴权、客户不可核实收款、后台改价交付与客户领取',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'persona-manual-')),s=new Store(':memory:');const env={DEMO_MODE:'false',PUBLIC_ORIGIN:'https://test.example',ADMIN_PASSWORD:'synthetic-test-password',MEDIA_DIR:dir};
 const {server}=createApp({store:s,env,identity:async code=>code});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 async function request(p,method='GET',data,headers={}){const res=await fetch(base+p,{method,headers:{'Content-Type':'application/json',...headers},...(data?{body:JSON.stringify(data)}:{})});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')};}
 try{
  const customer=(await request('/api/login','POST',{code:'customer'})).data.token,auth={Authorization:'Bearer '+customer};let o=(await request('/api/orders','POST',input(),auth)).data;
  assert.equal((await request('/api/orders','GET',null,{Authorization:'Bearer '+(await request('/api/login','POST',{code:'other'})).data.token})).data.length,0);
  assert.equal((await request('/admin/api/orders/'+o.id+'/manage','POST',{action:'confirmReceipt'}, {...auth,Origin:env.PUBLIC_ORIGIN})).status,401);
  assert.equal((await request('/admin/api/prices','POST',{basic:1})).status,403);
  const login=await request('/admin/api/login','POST',{password:env.ADMIN_PASSWORD},{Origin:env.PUBLIC_ORIGIN});const admin={Origin:env.PUBLIC_ORIGIN,Cookie:login.cookie.split(';')[0]};
  assert.equal((await request('/admin/api/prices','POST',{basic:14,detailed:null,private:null},admin)).status,200);assert.equal((await request('/api/config')).data.packages[1].price,null);
  o=(await request('/admin/api/orders/'+o.id+'/manage','POST',{action:'quote',revision:0,amount:12.8,deliveryAt:'2026-11-01T18:00:00+08:00',revisions:1,refundConditions:'双方私聊确认条件'},admin)).data;
  o=(await request('/admin/api/orders/'+o.id+'/manage','POST',{action:'confirmReceipt',revision:o.revision,amount:12.8},admin)).data;
  assert.equal(o.paymentStatus,'已人工核实');o=(await request('/admin/api/orders/'+o.id+'/review','POST',{revision:o.revision,sections:sections('人工完成的人物卡'),publish:false},admin)).data;
  assert.equal(o.productionStatus,'已交付');const mine=(await request('/api/orders','GET',null,auth)).data[0];assert.equal(mine.card,'人工完成的人物卡');assert.equal(mine.quoteSnapshot.amount,12.8);assert.equal(mine.owner,undefined);
 }finally{await new Promise(r=>server.close(r));s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('支付凭证归属、敏感图片私有、上传不改变付款，邀请人工核实分开计数',()=>{
 const s=new Store(':memory:'),d=new Domain(s);try{
 const code=d.loyalty.referral('host').code;d.loyalty.bind('customer',code);let o=d.submit('customer',input());
 assert.throws(()=>d.submitEvidence('other',o.id,{note:'伪造'}),/不存在/);
 assert.throws(()=>d.submitEvidence('customer',o.id,{image:Buffer.from('<svg/>').toString('base64')}),/支持/);
 d.submitEvidence('customer',o.id,{note:'金额12.8，时间供核对',image:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')});
 assert.equal(d.order(o.id).paymentStatus,'待确认');assert.equal(d.orders('customer')[0].evidence.status,'待管理员核对');assert.equal(d.orders('customer')[0].evidence.image,undefined);
 assert.equal(d.referralReport()[0].manualVerified,0);o=quote(d,d.order(o.id));o=d.manage(o.id,{action:'confirmReceipt',revision:o.revision,amount:12.8});
 const report=d.referralReport().find(r=>r.code===code);assert.equal(report.bound,1);assert.equal(report.manualVerified,1);assert.equal(report.providerVerified,0);assert.equal(report.rows[0].orderId,o.id);
 assert.throws(()=>d.submitEvidence('customer',o.id,{note:'新的凭证'}),/不接受/);
 d.manage(o.id,{action:'refund',revision:o.revision,amount:12.8});assert.equal(d.referralReport().find(r=>r.code===code).manualVerified,0);
 }finally{s.close();}
});
test('最终稿完整加入大厅，旧数据库新增一次，不覆盖管理员改动或下架',()=>{
 const s=new Store(':memory:');try{
 s.put('meta','seeded',true);s.put('cards','lin',{id:'lin',name:'管理员修改',published:false});
 let d=new Domain(s);const card=d.cards({relationship:'BG',search:'裴砚声'})[0];assert.ok(card);assert.ok(card.card.includes('06 对话示例与开场'));assert.ok(card.card.includes('今天早餐有两个选择'));assert.equal(s.get('cards','lin').name,'管理员修改');assert.equal(s.get('cards','lin').published,false);
 d.saveCard({...card,published:false});d=new Domain(s);assert.equal(d.cards({search:'裴砚声'}).length,0);assert.equal(s.list('cards').filter(c=>c.id===card.id).length,1);
 }finally{s.close();}
});
test('明确公开选择：未选不能提交，仅自己可见不加价也不可发布，公开须审核交付',()=>{
 const s=new Store(':memory:'),d=new Domain(s);try{
  const noChoice=input();delete noChoice.publicationChoice;noChoice.publicAcknowledged=true;assert.throws(()=>d.submit('none',noChoice),/请选择公开/);
  let hidden=d.submit('hidden',{...input(),publicationChoice:'hidden'});assert.equal(hidden.price,12.8);assert.equal(hidden.privateOrder,false);assert.equal(hidden.publicationConsent.choice,'hidden');
  hidden=quote(d,hidden);hidden=d.manage(hidden.id,{action:'confirmReceipt',revision:hidden.revision,amount:12.8});
  assert.throws(()=>d.review(hidden.id,{revision:hidden.revision,card:'不公开的成品',publish:true}),/不能发布/);
  hidden=d.review(hidden.id,{revision:hidden.revision,sections:sections('仅本人可领'),publish:false});assert.equal(d.orders('hidden')[0].card,'仅本人可领');assert.ok(!d.cards().some(c=>c.orderId===hidden.id));
  assert.throws(()=>d.submit('private',{...input('private'),publicationChoice:'public'}),/禁止公开/);
  let visible=d.submit('visible',input());assert.ok(visible.publicationConsent.confirmedAt);assert.ok(!d.cards().some(c=>c.orderId===visible.id));visible=quote(d,visible);visible=d.manage(visible.id,{action:'confirmReceipt',revision:visible.revision,amount:12.8});
  visible=d.review(visible.id,{revision:visible.revision,sections:sections('可公开成品'),publish:true,name:'公开角色',category:'都市',tag:'温柔',intro:'审核后成品'});assert.ok(d.cards().some(c=>c.orderId===visible.id));
  const old=d.order(visible.id);delete old.publicationChoice;delete old.publicationConsent;s.put('orders',old.id,old);assert.throws(()=>d.review(old.id,{revision:old.revision,card:'旧状态',publish:true}),/不能发布/);
 }finally{s.close();}
});
test('150题真实分支变化、依赖清除、服务端拒绝旧分支答案与48.8报价',()=>{
 const flow=require('../miniprogram/data/advanced-flow'),s=new Store(':memory:'),d=new Domain(s);try{
  const answers={};for(let i=0;i<150;i++){const q=flow.build(answers)[i];answers[q.id]=[q.options[0]];}
  const first=flow.build(answers);assert.equal(first.length,150);assert.equal(new Set(first.map(q=>q.id)).size,150);
  const before=first[1].options;answers['a1-root']=['人生转型'];assert.notDeepEqual(flow.build(answers)[1].options,before);
  assert.throws(()=>d.submit('advanced',{packageId:'advanced',requestId:'advanced-real-branch-request',answers,publicationChoice:'hidden'}),/选择/);
  const untouched=answers['a2-follow'];flow.clearDescendants(answers,'a1-root');assert.equal(answers['a1-follow'],undefined);assert.equal(answers['a1-deep'],undefined);assert.deepEqual(answers['a2-follow'],untouched);
  answers['a1-follow']=[flow.build(answers)[1].options[0]];answers['a1-deep']=[flow.build(answers)[2].options[0]];
  const o=d.submit('advanced',{packageId:'advanced',requestId:'advanced-real-branch-request',answers,publicationChoice:'hidden'});assert.equal(o.price,48.8);assert.equal(o.questionVersion,'advanced-branch-150-v1');assert.ok(o.questionSnapshot[1].title.includes('人生转型'));
 }finally{s.close();}
});
test('各档ZIP文件包完整性，缺项拒绝，下载权限限制为订单本人',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'persona-bundles-')),s=new Store(':memory:');const {server,domain}=createApp({store:s,env:{DEMO_MODE:'false',PUBLIC_ORIGIN:'https://example.test',ADMIN_PASSWORD:'synthetic-test-admin-password',MEDIA_DIR:dir},identity:async code=>code});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const schema=require('../miniprogram/data/deliverables');assert.equal(schema.basic.length,4);assert.equal(schema.detailed.length,8);assert.equal(schema.advanced.length,11);
  let o=domain.submit('owner',input());o=quote(domain,o);o=domain.manage(o.id,{action:'confirmReceipt',revision:o.revision,amount:12.8});assert.throws(()=>domain.review(o.id,{revision:o.revision,sections:{persona:'只有人物卡'},publish:false}),/文字内容/);
  o=domain.review(o.id,{revision:o.revision,sections:sections('完整人物设定'),publish:false});assert.equal(o.deliveryFormat,'zip-v1');assert.equal(o.deliverySchema.length,4);
  const base='http://127.0.0.1:'+server.address().port;
  async function token(code){return (await (await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})})).json()).token;}
  const url=base+'/api/orders/'+o.id+'/bundle';assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{Authorization:'Bearer '+await token('other')}})).status,404);
  const res=await fetch(url,{headers:{Authorization:'Bearer '+await token('owner')}});assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'application/zip');const bytes=Buffer.from(await res.arrayBuffer());assert.equal(bytes.readUInt32LE(0),0x04034b50);assert.equal(bytes.readUInt16LE(bytes.length-22+10),7);assert.ok(bytes.includes(Buffer.from('完整整合稿')));assert.ok(bytes.includes(Buffer.from('性格与表达方式')));assert.ok(!bytes.includes(Buffer.from('支付凭证')) || bytes.includes(Buffer.from('不包含客户问卷')));
 }finally{await new Promise(r=>server.close(r));s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('完整示例卡结构、自由主控说明与旧BL分类修正，保留下架和自定义文稿',()=>{
 const cards=require('../miniprogram/data/free-cards'),upgrade=require('../miniprogram/data/catalog-upgrade'),legacy=require('../miniprogram/data/legacy-free-text');
 for(const c of cards.slice(0,3)){assert.ok(c.card.length>4000);for(const section of ['01 ','02 ','03 ','04 ','05 ','06 ','可自行选择','默认开场','可替换的轻松开场'])assert.ok(c.card.includes(section));}
 const pei=cards.find(c=>c.id==='pei-yan-sheng-jiang-zhi-yi');assert.equal(pei.relationship,'BG');assert.ok(pei.card.includes('可自行选择扮演裴砚声或姜知宜'));assert.ok(pei.card.includes('所谓“地下恋嫂子”'));
 const corrected=upgrade({...pei,relationship:'BL'},pei);assert.equal(corrected.relationship,'BG');
 const expanded=upgrade({id:'lin',card:legacy.lin,published:false,cover:'/media/custom.png'},cards[0]);assert.ok(expanded.card.length>4000);assert.equal(expanded.published,false);assert.equal(expanded.cover,'/media/custom.png');
 const custom=upgrade({id:'lin',card:'管理员自行改写的稿件',published:true},cards[0]);assert.equal(custom.card,'管理员自行改写的稿件');
 const s=new Store(':memory:');try{s.put('meta','seeded',true);s.put('cards',pei.id,{...pei,relationship:'BL',published:true});const d=new Domain(s);assert.equal(d.cards({relationship:'BL',search:'裴砚声'}).length,0);assert.equal(d.cards({relationship:'BG',search:'裴砚声'}).length,1);}finally{s.close();}
});
