const runtime = require('../data/runtime');
let loginPromise;
function send(path, method, data, token) {
  return new Promise((resolve,reject) => wx.request({ url:runtime.apiBase+path,method,data,header:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},success:res=>{ if(res.statusCode>=200&&res.statusCode<300)resolve(res.data);else { const e=new Error(res.data.error||'服务请求失败');e.status=res.statusCode;reject(e); } },fail:()=>reject(new Error('网络连接失败，请稍后重试')) }));
}
function login() {
  if(!loginPromise)loginPromise=new Promise((resolve,reject)=>wx.login({success:res=>res.code?resolve(res.code):reject(new Error('微信登录失败')),fail:()=>reject(new Error('微信登录失败'))})).then(code=>send('/api/login','POST',{code})).then(result=>{wx.setStorageSync('persona-session',result.token);return result.token;}).finally(()=>{loginPromise=null;});
  return loginPromise;
}
async function request(path,method='GET',data={},auth=false) {
  let token=wx.getStorageSync('persona-session');if(auth&&!token)token=await login();
  try{return await send(path,method,data,token);}catch(e){if(e.status!==401)throw e;token=await login();return send(path,method,data,token);}
}
async function downloadBundle(id){
 let token=wx.getStorageSync('persona-session')||await login();
 function download(){return new Promise((resolve,reject)=>wx.downloadFile({url:runtime.apiBase+'/api/orders/'+id+'/bundle',header:{Authorization:'Bearer '+token},success:r=>{if(r.statusCode===200)resolve(r.tempFilePath);else{const e=new Error(r.statusCode===401?'登录过期':'文件包未交付或暂不可下载');e.status=r.statusCode;reject(e);}},fail:()=>reject(new Error('文件下载失败，请稍后重试'))}));}
 try{return await download();}catch(e){if(e.status!==401)throw e;token=await login();return download();}
}
module.exports={downloadBundle,request,enabled:!!runtime.apiBase,base:runtime.apiBase};
