const legacy=require('./legacy-free-text');
function upgrade(old,source){
 if(!old)return {...source,cover:'',published:true};
 if(old.catalogVersion===source.catalogVersion && (source.id!=='pei-yan-sheng-jiang-zhi-yi'||old.relationship==='BG'))return old;
 // Expand stock texts; preserve administrator-authored text. Pei's category is
 // explicitly corrected by the owner, while all other custom metadata remains.
 const replacingFixed=source.catalogVersion==='solo-character-v2'&&old.catalogVersion==='fixed-perspective-v1';
 const stock=replacingFixed||old.card===legacy[source.id] || old.card===source.card;
 const result={...old,catalogVersion:source.catalogVersion};
 if(stock){Object.assign(result,source);result.cover=old.cover||'';result.published=old.published!==false;}
 if(source.id==='pei-yan-sheng-jiang-zhi-yi'){
  result.relationship='BG';
  if(typeof result.card==='string'&&!result.card.includes('附赠使用说明：可自行选择人物')){const guide=source.card.split('附赠使用说明：可自行选择人物')[1];if(guide)result.card+='\n\n附赠使用说明：可自行选择人物'+guide;}
 }
 return result;
}
module.exports=upgrade;
