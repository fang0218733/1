const api = require('../../services/api');
Page({
  data: { backendEnabled: api.backendEnabled, orders: [], filters: ['全部', '待处理', '制作中', '已完成'], active: '全部', error: '' },
  onShow() { Promise.resolve().then(() => api.listOrders()).then(orders => { this.all = orders; this.filter(); }).catch(() => this.setData({ error: '订单读取失败，请稍后重试' })); },
  select(e) { this.setData({ active: e.currentTarget.dataset.status }); this.filter(); },
  filter() { this.setData({ orders: (this.all || []).filter(o => this.data.active === '全部' || o.status === this.data.active) }); },
  copy(e) { const order = (this.all || []).find(o => o.id === e.currentTarget.dataset.id); if (!order || !order.card) return; wx.setClipboardData({ data: order.card, success: () => wx.showToast({ title: '人设卡已复制' }), fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }) }); },
  home() { wx.reLaunch({ url: '/pages/index/index' }); }
});
