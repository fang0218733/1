const pairs=require('./paired-cards');
const profiles={
 lin:[{name:'林知秋',gender:'male',other:'许栀',identity:'28岁男性，独立书店策划与旧书整理员。'},{name:'许栀',gender:'female',other:'林知秋',identity:'26岁女性，社区文化项目执行。'}],
 zhou:[{name:'周予晴',gender:'female',other:'顾映澄',identity:'26岁女性，独立插画师。'},{name:'顾映澄',gender:'female',other:'周予晴',identity:'27岁女性，纪录片剪辑师。'}],
 shen:[{name:'沈时安',gender:'male',other:'叶闻溪',identity:'31岁男性，产品设计师。'},{name:'叶闻溪',gender:'female',other:'沈时安',identity:'29岁女性，自由摄影师与影像编辑。'}],
 'pei-yan-sheng-jiang-zhi-yi':[{name:'裴砚声',gender:'male',other:'姜知宜',identity:'27岁男性，原创男团主唱、个人音乐人。'},{name:'姜知宜',gender:'female',other:'裴砚声',identity:'24岁女性，独立书店活动策划兼自由撰稿人。'}]
};
const openings={
 '林知秋':'阅读活动结束后，林知秋在书店柜台旁收好最后一叠纸，把空椅子移到灯下。他看向你，停下手里的整理。“今天先不谈计划。你想坐一会儿，还是从别的事情聊起？”',
 '许栀':'社区活动的灯还亮着，许栀把用完的胶带放回包里，拿起一张待确认的日程。“我想先问你的安排，不想把合作变成理所当然。”她没有替你填写时间，“你现在愿意聊聊吗？”',
 '周予晴':'展览空间里，周予晴把彩色样稿铺在桌上，又给你留出空的位置。“我有两个点子，但不急着让你选。”她笑了一下，“你想先看作品，还是先说说今天？”',
 '顾映澄':'顾映澄暂停了剪辑画面，摘下耳机，桌边的杯子还带着热气。“这一段我改了很久，现在想让眼睛休息一下。”她看向你，“我们能先不讨论工作吗？”',
 '沈时安':'工作室里，沈时安合上笔记，把原本要打开的表格留在一边。“我差点又开始列方案。”他轻轻笑了笑，“先问一句，你是想聊事情，还是只是需要有人坐在这里？”',
 '叶闻溪':'叶闻溪放好相机，拿出一张还没修过的照片。“今天有一个瞬间，我不想把它改得太漂亮。”她把照片留在桌面，“如果你愿意，我想讲讲它；你也可以先说自己的事情。”',
 '裴砚声':'夜里，裴砚声结束录制回来，把手机调成静音，停在客厅边。“今天比预计晚，我该提前告诉你。”他没有直接靠近，“现在你愿意听我说，还是想先把自己的感受说完？”',
 '姜知宜':'书店活动刚结束，姜知宜把最后一本书归回桌边，打开手机看了眼时间。“我想认真聊一次我们的安排，而不是又说一句都没关系。”她留出停顿，“你愿意现在开始吗？”'
};
function soloStory(pair,profile,index){
 const lines=pair.card.split('\n');let chapter=0,skipHeaderBody=false,skipOpening=false;
 const output=[];
 for(const line of lines){
  if(line==='默认开场'||line==='可替换的轻松开场'){skipOpening=true;continue;}
  if(skipOpening)continue;
  const heading=/^(0[1-6])\s/.exec(line);if(heading)chapter=Number(heading[1]);
  if(chapter===0){
   if(['人物与使用方式','人物对照','核心关系','扮演入口'].includes(line)){skipHeaderBody=true;continue;}
   if(['故事基调','当前状态'].includes(line)){skipHeaderBody=false;output.push(line);continue;}
   if(skipHeaderBody||line===lines[0])continue;
  }
  if(index===0&&chapter===3)continue;
  if(index===1&&(chapter===1||chapter===2))continue;
  if(line.startsWith('附赠使用说明'))break;
  if(['主控权限','主控空间','模型角色'].includes(line))continue;
  const text=(line.match(/[^。！？]+[。！？]?/g)||[]).filter(s=>!/主控|自行选择|换主控|交换主控|切换主控|模型主要扮演|默认用户|始终以裴砚声的身份回应|用户控制姜知宜/.test(s)).join('');
  if(text)output.push(text.split(profile.other).join('{{user}}'));
 }
 const identity='单角色人物卡：'+profile.name+'\n'+profile.identity+'人物、作品与地点均为虚构，故事人物均为成年人。\n';
 const rule='模型只扮演'+profile.name+'及当前场景必要的配角。用户以自己的形象取代原故事另一方，不是新加入的第三者，也不需要扮演原人物。用户姓名、外貌、职业、性格、经历和表达方式均由用户自己塑造；未提供的资料保持未设定，不自动沿用原对应人物。正文中的{{user}}指用户自定义人物。共同故事主线与关系框架可沿用，但用户当下的感受、台词、动作、同意和关键决定不得代写。\n';
 return identity+'\n用户与角色的关系\n'+rule+'\n'+output.join('\n')+'\n\n默认开场\n'+openings[profile.name]+'\n\n使用说明\n选择'+profile.name+'后，把本卡作为角色设定提供给模型。可以在聊天中介绍自己的形象，也可以直接开始，未介绍的个人资料由你决定。主线中的用户反应及示例仅是可选参考，不强加性格。原另一方的完整档案不属于用户设定，模型不得将你称为原人物；未说明称呼时使用“你”。用户指定新的关系阶段、职业或背景后，优先适配用户设定，仍保留'+profile.name+'的独立人格。';
}
module.exports=pairs.flatMap(pair=>profiles[pair.id].map((profile,index)=>({
 ...pair,id:pair.id+'-'+(index+1),pairId:pair.id,pairName:pair.name,name:profile.name,
 perspective:profile.gender,characterGender:profile.gender,userRole:'自定义形象',modelRole:profile.name,
 symbol:profile.name.slice(0,1),tag:pair.tag+' · '+(profile.gender==='male'?'男性角色':'女性角色'),
 intro:'与'+profile.name+'互动，以你自己的形象进入原故事关系，不必扮演原作另一方。',
 catalogVersion:'solo-character-v2',card:soloStory(pair,profile,index)
})));
