const api = require('../../services/api');
Page({
  data: { packages: [], error: '', backendEnabled: api.backendEnabled },
  onShow() { const code=wx.getStorageSync('persona-inviter');if(code&&api.backendEnabled)api.bindReferral(code).then(()=>wx.removeStorageSync('persona-inviter')).catch(e=>this.setData({error:'邀请绑定：'+e.message})); api.getPackages().then(packages => this.setData({ packages, error: '' })).catch(e => this.setData({ error: e.message })); },
  begin(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const draft = api.loadDraft(id);
      if (draft.orderId) {
        wx.showModal({ title: '开始新的定制', content: '此前答案已提交。是否开启新的答题？原订单会保留。', success: res => { if (res.confirm) { try { api.clearDraft(id); wx.navigateTo({ url: '/pages/questionnaire/index?package=' + id }); } catch (err) { this.setData({ error: '本地存储失败，请稍后重试' }); } } } });
      } else wx.navigateTo({ url: '/pages/questionnaire/index?package=' + id });
    } catch (err) { this.setData({ error: '无法读取本地数据，请检查存储空间' }); }
  },
  membership() { wx.navigateTo({url:'/pages/membership/index'}); },
  orders() { wx.switchTab({ url: '/pages/orders/index' }); }
});
