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
  assert.equal(order.price,8.8);assert.equal(order.status,'待处理');assert.equal(d.orders('bob').length,0);assert.equal(d.orders('alice').length,1);
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
  const privateOrder=d.submit('bob',input({privateOrder:true,publicAcknowledged:false}));assert.equal(privateOrder.price,13.2);
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
    const created=await call('/api/orders','POST',input(),auth);assert.equal(created.status,200);assert.equal(created.data.price,8.8);
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
  const remote=load('remote.js',{'../data/runtime':{apiBase:base}});const api=load('api.js',{'./remote':remote});
  try {
    assert.equal((await api.getPackages())[0].price,8.8);assert.equal((await api.getCards()).items.length,3);
    await api.favoriteCard('lin',true);assert.equal((await api.getCards({favorites:true})).items.length,1);
    const answers=input().answers;await assert.rejects(api.submitOrder('basic',answers,{publicAcknowledged:false}),/公开/);
    await assert.rejects(api.submitOrder('basic',answers,{publicAcknowledged:true,requirements:'温柔'}),/网络/);
    const order=await api.submitOrder('basic',answers,{publicAcknowledged:true,requirements:'温柔'});
    assert.equal(store.list('orders').length,1);assert.equal(api.loadDraft('basic').orderId,order.id);
    domain.review(order.id,{revision:0,card:'最终审核成品',publish:false});assert.equal((await api.listOrders())[0].card,'最终审核成品');
  }finally{await new Promise(r=>server.close(r));store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
