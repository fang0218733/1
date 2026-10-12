const {test}=require('node:test'),assert=require('node:assert/strict');
const Store=require('./store.cjs'),{Domain}=require('./domain.cjs'),{createApp}=require('./index.cjs');
const config=require('../miniprogram/data/config'),bank=require('../miniprogram/data/questions');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function input(id='basic',requestId='manual-demand-request-unique'){return {packageId:id,requestId,answers:Object.fromEntries(bank[id].map(q=>[q.id,['由设计师决定']])),publicAcknowledged:id!=='private'};}
function quote(d,o,amount=12.8){return d.manage(o.id,{action:'quote',revision:o.revision,amount,deliveryAt:'2026-11-01T18:00:00+08:00',revisions:2,refundConditions:'未开始制作可协商全额退款，制作后按双方约定处理'});}
test('三档独立价格、题库与报价快照、需求幂等及客户隔离',()=>{
 const s=new Store(':memory:'),d=new Domain(s);try{
  assert.equal(config.packages.length,3);assert.equal(bank.basic.length,50);assert.equal(bank.detailed.length,100);assert.equal(bank.private.length,100);
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
  o=d.review(o.id,{revision:o.revision,card:'经人工制作的成年人物卡',publish:false});assert.equal(o.productionStatus,'已交付');assert.equal(o.paymentStatus,'已人工核实');assert.equal(d.orders('a')[0].card,o.card);assert.equal(d.orders('a')[0].audit,undefined);
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
  assert.equal(o.paymentStatus,'已人工核实');o=(await request('/admin/api/orders/'+o.id+'/review','POST',{revision:o.revision,card:'人工完成的人物卡',publish:false},admin)).data;
  assert.equal(o.productionStatus,'已交付');const mine=(await request('/api/orders','GET',null,auth)).data[0];assert.equal(mine.card,'人工完成的人物卡');assert.equal(mine.quoteSnapshot.amount,12.8);assert.equal(mine.owner,undefined);
 }finally{await new Promise(r=>server.close(r));s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
