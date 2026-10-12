const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Store=require('./store.cjs'),{backup}=require('./backup.cjs');
const {readiness}=require('./readiness.cjs');
test('停止服务后备份数据库和封面，可恢复原始订单并拒绝覆盖已有备份',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'persona-backup-')),source=path.join(root,'source'),dest=path.join(root,'snapshot');
  fs.mkdirSync(source);fs.mkdirSync(path.join(source,'media'));fs.writeFileSync(path.join(source,'media','test.png'),'synthetic-test-cover');
  const original=new Store(path.join(source,'persona.sqlite'));original.put('orders','example',{id:'example',card:'已审核的虚构角色',status:'已完成'});original.close();
  try {
    backup(source,dest);const recovered=new Store(path.join(dest,'persona.sqlite'));assert.equal(recovered.get('orders','example').card,'已审核的虚构角色');recovered.close();
    assert.equal(fs.readFileSync(path.join(dest,'media','test.png'),'utf8'),'synthetic-test-cover');assert.equal(JSON.parse(fs.readFileSync(path.join(dest,'manifest.json'))).version,1);
    assert.throws(()=>backup(source,dest));assert.throws(()=>backup(source,path.join(source,'nested')),/之外/);
    const absent=path.join(root,'empty');fs.mkdirSync(absent);assert.throws(()=>backup(absent,path.join(root,'empty-backup')),/空备份/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('配置检查不输出凭据，不将未配置状态或本机演示称为已上线',()=>{
  const missing=readiness({});assert.equal(missing.configured,false);assert.equal(missing.remoteValidationPerformed,false);
  const env={DEMO_MODE:'false',PUBLIC_ORIGIN:'https://example.test',ADMIN_PASSWORD:'synthetic-test-password-only',WECHAT_APP_ID:'test-app-id',WECHAT_APP_SECRET:'synthetic-app-secret',DATA_DIR:'/tmp/data'};
  const configured=readiness(env);assert.equal(configured.configured,true);assert.equal(configured.paymentEnabled,false);assert.ok(!JSON.stringify(configured).includes(env.ADMIN_PASSWORD));assert.ok(!JSON.stringify(configured).includes(env.WECHAT_APP_SECRET));
  assert.equal(readiness({...env,DEMO_MODE:'true'}).configured,false);
});
