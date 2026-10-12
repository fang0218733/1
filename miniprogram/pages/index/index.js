const api = require('../../services/api');
Page({
  data: { packages: [], error: '' },
  onLoad() { api.getPackages().then(packages => this.setData({ packages })); },
  begin(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const draft = api.loadDraft(id);
      if (draft.orderId) {
        wx.showModal({ title: '开始新的定制', content: '此前答案已提交。是否开启新的答题？原订单会保留。', success: res => { if (res.confirm) { try { api.clearDraft(id); wx.navigateTo({ url: '/pages/questionnaire/index?package=' + id }); } catch (err) { this.setData({ error: '本地存储失败，请稍后重试' }); } } } });
      } else wx.navigateTo({ url: '/pages/questionnaire/index?package=' + id });
    } catch (err) { this.setData({ error: '无法读取本地数据，请检查存储空间' }); }
  },
  orders() { wx.navigateTo({ url: '/pages/orders/index' }); }
});
