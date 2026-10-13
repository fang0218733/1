const remote = require('./remote');
let pending;
function ensure() {
  const code=wx.getStorageSync('persona-inviter');
  if(!code || !remote.enabled)return Promise.resolve({bound:false});
  if(pending && pending.code===code)return pending.promise;
  const promise=remote.request('/api/referrals/bind','POST',{code},true).then(result=>{
    // Do not erase a different invitation captured while this request was in flight.
    if(wx.getStorageSync('persona-inviter')===code)wx.removeStorageSync('persona-inviter');
    return result;
  }).finally(()=>{if(pending&&pending.promise===promise)pending=null;});
  pending={code,promise};return promise;
}
module.exports={ensure};
