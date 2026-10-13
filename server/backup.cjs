// Run against a stopped instance so database and cover files represent one snapshot.
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
function backup(source,destination){
  const src=path.resolve(source),dest=path.resolve(destination);
  if(dest===src||dest.startsWith(src+path.sep))throw new Error('备份目录必须在数据目录之外');
  if(!fs.existsSync(path.join(src,'persona.sqlite')))throw new Error('未找到数据库，拒绝创建空备份');
  fs.mkdirSync(dest,{recursive:false,mode:0o700});
  const db=new DatabaseSync(path.join(src,'persona.sqlite'));
  try{db.prepare('VACUUM INTO ?').run(path.join(dest,'persona.sqlite'));}finally{db.close();}
  if(fs.existsSync(path.join(src,'media')))fs.cpSync(path.join(src,'media'),path.join(dest,'media'),{recursive:true});
  const check=new DatabaseSync(path.join(dest,'persona.sqlite'),{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('备份完整性验证失败');}finally{check.close();}
  fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),includes:['persona.sqlite','media']},null,2));
  return dest;
}
if(require.main===module){const [source,destination]=process.argv.slice(2);if(!source||!destination||process.env.BACKUP_SERVICE_STOPPED!=='true'){console.error('先停止服务；设置 BACKUP_SERVICE_STOPPED=true，然后运行 npm run backup -- 数据目录 新备份目录');process.exitCode=1;}else{try{backup(source,destination);console.log('备份已创建并通过数据库完整性检查。');}catch(e){console.error(e.message);process.exitCode=1;}}}
module.exports={backup};
