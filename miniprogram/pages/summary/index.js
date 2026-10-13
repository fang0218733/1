const api = require('../../services/api');
Page({
  data: { backendEnabled: api.backendEnabled, publicationChoice:'',relationship: 'BG', relationships: ['BG','GL','BL'], rows: [], complete: false, busy: false, error: '' },
  onLoad(options) { this.id = options.package; },
  onShow() {
    try { const p = api.getPackage(this.id), draft = api.loadDraft(this.id); this.answers = draft.answers; const rows = api.getQuestions(this.id,this.answers).map((q, index) => ({ id: q.id, index, title: q.title, category: q.category, answer: (this.answers[q.id] || []).join('、') || '尚未选择', missing: !(this.answers[q.id] || []).length })); this.setData({ rows, package: p, complete: api.validAnswers(this.id, this.answers), relationship: draft.relationship || 'BG',requirements: draft.requirements || '', privateOrder:this.id==='private', price: api.quote(this.id, !!draft.privateOrder), publicationChoice:this.id==='private'?'hidden':draft.publicationChoice||'', submitted: !!draft.orderId }); }
    catch (err) { this.setData({ error: '读取失败，请返回首页重试' }); }

  },
  edit(e) { if (this.data.submitted) return; wx.navigateTo({ url: '/pages/questionnaire/index?package=' + this.id + '&index=' + e.currentTarget.dataset.index }); },
  reprice() { this.setData({price:api.quote(this.id)}); },
  relationship(e) { this.saveOptions({relationship:e.currentTarget.dataset.value}); },
  requirements(e) { this.saveOptions({ requirements: e.detail.value }); },
  publication(e) { this.saveOptions({publicationChoice:e.detail.value}); },
  saveOptions(patch) { if (this.data.submitted) return; this.setData(patch); this.reprice(); try { api.saveDraft(this.id, { relationship:this.data.relationship, requirements: this.data.requirements, privateOrder: this.data.privateOrder, publicationChoice:this.data.publicationChoice }); this.setData({ error: '' }); } catch (err) { this.setData({ error: '要求保存失败，请重试' }); } },
  submit() {
    if (!this.data.complete || this.data.busy || this.data.submitted) return;
    if(!['public','hidden'].includes(this.data.publicationChoice)){this.setData({error:'请先选择公开到角色大厅或仅自己可见'});return;}
    wx.showModal({ title: this.data.backendEnabled ? '生成待确认需求单' : '确认提交演示订单', content: '套餐：' + this.data.package.name + '，' + (this.data.publicationChoice==='public'?'同意成品审核后公开到角色大厅':'仅自己可见，不公开') + '，' + (this.data.price===null?'价格待确认':'报价参考 ¥'+this.data.price) + (this.data.backendEnabled ? '。需求单仅用于私聊核对，不代表已付款。报价、交付时间、修改次数及退款条件需双方确认，管理员核实收款后人工制作交付。确认提交？' : '。仅本地演示不支付；公开范围按本次选择执行。确认保存？'), confirmText: '确认提交', success: result => {
      if (!result.confirm) return; this.setData({ busy: true, error: '' });
      Promise.resolve().then(() => api.submitOrder(this.id, this.answers, { relationship:this.data.relationship, requirements: this.data.requirements, privateOrder: this.data.privateOrder, publicationChoice:this.data.publicationChoice })).then(() => { this.setData({ submitted: true }); wx.switchTab({ url: '/pages/orders/index' }); }).catch(err => this.setData({ error: '提交失败：' + err.message })).finally(() => this.setData({ busy: false }));
    } });
  }
});
