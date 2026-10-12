const api = require('../../services/api');
Page({
  data: { rows: [], complete: false, busy: false, error: '' },
  onLoad(options) { this.id = options.package; },
  onShow() {
    try { const p = api.getPackage(this.id), draft = api.loadDraft(this.id); this.answers = draft.answers; const rows = api.getQuestions(this.id).map((q, index) => ({ id: q.id, index, title: q.title, category: q.category, answer: (this.answers[q.id] || []).join('、') || '尚未选择', missing: !(this.answers[q.id] || []).length })); this.setData({ rows, package: p, complete: api.validAnswers(this.id, this.answers), submitted: !!draft.orderId }); }
    catch (err) { this.setData({ error: '读取失败，请返回首页重试' }); }
  },
  edit(e) { if (this.data.submitted) return; wx.navigateTo({ url: '/pages/questionnaire/index?package=' + this.id + '&index=' + e.currentTarget.dataset.index }); },
  submit() {
    if (!this.data.complete || this.data.busy || this.data.submitted) return;
    wx.showModal({ title: '确认提交演示订单', content: '套餐：' + this.data.package.name + '。仅本地模拟，不支付、不发送至服务器、不进入真实制作。确认保存本次答案？', confirmText: '确认提交', success: result => {
      if (!result.confirm) return; this.setData({ busy: true, error: '' });
      Promise.resolve().then(() => api.submitOrder(this.id, this.answers)).then(() => { this.setData({ submitted: true }); wx.redirectTo({ url: '/pages/orders/index' }); }).catch(err => this.setData({ error: '提交失败：' + err.message })).finally(() => this.setData({ busy: false }));
    } });
  }
});
