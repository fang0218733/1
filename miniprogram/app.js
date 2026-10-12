App({
  globalData: {},
  onLaunch(options) { this.captureReferral(options); },
  onShow(options) { this.captureReferral(options); },
  captureReferral(options) { const code=options&&options.query&&options.query.referral;if(code&&/^[a-f0-9]{16}$/.test(code))wx.setStorageSync('persona-inviter',code); }
});
