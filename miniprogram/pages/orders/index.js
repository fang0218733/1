const api = require('../../services/api');
Page({
  data: { backendEnabled: api.backendEnabled, orders: [], filters: ['全部','待处理','制作中','已交付','已取消'], active: '全部', error: '' },
  onShow() { Promise.resolve().then(() => api.listOrders()).then(orders => { this.all = orders; this.filter(); }).catch(() => this.setData({ error: '订单读取失败，请稍后重试' })); },
  select(e) { this.setData({ active: e.currentTarget.dataset.status }); this.filter(); },
  filter() { this.setData({ orders: (this.all || []).filter(o => this.data.active === '全部' || o.productionStatus === this.data.active) }); },
  copy(e) { const order = (this.all || []).find(o => o.id === e.currentTarget.dataset.id); if (!order || !order.card) return; wx.setClipboardData({ data: [order.card,order.biography?'人物生平\n'+order.biography:'',order.worldView?'世界观\n'+order.worldView:'',order.worldBackground?'世界背景\n'+order.worldBackground:''].filter(Boolean).join('\n\n'), success: () => wx.showToast({ title: '人设卡已复制' }), fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }) }); },
  copyDemand(e) { const o=(this.all||[]).find(o=>o.id===e.currentTarget.dataset.id);if(!o)return;wx.setClipboardData({data:JSON.stringify({编号:o.id,套餐:o.name,题库版本:o.questionVersion,创建时间:o.date,提交报价快照:o.quoteSnapshot,约定报价:o.agreedQuote||null,全部答案:(o.questionSnapshot||[]).map(q=>({题目:q.title,选项:o.answers[q.id]})),付款状态:o.paymentStatus,制作状态:o.productionStatus},null,2)}); },
  home() { wx.switchTab({ url: '/pages/customize/index' }); }
});
