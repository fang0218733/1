Page({
  data: { greeting: '你好，欢迎来到我的小程序', count: 0 },
  onTap() {
    this.setData({ count: this.data.count + 1 });
  }
});
