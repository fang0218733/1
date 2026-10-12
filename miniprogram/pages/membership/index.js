const api=require('../../services/api');
const config=require('../../data/config');
Page({
  data:{plans:config.memberships,membership:{active:false},referral:{count:0,availableCount:0,rebates:[]},selectedOrder:'',error:'',backendEnabled:api.backendEnabled},
  onShow(){Promise.all([api.getMembership(),api.getReferrals()]).then(([membership,referral])=>this.setData({membership,referral})).catch(e=>this.setData({error:e.message}));},
  onShareAppMessage(){return {title:'知伴 · 一起描绘专属陪伴',path:'/pages/customize/index'+(this.data.referral.code?'?referral='+this.data.referral.code:'')};},
  selectOrder(e){this.setData({selectedOrder:e.detail.value});},
  rebate(){if(!this.data.selectedOrder)return;wx.showModal({title:'申请活动返款',content:'申请退还所选50题普通定制的实际支付金额，最高12.8元，到账以支付渠道确认结果为准。',success:r=>{if(r.confirm)api.requestRebate(this.data.selectedOrder).then(()=>this.onShow()).catch(e=>this.setData({error:e.message}));}});},
  copy(){if(!this.data.referral.code){wx.showToast({title:'本地演示暂无真实邀请码',icon:'none'});return;}wx.setClipboardData({data:this.data.referral.code});},
  unavailable(){wx.showModal({title:'暂未开放购买',content:'真实支付尚未接通，不收款、不发放会员额度。方案上线后购买成功才会生效。',showCancel:false});}
});
