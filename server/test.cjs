const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Store=require('./store.cjs');
const {Domain}=require('./domain.cjs');
const {createApp}=require('./index.cjs');
const bank=require('../miniprogram/data/questions');
function input(overrides={}) {return {packageId:'basic',requestId:'request-unique-token-123',answers:Object.fromEntries(bank.basic.map(q=>[q.id,['由设计师决定']])),requirements:'避免昵称',privateOrder:false,publicAcknowledged:true,...overrides};}
test('服务端校验、订单隔离、幂等、生成审核、私人禁止公开及持久化',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'persona-store-'));const file=path.join(dir,'test.sqlite');const store=new Store(file);const d=new Domain(store);
  assert.throws(()=>d.submit('u',input({publicAcknowledged:false})),/公开/);
  assert.throws(()=>d.submit('u',input({answers:{}})),/选择/);
  const order=d.submit('alice',input({price:0,owner:'bob',status:'已完成'}));
  assert.equal(order.price,12.8);assert.equal(order.status,'待处理');assert.equal(d.orders('bob').length,0);assert.equal(d.orders('alice').length,1);
  assert.equal(d.submit('alice',input()).id,order.id);
  assert.throws(()=>d.submit('alice',input({requirements:'不同内容'})),/标识已使用/);
  let release;const pending=d.generate(order.id,()=>new Promise(r=>{release=r;}));await assert.rejects(d.generate(order.id,async()=> '重复'),/正在生成/);release('虚构成年角色，温柔认真，尊重边界。');const generated=await pending;
  assert.equal(d.orders('alice')[0].card,'');assert.equal(d.cards().length,3);
  assert.throws(()=>d.review(order.id,{revision:0,card:'卡'}),/已变化/);
  const approved=d.review(order.id,{revision:generated.revision,card:generated.generated,publish:true,name:'新角色',category:'治愈',tag:'温柔',intro:'成年人设'});
  assert.equal(approved.status,'已完成');assert.equal(d.cards().length,4);
  assert.ok(!JSON.stringify(d.cards()).includes('避免昵称'));
  d.download('alice','lin');d.download('alice','lin');d.download('bob','lin');assert.equal(d.cards().find(c=>c.id==='lin').downloads,2);
  d.favorite('alice','lin',true);d.favorite('alice','lin',true);assert.equal(d.cards().find(c=>c.id==='lin').favorites,1);assert.equal(d.cards({favorites:true},'alice').length,1);d.favorite('alice','lin',false);assert.equal(d.cards({favorites:true},'alice').length,0);
  const privateOrder=d.submit('bob',input({privateOrder:true,publicAcknowledged:false}));assert.equal(privateOrder.price,19.2);
  assert.throws(()=>d.review(privateOrder.id,{revision:0,card:'私人卡',publish:true,name:'不能公开'}),/禁止公开/);
  const ready=d.review(privateOrder.id,{revision:0,card:'私人卡',publish:false});assert.equal(ready.status,'已完成');assert.equal(d.cards().length,4);
  const failing=d.submit('u',input());await assert.rejects(d.generate(failing.id,async()=>{throw new Error('断网');}),/断网/);assert.ok(d.order(failing.id).generationError);assert.equal(d.order(failing.id).generationStarted,0);assert.equal(d.orders('u')[0].card,'');
  const lin=d.card('lin',true);d.saveCard({...lin,published:false});assert.throws(()=>d.download('alice','lin'),/下架/);assert.equal(d.cards().length,3);
  store.close();const reopened=new Store(file);assert.equal(new Domain(reopened).orders('bob')[0].card,'私人卡');reopened.close();fs.rmSync(dir,{recursive:true,force:true});
});
test('HTTP登录、管理员隔离、CSRF、上传、价格、客户订单与审核端到端',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'persona-http-'));const store=new Store(':memory:');
  const env={DEMO_MODE:'false',ADMIN_PASSWORD:'synthetic-test-only-password',PUBLIC_ORIGIN:'https://test.example',MEDIA_DIR:dir};
  const {server}=createApp({store,env,identity:async code=>code==='alice'?'alice':'bob',generator:async()=> '测试生成草稿'});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  async function call(p,method='GET',body,headers={}){const res=await fetch(base+p,{method,headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')};}
  try {
    assert.equal((await call('/admin/api/state')).status,401);
    assert.equal((await call('/admin/api/login','POST',{})).status,403);
    assert.equal((await call('/admin/api/login','POST',{password:'wrong'},{Origin:env.PUBLIC_ORIGIN})).status,401);
    const logged=await call('/admin/api/login','POST',{password:env.ADMIN_PASSWORD},{Origin:env.PUBLIC_ORIGIN});assert.equal(logged.status,200);assert.ok(logged.cookie.includes('HttpOnly')&&logged.cookie.includes('Secure'));
    const adminHeaders={Origin:env.PUBLIC_ORIGIN,Cookie:logged.cookie.split(';')[0]};assert.equal((await call('/admin/api/state','GET',null,adminHeaders)).status,200);
    assert.equal((await call('/admin/api/upload','POST',{data:Buffer.from('<svg/>').toString('base64')},adminHeaders)).status,400);
    const alice=(await call('/api/login','POST',{code:'alice'})).data.token;const bob=(await call('/api/login','POST',{code:'bob'})).data.token;
    const auth={Authorization:'Bearer '+alice};
    assert.equal((await call('/api/orders','POST',input())).status,401);
    const created=await call('/api/orders','POST',input(),auth);assert.equal(created.status,200);assert.equal(created.data.price,12.8);
    assert.equal((await call('/api/orders','GET',null,{Authorization:'Bearer '+bob})).data.length,0);
    assert.equal((await call('/admin/api/orders/'+created.data.id+'/generate','POST',{},auth)).status,403);
    const generated=await call('/admin/api/orders/'+created.data.id+'/generate','POST',{},adminHeaders);assert.equal(generated.data.generated,'测试生成草稿');
    const customer=(await call('/api/orders','GET',null,auth)).data[0];assert.equal(customer.card,'');assert.equal(customer.generated,undefined);
    const reviewed=await call('/admin/api/orders/'+created.data.id+'/review','POST',{revision:generated.data.revision,card:'已审核卡',publish:false},adminHeaders);assert.equal(reviewed.status,200);
    assert.equal((await call('/api/orders','GET',null,auth)).data[0].card,'已审核卡');
    await call('/api/cards/lin/download','POST',{},auth);await call('/api/cards/lin/download','POST',{},auth);assert.equal((await call('/api/cards')).data.items.find(x=>x.id==='lin').downloads,1);
    assert.equal((await call('/admin/api/logout','POST',{},adminHeaders)).status,200);assert.equal((await call('/admin/api/state','GET',null,adminHeaders)).status,401);
  } finally {await new Promise(r=>server.close(r));store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('自动队列先生成草稿不交付，日额度和失败状态控制重试',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'persona-queue-'));const store=new Store(':memory:');
  const {server,domain,processQueue}=createApp({store,env:{DEMO_MODE:'true',MEDIA_DIR:dir,AUTO_GENERATE:'true',MAX_AUTO_GENERATIONS_PER_DAY:'1'}});
  try {
    const first=domain.submit('a',input());domain.submit('b',input());
    await processQueue();assert.ok(domain.order(first.id).generated.includes('模拟'));assert.equal(domain.orders('a')[0].card,'');assert.equal(domain.order(first.id).status,'制作中');
    await processQueue();assert.equal(domain.orders('b')[0].status,'待处理');
  }finally{server.close();store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('小程序远程适配器与HTTP后端联调：登录、收藏、断网重试幂等及审核交付',async()=>{
  const vm=require('node:vm'),{createRequire}=require('node:module');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'persona-client-')),store=new Store(':memory:');
  const {server,domain}=createApp({store,env:{DEMO_MODE:'true',MEDIA_DIR:dir}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const memory=new Map();let loseSubmitResponse=true;
  const wx={getStorageSync:key=>memory.get(key),setStorageSync:(key,value)=>memory.set(key,structuredClone(value)),login:opts=>opts.success({code:'test-code'}),request:opts=>{
    fetch(opts.url,{method:opts.method,headers:opts.header,...(opts.method==='GET'?{}:{body:JSON.stringify(opts.data)})}).then(async res=>{
      const data=await res.json();if(loseSubmitResponse&&opts.method==='POST'&&opts.url.endsWith('/api/orders')){loseSubmitResponse=false;opts.fail();return;}opts.success({statusCode:res.status,data});
    }).catch(()=>opts.fail());
  }};
  function load(relative,overrides={}){const filename=path.resolve(__dirname,'../miniprogram/services',relative),module={exports:{}};const native=createRequire(filename);vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,wx,require:name=>Object.hasOwn(overrides,name)?overrides[name]:native(name)},{filename});return module.exports;}
  const remote=load('remote.js',{'../data/runtime':{apiBase:base}});const api=load('api.js',{'./remote':remote,'./invitation':{ensure:async()=>({bound:false})}});
  try {
    assert.equal((await api.getPackages())[0].price,12.8);assert.equal((await api.getCards()).items.length,3);
    await api.favoriteCard('lin',true);assert.equal((await api.getCards({favorites:true})).items.length,1);
    const answers=input().answers;await assert.rejects(api.submitOrder('basic',answers,{publicAcknowledged:false}),/公开/);
    await assert.rejects(api.submitOrder('basic',answers,{publicAcknowledged:true,requirements:'温柔'}),/网络/);
    const order=await api.submitOrder('basic',answers,{publicAcknowledged:true,requirements:'温柔'});
    assert.equal(store.list('orders').length,1);assert.equal(api.loadDraft('basic').orderId,order.id);
    domain.review(order.id,{revision:0,card:'最终审核成品',publish:false});assert.equal((await api.listOrders())[0].card,'最终审核成品');
  }finally{await new Promise(r=>server.close(r));store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('超详细四份交付、方向标签与150题校验',async()=>{
  const s=new Store(':memory:'),d=new Domain(s);
  try{
    const answers=Object.fromEntries(bank.ultra.map(q=>[q.id,['由设计师决定']]));assert.equal(bank.ultra.length,150);
    const o=d.submit('u',input({packageId:'ultra',answers,relationship:'GL'}));assert.equal(o.price,68.8);assert.equal(o.relationship,'GL');
    const generated=await d.generate(o.id,async()=>({card:'人物卡',biography:'人物生平',worldView:'世界规则',worldBackground:'历史背景'}));
    assert.equal(d.orders('u')[0].generatedParts,undefined);assert.throws(()=>d.review(o.id,{revision:generated.revision,card:'人物卡',publish:false}),/文字内容/);
    const reviewed=d.review(o.id,{revision:generated.revision,card:'人物卡',biography:'人物生平',worldView:'世界规则',worldBackground:'历史背景',publish:true,name:'成年角色',category:'奇幻',tag:'慢热 · 温柔',intro:'虚构设定'});
    assert.equal(reviewed.worldView,'世界规则');assert.ok(d.cards({relationship:'GL'}).some(c=>c.card.includes('历史背景')));
    assert.throws(()=>d.submit('x',input({relationship:'其他'})),/BG/);
  }finally{s.close();}
});
test('重复邀请三人返款，去重、退款资格失效与模拟付款不计入',()=>{
  const s=new Store(':memory:'),d=new Domain(s),l=d.loyalty;
  function paid(owner,requestId){const o=d.submit(owner,input({requestId}));l.recordVerifiedPayment(o.id,{verified:true,transactionId:'tx-'+o.id,amountCents:1280,paidAt:Date.now()});return o;}
  try{
    const code=l.referral('host').code;const own1=paid('host','host-first-paid-order');const own2=paid('host','host-second-paid-order');
    assert.throws(()=>l.bind('host',code),/自己/);
    for(let i=0;i<6;i++){l.bind('invitee'+i,code);paid('invitee'+i,'invitee-first-paid-order');}
    assert.equal(l.referral('host').availableCount,6);
    const first=l.requestRebate('host',own1.id);assert.equal(first.amount,12.8);assert.equal(l.referral('host').availableCount,3);
    assert.equal(l.requestRebate('host',own1.id).status,first.status);l.requestRebate('host',own2.id);assert.equal(l.referral('host').availableCount,0);
    l.recordVerifiedRefund(own1.id,{verified:true,refundId:'refund-host-1',amountCents:1280});assert.equal(l.referral('host').rebates.find(r=>r.orderId===own1.id).status,'已退款');
    const c=s.get('inviteCredits','invitee4');l.recordVerifiedRefund(c.orderId,{verified:true,refundId:'refund-invitee-4',amountCents:1280});assert.equal(l.referral('host').rebates.find(r=>r.orderId===own2.id).status,'资格失效，待复核');assert.equal(l.referral('host').availableCount,2);
    assert.throws(()=>l.recordVerifiedPayment(own1.id,{verified:false,transactionId:'fake',amountCents:1280,paidAt:Date.now()}),/凭据/);
    l.bind('demo-user',code);d.submit('demo-user',input());assert.equal(l.referral('host').count,5);
    assert.throws(()=>l.bind('demo-user',l.referral('other').code),/其他/);
  }finally{s.close();}
});
test('月卡五次、年卡八次任意普通定制与私人差价，会员月重置',async()=>{
  const {monthAt}=require('./loyalty.cjs');const s=new Store(':memory:'),d=new Domain(s),l=d.loyalty;
  function activate(owner,planId){const o=l.purchase(owner,planId,'member-purchase-request');l.recordVerifiedPayment(o.id,{verified:true,transactionId:'member-'+owner,amountCents:planId==='monthly'?5880:22880,paidAt:Date.now()});return o;}
  try{
    const draft=l.purchase('disabled','monthly','disabled-member-request');assert.equal(draft.payment,'disabled');assert.equal(l.membership('disabled').active,false);
    activate('monthly','monthly');assert.equal(l.membership('monthly').remaining,5);
    for(let i=0;i<5;i++)d.submit('monthly',input({requestId:'monthly-custom-request-'+i,useMembership:true}));assert.equal(l.membership('monthly').remaining,0);
    assert.throws(()=>d.submit('monthly',input({requestId:'monthly-custom-request-six',useMembership:true})),/额度/);
    activate('yearly','yearly');const ultraAnswers=Object.fromEntries(bank.ultra.map(q=>[q.id,['由设计师决定']]));const free=d.submit('yearly',input({packageId:'ultra',answers:ultraAnswers,requestId:'yearly-ultra-free-request',useMembership:true}));assert.equal(free.price,0);
    assert.equal(l.membership('yearly').remaining,7);assert.equal(l.membership('yearly',monthAt(l.membership('yearly').expiresAt,-11)+1000).remaining,8);
    const privateOrder=d.submit('yearly',input({requestId:'yearly-private-request',privateOrder:true,useMembership:true}));assert.equal(privateOrder.price,6.4);assert.equal(privateOrder.status,'待补差价');
    await assert.rejects(d.generate(privateOrder.id,async()=> '不应生成'),/差价/);
    l.recordVerifiedPayment(privateOrder.id,{verified:true,transactionId:'topup-yearly',amountCents:640,paidAt:Date.now()});assert.equal(d.order(privateOrder.id).status,'待处理');
    assert.equal(l.membership('yearly').remaining,6);
    assert.equal(new Date(monthAt(Date.UTC(2026,0,31),1)).toISOString().slice(0,10),'2026-02-28');assert.equal(new Date(monthAt(Date.UTC(2026,0,31),2)).toISOString().slice(0,10),'2026-03-31');
  }finally{s.close();}
});
