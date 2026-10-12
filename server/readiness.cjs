const path=require('node:path');
function readiness(env=process.env) {
  const checks=[
    {name:'Node.js 24或更新版本',ok:Number(process.versions.node.split('.')[0])>=24},
    {name:'关闭本机演示模式',ok:env.DEMO_MODE==='false'},
    {name:'正式HTTPS服务域名',ok:/^https:\/\/[^/?#]+$/.test(env.PUBLIC_ORIGIN||'')},
    {name:'管理员密码至少16位',ok:typeof env.ADMIN_PASSWORD==='string'&&env.ADMIN_PASSWORD.length>=16},
    {name:'微信AppID',ok:!!env.WECHAT_APP_ID&&env.WECHAT_APP_ID!=='touristappid'},
    {name:'微信AppSecret',ok:!!env.WECHAT_APP_SECRET},
    {name:'指定持久数据目录',ok:!!env.DATA_DIR&&path.isAbsolute(env.DATA_DIR)},
    {name:'DeepSeek密钥（不配置可手动制作）',ok:!!env.DEEPSEEK_API_KEY,optional:true}
  ];
  return {configured:checks.filter(c=>!c.optional).every(c=>c.ok),checks,paymentEnabled:false,remoteValidationPerformed:false};
}
if(require.main===module){const result=readiness();console.log(JSON.stringify(result,null,2));if(!result.configured)process.exitCode=1;}
module.exports={readiness};
