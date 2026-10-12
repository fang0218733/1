const api = require('../../services/api');
Page({
  data: { backendEnabled: api.backendEnabled, orders: [], filters: ['全部', '待处理', '制作中', '已完成', '未开通', '待补差价'], active: '全部', error: '' },
  onShow() { Promise.resolve().then(() => api.listOrders()).then(orders => { this.all = orders; this.filter(); }).catch(() => this.setData({ error: '订单读取失败，请稍后重试' })); },
  select(e) { this.setData({ active: e.currentTarget.dataset.status }); this.filter(); },
  filter() { this.setData({ orders: (this.all || []).filter(o => this.data.active === '全部' || o.status === this.data.active) }); },
  copy(e) { const order = (this.all || []).find(o => o.id === e.currentTarget.dataset.id); if (!order || !order.card) return; wx.setClipboardData({ data: [order.card,order.biography?'人物生平\n'+order.biography:'',order.worldView?'世界观\n'+order.worldView:'',order.worldBackground?'世界背景\n'+order.worldBackground:''].filter(Boolean).join('\n\n'), success: () => wx.showToast({ title: '人设卡已复制' }), fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }) }); },
  home() { wx.switchTab({ url: '/pages/customize/index' }); }
});
