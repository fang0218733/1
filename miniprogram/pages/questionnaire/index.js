const api = require('../../services/api');
Page({
  data: { index: 0, total: 0, answered: 0, progress: 0, question: {}, choices: [], selected: false, error: '' },
  onLoad(options) {
    try { this.id = options.package; this.questions = api.getQuestions(this.id); const draft = api.loadDraft(this.id); if (draft.orderId) { wx.switchTab({ url: '/pages/orders/index' }); return; } this.answers = draft.answers; this.setData({ index: Math.max(0, Math.min(Number(options.index === undefined ? draft.index : options.index) || 0, this.questions.length - 1)), total: this.questions.length }); this.render(); }
    catch (err) { this.setData({ error: '无法载入题库或本地答案，请返回套餐首页重试' }); }
  },
  render() {
    const q = this.questions[this.data.index], values = this.answers[q.id] || [];
    const answered = this.questions.filter(q => (this.answers[q.id] || []).length > 0).length;
    this.setData({ question: q, choices: q.options.map(value => ({ value, checked: values.includes(value) })), selected: values.length > 0, answered, progress: Math.round(answered / this.questions.length * 100) });
  },
  persist() { try { api.saveDraft(this.id, { answers: this.answers, index: this.data.index }); this.setData({ error: '' }); return true; } catch (err) { this.setData({ error: '保存失败，请检查设备存储后重试。当前答案尚未可靠保存。' }); return false; } },
  choose(e) {
    const q = this.data.question, value = e.currentTarget.dataset.value;
    let values = (this.answers[q.id] || []).slice();
    if (!q.multiple || value === '由设计师决定') values = values.includes(value) ? [] : [value];
    else { values = values.filter(v => v !== '由设计师决定'); values = values.includes(value) ? values.filter(v => v !== value) : values.concat(value); }
    this.answers[q.id] = values; this.render(); this.persist();
  },
  prev() { if (this.data.index > 0) { this.setData({ index: this.data.index - 1 }); this.render(); this.persist(); } },
  next() { if (!this.data.selected || !this.persist()) return; if (this.data.index < this.data.total - 1) { this.setData({ index: this.data.index + 1 }); this.render(); this.persist(); } else this.summary(); },
  skip() { this.answers[this.data.question.id] = ['由设计师决定']; this.render(); this.next(); },
  skipRest() { wx.showModal({ title: '剩余题目交给设计师？', content: '保留已选答案，所有未答题按“由设计师决定”处理。提交前仍可修改。', success: res => { if (!res.confirm) return; this.questions.forEach(q => { if (!(this.answers[q.id] || []).length) this.answers[q.id] = ['由设计师决定']; }); this.render(); this.summary(); } }); },
  summary() { if (this.persist()) wx.navigateTo({ url: '/pages/summary/index?package=' + this.id }); }
});
