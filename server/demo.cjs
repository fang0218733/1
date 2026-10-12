// Cross-platform demo entry; never enables payments or real AI calls.
process.env.DEMO_MODE='true';
process.env.HOST='127.0.0.1';
process.env.AUTO_GENERATE='true';
const path=require('node:path'),fs=require('node:fs');
const Store=require('./store.cjs');
const {createApp}=require('./index.cjs');
const data=process.env.DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(data,{recursive:true});
process.env.MEDIA_DIR=process.env.MEDIA_DIR||path.join(data,'media');
const store=new Store(path.join(data,'persona.sqlite'));
const {server}=createApp({store});server.listen(Number(process.env.PORT)||8080,'127.0.0.1',()=>console.log('仅本机演示后台已启动；无真实支付、微信身份或DeepSeek调用。'));
