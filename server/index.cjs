const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Store=require('./store.cjs');
const { Domain,fail }=require('./domain.cjs');
const providers=require('./providers.cjs');
const payment=require('./payment.cjs');
const packages=require('../miniprogram/data/config');
function createApp({ store,env=process.env,identity=code=>providers.wechatIdentity(code,env),generator=(o,q)=>providers.generate(o,q,env) }) {
  const domain=new Domain(store),loyalty=domain.loyalty,demo=env.DEMO_MODE==='true';
  if(!demo && (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length<16 || !/^https:\/\/[^/]+$/.test(env.PUBLIC_ORIGIN || ''))) throw new Error('正式模式必须配置至少16位后台密码与HTTPS PUBLIC_ORIGIN');
  const salt=crypto.randomBytes(16),passwordHash=crypto.scryptSync(env.ADMIN_PASSWORD || '',salt,64);
  const sessions=new Map(),limits=new Map();
  const mediaDir=env.MEDIA_DIR || path.join(__dirname,'data','media');fs.mkdirSync(mediaDir,{recursive:true});
  const token=()=>crypto.randomBytes(32).toString('hex');
  const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
  function rate(key,max=60,period=60000) { const now=Date.now(); for(const [k,v] of limits) if(now-v.start>period) limits.delete(k); const entry=limits.get(key)||{start:now,count:0}; if(now-entry.start>period) { entry.start=now; entry.count=0; } if(++entry.count>max) fail('操作过于频繁，请稍后再试',429); limits.set(key,entry); }
  function customer(req) { const match=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||''); const session=match&&store.get('sessions',hash(match[1])); if(!session || session.expires<Date.now()) fail('请重新登录',401); return session.user; }
  function optionalCustomer(req) { return req.headers.authorization?customer(req):null; }
  function admin(req) { const cookie=/(?:^|;\s*)persona_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||''); const session=cookie&&sessions.get(hash(cookie[1])); if(!session || session.expires<Date.now()) fail('请登录管理后台',401); }
  async function body(req,max=200000) { let size=0,chunks=[]; for await(const chunk of req) { size+=chunk.length; if(size>max) fail('请求内容过大',413); chunks.push(chunk); } try { return JSON.parse(Buffer.concat(chunks).toString()||'{}'); } catch(e) { fail('请求格式错误'); } }
  async function processQueue() { /* Manual production only; never auto-start before receipt verification. */ }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'http://localhost'),p=url.pathname;
      const adminRoute=p.startsWith('/admin/api/');
      if(adminRoute && req.method!=='GET') { const expected=demo?'http://'+req.headers.host:env.PUBLIC_ORIGIN; if(req.headers.origin!==expected) fail('管理请求来源不合法',403); }
      if(p==='/health') return send({ok:true,mode:demo?'demo':'live',paymentEnabled:false});
      if(p.startsWith('/media/')) { if(!/^\/media\/[a-f0-9]{32}\.(png|jpg|webp)$/.test(p)) fail('文件不存在',404); const filename=path.join(mediaDir,path.basename(p)); if(!fs.existsSync(filename)) fail('文件不存在',404); res.writeHead(200,{'Content-Type':p.endsWith('.png')?'image/png':p.endsWith('.jpg')?'image/jpeg':'image/webp'});return fs.createReadStream(filename).pipe(res); }
      if(p==='/admin' || p==='/admin/' || p==='/admin/app.js' || p==='/admin/style.css') { const file=p.endsWith('.js')?'app.js':p.endsWith('.css')?'style.css':'index.html';res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8'}); return res.end(fs.readFileSync(path.join(__dirname,'public',file))); }
      if(p==='/admin/api/login' && req.method==='POST') {
        rate('login:'+req.socket.remoteAddress,5,300000); const data=await body(req,2000);
        if(!demo && (typeof data.password!=='string' || data.password.length>200 || !crypto.timingSafeEqual(crypto.scryptSync(data.password,salt,64),passwordHash))) fail('密码错误',401);
        for(const [key,session] of sessions)if(session.expires<Date.now())sessions.delete(key);const t=token();sessions.set(hash(t),{expires:Date.now()+8*3600000});res.setHeader('Set-Cookie','persona_admin='+t+'; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=28800'+(demo?'':'; Secure'));return send({ok:true,demo});
      }
      if(adminRoute) {
        admin(req);
        if(p==='/admin/api/logout' && req.method==='POST') { const c=/(?:^|;\s*)persona_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||''); if(c)sessions.delete(hash(c[1]));res.setHeader('Set-Cookie','persona_admin=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0');return send({ok:true}); }
        if(p==='/admin/api/state' && req.method==='GET') return send({demo,cards:domain.cards({},null,true),referrals:store.list('rebates'),memberships:store.list('memberships').map(m=>({...m,quota:loyalty.membership(m.owner)})),membershipOrders:store.list('orders').filter(o=>o.type==='membership'),orders:store.list('orders').filter(o=>o.type!=='membership').sort((a,b)=>b.createdAt-a.createdAt),questions:require('../miniprogram/data/questions'),invitationReport:domain.referralReport(),config:domain.getConfig(),generationConfigured:false});
        const receiptMatch=/^\/admin\/api\/receipts\/([a-f0-9]{64})$/.exec(p);if(receiptMatch&&req.method==='GET'){const receipt=store.get('receipts',receiptMatch[1]);if(!receipt)fail('暂无凭证',404);return send(receipt);}
        if(p==='/admin/api/prices'&&req.method==='POST')return send(domain.updatePrices(await body(req)));
        if(p==='/admin/api/cards' && req.method==='POST') return send(domain.saveCard(await body(req)));
        if(p==='/admin/api/upload' && req.method==='POST') {
          const input=await body(req,2900000); if(typeof input.data!=='string' || input.data.length>2800000) fail('图片过大');
          const buffer=Buffer.from(input.data,'base64');let ext;
          if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ext='png';
          else if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255)ext='jpg';
          else if(buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP')ext='webp';
          if(!ext || buffer.length>2*1024*1024) fail('仅支持2MB以内PNG/JPEG/WebP图片');
          const filename=crypto.randomBytes(16).toString('hex')+'.'+ext;fs.writeFileSync(path.join(mediaDir,filename),buffer);return send({cover:'/media/'+filename});
        }
        const match=/^\/admin\/api\/orders\/([a-f0-9]{64})\/(generate|review|manage)$/.exec(p);
        if(match && req.method==='POST') {
          if(match[2]==='manage'){const input=await body(req);return send(input.action==='confirmReceipt'?payment.confirmReceipt(domain,match[1],input):input.action==='refund'?payment.recordRefund(domain,match[1],input):domain.manage(match[1],input));}
          if(match[2]==='generate') { rate('generate',10);const make=demo?async(o)=> o.packageId==='ultra'?{card:'模拟人物卡，待人工审核',biography:'模拟人物生平，待人工审核',worldView:'模拟世界观，待人工审核',worldBackground:'模拟世界背景，待人工审核'}:'【本地模拟生成 · 请审核】\n这是演示草稿，不是 DeepSeek 返回结果。请结合完整答案编写角色基础、外貌、性格、相处边界和剧情。':generator;return send(await domain.generate(match[1],make)); }
          return send(domain.review(match[1],await body(req)));
        }
        fail('接口不存在',404);
      }
      if(p==='/api/config') return send({...domain.getConfig(),mode:demo?'demo':'live'});
      if(p==='/api/login' && req.method==='POST') {
        rate('customer-login:'+req.socket.remoteAddress,30);const data=await body(req,2000);const user=demo?'local-demo-user':await identity(data.code);
        const t=token();store.put('sessions',hash(t),{user,expires:Date.now()+7*86400000});
        return send({token:t,mode:demo?'demo':'live'});
      }
      if(p==='/api/cards' && req.method==='GET') {
        const user=optionalCustomer(req);const list=domain.cards({search:url.searchParams.get('search')||'',category:url.searchParams.get('category')||'',relationship:url.searchParams.get('relationship')||'',sort:url.searchParams.get('sort')||'new',favorites:url.searchParams.get('favorites')==='true'},user);
        const page=Math.max(0,Math.min(Number(url.searchParams.get('page'))||0,10000));return send({items:list.slice(page*20,page*20+20),hasMore:list.length>(page+1)*20,categories:[...new Set(domain.cards().map(c=>c.category))]});
      }
      const cardMatch=/^\/api\/cards\/([\w-]{1,80})\/(favorite|download)$/.exec(p);
      if(cardMatch && req.method==='POST') { const user=customer(req);rate(user);const data=await body(req,2000);return send(cardMatch[2]==='favorite'?domain.favorite(user,cardMatch[1],data.enabled===true):domain.download(user,cardMatch[1])); }
      if(p==='/api/referrals' && req.method==='GET'){const user=customer(req);const summary=loyalty.referral(user),report=domain.referralReport().find(r=>r.code===summary.code);return send({...summary,bound:report?report.bound:0,manualVerified:report?report.manualVerified:0,refundableOrders:domain.orders(user).filter(o=>o.payment==='paid'&&o.packageId==='basic'&&!o.privateOrder&&!store.get('rebates',o.id)).map(o=>({id:o.id,name:o.name,price:o.price,date:o.date}))});}
      if(p==='/api/referrals/bind' && req.method==='POST'){const user=customer(req),data=await body(req,2000);return send(loyalty.bind(user,data.code));}
      if(p==='/api/referrals/rebate' && req.method==='POST'){customer(req);fail('真实支付和退款尚未接通，活动暂未开放',503);}
      if(p==='/api/membership' && req.method==='GET')return send(loyalty.membership(customer(req)));
      if(p==='/api/membership' && req.method==='POST'){fail('人工确认阶段暂不开放会员购买',503);const user=customer(req),data=await body(req,2000);return send(loyalty.purchase(user,data.planId,data.requestId));}
      const evidenceMatch=/^\/api\/orders\/([a-f0-9]{64})\/evidence$/.exec(p);if(evidenceMatch&&req.method==='POST'){const user=customer(req);rate('evidence:'+user,10);return send(domain.submitEvidence(user,evidenceMatch[1],await body(req,2900000)));}
      if(p==='/api/orders' && req.method==='GET') return send(domain.orders(customer(req)));
      if(p==='/api/orders' && req.method==='POST') { const user=customer(req);rate('orders:'+user,10);return send(domain.submit(user,await body(req))); }
      fail('接口不存在',404);
    } catch(e) { if(!res.headersSent)send({error:e.status?e.message:'服务暂不可用，请稍后重试'},e.status||500);else res.end(); }
  });
  let timer;server.on('listening',()=>{timer=setInterval(processQueue,2000);timer.unref();});server.on('close',()=>clearInterval(timer));
  return {server,domain,processQueue};
}
if(require.main===module) {
  const demo=process.env.DEMO_MODE==='true',host=process.env.HOST||(demo?'127.0.0.1':'0.0.0.0');
  if(demo && host!=='127.0.0.1') throw new Error('演示模式仅允许绑定本机');
  const data=process.env.DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(data,{recursive:true});
  const store=new Store(path.join(data,'persona.sqlite'));
  const {server}=createApp({store});server.listen(Number(process.env.PORT)||8080,host,()=>console.log('服务已启动，模式：'+(demo?'仅本机演示':'正式配置')+'，不提供支付'));
}
module.exports={createApp};
