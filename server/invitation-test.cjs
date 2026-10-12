const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function invitation(remote,memory) {
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/services/invitation.js'),'utf8'),{module,require:()=>remote,wx:{getStorageSync:key=>memory.get(key),removeStorageSync:key=>memory.delete(key)}});
  return module.exports;
}
test('点击邀请后并发绑定去重，首次下单须等待绑定完成',async()=>{
  const memory=new Map([['persona-inviter','1234567890abcdef']]);let resolve,calls=0;
  const service=invitation({enabled:true,request:()=>{calls++;return new Promise(r=>resolve=r);}},memory);
  const landing=service.ensure(),checkout=service.ensure();assert.equal(landing,checkout);assert.equal(calls,1);assert.ok(memory.has('persona-inviter'));
  resolve({bound:true});await checkout;assert.equal(memory.has('persona-inviter'),false);assert.equal((await service.ensure()).bound,false);
});
test('失败保留邀请码可重试；不会删除请求期间捕获的其他邀请码',async()=>{
  const memory=new Map([['persona-inviter','1234567890abcdef']]);let fail=true,resolve;
  const service=invitation({enabled:true,request:()=>fail?Promise.reject(new Error('断网')):new Promise(r=>resolve=r)},memory);
  await assert.rejects(service.ensure(),/断网/);assert.ok(memory.has('persona-inviter'));fail=false;
  const retry=service.ensure();memory.set('persona-inviter','abcdef1234567890');resolve({bound:true});await retry;assert.equal(memory.get('persona-inviter'),'abcdef1234567890');
});
test('纯本地演示不伪造邀请绑定或登录',async()=>{
  const memory=new Map([['persona-inviter','1234567890abcdef']]);const service=invitation({enabled:false,request:()=>{throw new Error('不应发请求');}},memory);
  assert.equal((await service.ensure()).bound,false);assert.ok(memory.has('persona-inviter'));
});
