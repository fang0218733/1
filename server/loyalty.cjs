// Payment/refund ledger entry points are server-internal only. Never expose them
// as client/admin HTTP actions; a future payment adapter must verify provider signatures first.
const crypto=require('node:crypto');
const config=require('../miniprogram/data/config');
const {fail}=require('./domain.cjs');
function monthAt(start,n) { const offset=8*3600000,d=new Date(start+offset),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.getTime()-offset; }
class Loyalty {
  constructor(store) {this.s=store;}
  referral(user) {
    let profile=this.s.get('profiles',user);if(!profile){profile={user,code:crypto.randomBytes(8).toString('hex')};this.s.put('profiles',user,profile);}
    const qualifying=this.s.list('inviteCredits').filter(x=>x.inviter===user&&!x.refunded);
    const rebates=this.s.list('rebates').filter(r=>r.user===user);
    return {code:profile.code,count:qualifying.length,target:3,availableCount:qualifying.filter(c=>!c.rebateId).length,rebates:rebates.map(r=>({orderId:r.orderId,status:r.status,amount:r.amount})),enabled:false,rule:'邀请3位不同新客户完成真实付款，可退本人一单已付50题普通定制的实际金额，最高12.8元。会员、免费和退款订单不计入。当前尚未接通真实支付。'};
  }
  bind(user,code) {
    if(!/^[a-f0-9]{16}$/.test(code||''))fail('邀请码无效');
    const inviter=this.s.list('profiles').find(x=>x.code===code);if(!inviter)fail('邀请码不存在');if(inviter.user===user)fail('不能邀请自己');
    const old=this.s.get('referralBindings',user);if(old){if(old.inviter!==inviter.user)fail('已绑定其他邀请人');return {bound:true};}
    if(this.s.list('orders').some(o=>o.owner===user))fail('仅首次下单前的新客户可绑定邀请');
    this.s.put('referralBindings',user,{user,inviter:inviter.user,createdAt:Date.now()});return {bound:true};
  }
  purchase(user,planId,requestId) {
    const plan=config.memberships.find(p=>p.id===planId);if(!plan)fail('会员方案不存在');if(!/^[\w-]{16,100}$/.test(requestId||''))fail('提交标识无效');
    const id=crypto.createHash('sha256').update(user+'\0membership\0'+requestId).digest('hex');
    return this.s.transaction(()=>{const old=this.s.get('orders',id);if(old){if(old.planId!==planId)fail('提交标识已使用',409);return this.purchaseView(old);}const o={id,owner:user,type:'membership',planId,name:plan.name,price:plan.price,payment:'disabled',status:'未开通',createdAt:Date.now(),date:new Date().toISOString()};this.s.put('orders',id,o);return this.purchaseView(o);});
  }
  purchaseView(o){return {id:o.id,type:o.type,planId:o.planId,name:o.name,price:o.price,payment:o.payment,status:o.status,date:o.date};}
  membership(user,now=Date.now()) {
    const active=this.s.list('memberships').filter(m=>m.owner===user&&!m.refunded&&now>=m.startedAt&&now<monthAt(m.startedAt,m.months));
    if(!active.length)return {active:false,plans:config.memberships};
    const m=active.sort((a,b)=>b.startedAt-a.startedAt)[0];let cycle=0;while(cycle+1<m.months&&now>=monthAt(m.startedAt,cycle+1))cycle++;
    const used=this.s.list('quotaUses').filter(x=>x.membershipId===m.id&&x.cycle===cycle).length;
    return {active:true,id:m.id,planId:m.planId,name:m.name,allowance:m.allowance,remaining:Math.max(0,m.allowance-used),cycle,cycleEnds:monthAt(m.startedAt,cycle+1),expiresAt:monthAt(m.startedAt,m.months),packages:m.packages};
  }
  useQuota(user,order) { // Called inside the same transaction as order insertion.
    const m=this.membership(user);if(!m.active||m.remaining<1)fail('没有可用会员额度');if(!m.packages.includes(order.packageId))fail('此套餐不在会员额度范围');

    this.s.put('quotaUses',order.id,{orderId:order.id,membershipId:m.id,cycle:m.cycle,owner:user});order.listPrice=order.price;order.price=order.privateOrder?Number((config.packages.find(p=>p.id===order.packageId).price*0.5).toFixed(2)):0;order.payment=order.privateOrder?'awaiting_topup':'membership';if(order.privateOrder)order.status='待补差价';order.membershipId=m.id;
  }
  // evidence is produced by a trusted payment adapter, never request JSON.
  recordVerifiedPayment(id,evidence) {
    if(!evidence||evidence.verified!==true||!evidence.transactionId||!Number.isSafeInteger(evidence.amountCents)||evidence.amountCents<=0||!Number.isFinite(evidence.paidAt)||evidence.paidAt>Date.now())fail('缺少已核验支付凭据');
    return this.s.transaction(()=>{
      const o=this.s.get('orders',id);if(!o)fail('订单不存在',404);
      if(Math.round(o.price*100)!==evidence.amountCents||o.payment==='membership')fail('支付金额不一致');
      const existing=this.s.get('payments',evidence.transactionId);if(existing){if(existing.orderId!==id)fail('交易号已使用');return {duplicate:true};}
      if(o.payment==='paid'||o.payment==='refunded')fail('订单支付状态不允许更新');
      if(o.type==='membership' && this.membership(o.owner,evidence.paidAt).active)fail('已有有效会员，请人工核验重复支付');
      this.s.put('payments',evidence.transactionId,{orderId:id,amount:evidence.amountCents/100,paidAt:evidence.paidAt});o.payment='paid';o.paidAt=evidence.paidAt;if(o.status==='待补差价')o.status='待处理';
      if(o.type==='membership') {const p=config.memberships.find(p=>p.id===o.planId);if(!p)fail('会员方案不存在');o.status='已开通';this.s.put('memberships',id,{id,owner:o.owner,planId:p.id,name:p.name,months:p.months,allowance:p.allowance,packages:p.packages,startedAt:evidence.paidAt});}
      else if(!o.membershipId) { const binding=this.s.get('referralBindings',o.owner);const previous=this.s.list('orders').some(x=>x.owner===o.owner&&x.payment==='paid');if(binding&&!previous&&!this.s.get('inviteCredits',o.owner))this.s.put('inviteCredits',o.owner,{invitee:o.owner,inviter:binding.inviter,orderId:id,refunded:false}); }
      this.s.put('orders',id,o);return {paid:true};
    });
  }
  requestRebate(user,orderId) {
    return this.s.transaction(()=>{const old=this.s.get('rebates',orderId);if(old){if(old.user!==user)fail('订单不属于你',403);return {status:old.status,amount:old.amount};}
      const credits=this.s.list('inviteCredits').filter(c=>c.inviter===user&&!c.refunded&&!c.rebateId).slice(0,3);if(credits.length<3)fail('尚未达到3位未使用的有效实付款客户');
      const order=this.s.get('orders',orderId);if(!order||order.owner!==user||order.packageId!=='basic'||order.privateOrder||order.payment!=='paid'||order.type==='membership')fail('请选择本人已付的50题普通定制订单');
      const r={user,orderId,status:'待支付渠道处理',amount:Math.min(order.price,12.8),creditUsers:credits.map(c=>c.invitee),createdAt:Date.now()};
      for(const c of credits){c.rebateId=orderId;this.s.put('inviteCredits',c.invitee,c);}this.s.put('rebates',orderId,r);return {status:r.status,amount:r.amount};});
  }
  recordVerifiedRefund(orderId,evidence) {
    if(!evidence||evidence.verified!==true||!evidence.refundId||!Number.isSafeInteger(evidence.amountCents))fail('缺少已核验退款凭据');
    return this.s.transaction(()=>{const old=this.s.get('refunds',evidence.refundId);if(old){if(old.orderId!==orderId)fail('退款号已使用');return {duplicate:true};}const o=this.s.get('orders',orderId);if(!o||o.payment!=='paid'||Math.round(o.price*100)!==evidence.amountCents)fail('退款金额或状态不一致');o.payment='refunded';this.s.put('orders',orderId,o);this.s.put('refunds',evidence.refundId,{orderId,amount:evidence.amountCents/100});const member=this.s.get('memberships',orderId);if(member){member.refunded=true;this.s.put('memberships',orderId,member);}if(o.membershipId)this.s.remove('quotaUses',orderId);const credit=this.s.get('inviteCredits',o.owner);if(credit&&credit.orderId===orderId){credit.refunded=true;this.s.put('inviteCredits',o.owner,credit);const r=credit.rebateId&&this.s.get('rebates',credit.rebateId);if(r){if(r.status==='已退款')r.status='已退款，邀请资格待复核';else {r.status='资格失效，待复核';for(const u of r.creditUsers){const c=this.s.get('inviteCredits',u);delete c.rebateId;this.s.put('inviteCredits',u,c);}}this.s.put('rebates',r.orderId,r);}}const rebate=this.s.get('rebates',orderId);if(rebate&&rebate.orderId===orderId){rebate.status='已退款';this.s.put('rebates',orderId,rebate);}return {refunded:true};});
  }
}
module.exports={Loyalty,monthAt};
