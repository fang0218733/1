const pairs=require('./paired-cards');
const roles={
 lin:[{name:'林知秋',gender:'male',counterpart:'许栀'},{name:'许栀',gender:'female',counterpart:'林知秋'}],
 zhou:[{name:'周予晴',gender:'female',counterpart:'顾映澄'},{name:'顾映澄',gender:'female',counterpart:'周予晴'}],
 shen:[{name:'沈时安',gender:'male',counterpart:'叶闻溪'},{name:'叶闻溪',gender:'female',counterpart:'沈时安'}],
 'pei-yan-sheng-jiang-zhi-yi':[{name:'裴砚声',gender:'male',counterpart:'姜知宜'},{name:'姜知宜',gender:'female',counterpart:'裴砚声'}]
};
function fixedStory(pair,role){
 const paragraphs=pair.card.split('\n');
 const cleaned=paragraphs.map(p=>{
  if(!p.trim())return p;
  if(p===paragraphs[2])return p.split(/默认用户|用户主控/)[0];
  if(p==='附赠使用说明'||p.startsWith('附赠使用说明：'))return '固定代入使用说明';
  if(p==='主控权限'||p==='主控空间')return p+'\n本入口你扮演'+role.name+'，模型只扮演'+role.counterpart+'及必要配角，不代写你的台词、心理、动作或同意。';
  // Remove only superseded role-selection sentences; retain adjacent plot/continuity rules.
  return (p.match(/[^。！？]+[。！？]?/g)||[]).filter(sentence=>!/主控|自行选择|换主控|交换主控|切换主控|模型主要扮演|模型扮演周予晴|模型扮沈时安|默认用户|始终以裴砚声的身份回应|用户控制姜知宜/.test(sentence)).join('');
 }).filter((p,i,all)=>p!==''||all[i-1]!=='').join('\n');
 const instructions='固定代入：'+role.name+'\n你就是故事中的'+role.name+'，模型扮演'+role.counterpart+'。你与对方沿用原故事的关系和经历，不新增第三位恋爱人物。模型不得代写你的台词、心理、动作、同意或关键选择。请从本卡提供的主线和开场继续，本卡固定人物视角。\n关系方向：'+pair.relationship+'；代入'+(role.gender==='male'?'男主':'女主')+'。\n';
 return instructions+'\n'+cleaned+'\n\n使用说明\n复制本卡后直接进入上述固定人物视角。原对话示例仅作语气参考，所有示例中的人物动作都不能替代你的实际回应。你可以指定关系阶段与场景，但本入口的代入人物固定为'+role.name+'。';
}
module.exports=pairs.flatMap(pair=>roles[pair.id].map((role,i)=>({
 ...pair,id:pair.id+'-'+(i+1),pairId:pair.id,pairName:pair.name,name:role.name,perspective:role.gender,userRole:role.name,modelRole:role.counterpart,
 symbol:role.name.slice(0,1),tag:pair.tag+' · 代入'+(role.gender==='male'?'男主':'女主'),
 intro:'你扮演'+role.name+'，模型扮演'+role.counterpart+'。共同主线：'+pair.name+'。',
 catalogVersion:'fixed-perspective-v1',card:fixedStory(pair,role)
})));
