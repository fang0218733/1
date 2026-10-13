const themes=require('./advanced-themes');
const DESIGNER='由设计师决定';
function build(answers={}) {
 return themes.flatMap(t=>{
  const rootId=t.id+'-root',followId=t.id+'-follow',deepId=t.id+'-deep';
  const selected=(answers[rootId]||[])[0],index=t.options.indexOf(selected);
  const menus=index>=0?t.cases[index]:t.cases.reduce((a,b)=>a.concat(b),[]).filter((v,i,a)=>a.indexOf(v)===i);
  const detail=(answers[followId]||[])[0];
  return [
   {id:rootId,category:t.category,title:t.title,options:t.options.concat(DESIGNER),multiple:false},
   {id:followId,parent:rootId,category:t.category,title:(index>=0?'围绕「'+selected+'」：':'方向交由设计师：')+t.follow,options:menus.concat(DESIGNER),multiple:false},
   {id:deepId,parent:followId,category:t.category,title:(detail&&detail!==DESIGNER?'细化「'+detail+'」：':'继续细化：')+t.deep,options:t.deepOptions.concat(DESIGNER),multiple:false}
  ];
 });
}
function clearDescendants(answers,id){const prefix=id.split('-')[0];if(id.endsWith('-root')){delete answers[prefix+'-follow'];delete answers[prefix+'-deep'];}else if(id.endsWith('-follow'))delete answers[prefix+'-deep'];}
module.exports={build,clearDescendants};
