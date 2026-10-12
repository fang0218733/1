const api = require('../../services/api');
Page({
  data: { packages: [], error: '', referralError:'',busy:false, backendEnabled: api.backendEnabled },
  onShow() {
    this.setData({ error:'', referralError:'' });
    api.getPackages().then(packages=>this.setData({packages})).catch(e=>this.setData({error:e.message}));
    api.ensureReferral().catch(e=>this.setData({referralError:'邀请未绑定：'+e.message}));
  },
  dismissReferral() {
    wx.showModal({title:'不参与本次邀请？',content:'清除本机待绑定的邀请码，继续正常定制。不会改变服务器已有的邀请关系，也不会计入本次邀请。',success:r=>{if(r.confirm){wx.removeStorageSync('persona-inviter');this.setData({referralError:''});}}});
  },
  async begin(e) {
    if(this.data.busy)return;this.setData({busy:true});
    const id = e.currentTarget.dataset.id;
    try {
      try{await api.ensureReferral();}catch(e){this.setData({referralError:'邀请未绑定：'+e.message});return;}
      const draft = api.loadDraft(id);
      if (draft.orderId) {
        wx.showModal({ title: '开始新的定制', content: '此前需求单已提交。是否开始新的问卷？原需求单会保留。', success: res => { if (res.confirm) { try { api.clearDraft(id); wx.navigateTo({ url: '/pages/questionnaire/index?package=' + id }); } catch (err) { this.setData({ error: '本地存储失败，请稍后重试' }); } } } });
      } else wx.navigateTo({ url: '/pages/questionnaire/index?package=' + id });
    } catch (err) { this.setData({ error: '无法读取本地数据，请检查存储空间' }); } finally {this.setData({busy:false});}
  },
  membership() { wx.navigateTo({url:'/pages/membership/index'}); },
  orders() { wx.switchTab({ url: '/pages/orders/index' }); }
});
