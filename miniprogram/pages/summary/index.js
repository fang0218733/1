const api = require('../../services/api');
Page({
  data: { backendEnabled: api.backendEnabled, publicAcknowledged: false, rows: [], complete: false, busy: false, error: '' },
  onLoad(options) { this.id = options.package; },
  onShow() {
    try { const p = api.getPackage(this.id), draft = api.loadDraft(this.id); this.answers = draft.answers; const rows = api.getQuestions(this.id).map((q, index) => ({ id: q.id, index, title: q.title, category: q.category, answer: (this.answers[q.id] || []).join('、') || '尚未选择', missing: !(this.answers[q.id] || []).length })); this.setData({ rows, package: p, complete: api.validAnswers(this.id, this.answers), requirements: draft.requirements || '', privateOrder: !!draft.privateOrder, price: api.quote(this.id, !!draft.privateOrder), publicAcknowledged: !!draft.publicAcknowledged, submitted: !!draft.orderId }); }
    catch (err) { this.setData({ error: '读取失败，请返回首页重试' }); }
  },
  edit(e) { if (this.data.submitted) return; wx.navigateTo({ url: '/pages/questionnaire/index?package=' + this.id + '&index=' + e.currentTarget.dataset.index }); },
  requirements(e) { this.saveOptions({ requirements: e.detail.value }); },
  acknowledge(e) { this.saveOptions({ publicAcknowledged: e.detail.value.length > 0 }); },
  privacy(e) { this.saveOptions({ privateOrder: e.detail.value }); },
  saveOptions(patch) { if (this.data.submitted) return; this.setData(patch); this.setData({ price: api.quote(this.id, this.data.privateOrder) }); try { api.saveDraft(this.id, { requirements: this.data.requirements, privateOrder: this.data.privateOrder, publicAcknowledged: this.data.publicAcknowledged }); this.setData({ error: '' }); } catch (err) { this.setData({ error: '要求保存失败，请重试' }); } },
  submit() {
    if (!this.data.complete || this.data.busy || this.data.submitted) return;
    if (!this.data.privateOrder && !this.data.publicAcknowledged) { this.setData({ error: '请先确认普通定制成品默认公开说明，或选择私人定制' }); return; }
    wx.showModal({ title: this.data.backendEnabled ? '确认提交定制申请' : '确认提交演示订单', content: '套餐：' + this.data.package.name + '，' + (this.data.privateOrder ? '私人定制不公开' : '普通定制') + '，参考价 ¥' + this.data.price + (this.data.backendEnabled ? '。暂不收费；问卷及具体要求将保存至服务端，并用于DeepSeek生成草稿，由管理员审核交付。普通成品审核后默认公开，私人不公开。确认提交？' : '。仅本地演示不支付；普通成品默认公开，私人不公开。确认保存？'), confirmText: '确认提交', success: result => {
      if (!result.confirm) return; this.setData({ busy: true, error: '' });
      Promise.resolve().then(() => api.submitOrder(this.id, this.answers, { requirements: this.data.requirements, privateOrder: this.data.privateOrder, publicAcknowledged: this.data.publicAcknowledged })).then(() => { this.setData({ submitted: true }); wx.switchTab({ url: '/pages/orders/index' }); }).catch(err => this.setData({ error: '提交失败：' + err.message })).finally(() => this.setData({ busy: false }));
    } });
  }
});
