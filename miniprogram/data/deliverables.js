const base=[{key:'persona',label:'人物设定'},{key:'personality',label:'性格与表达方式'},{key:'boundaries',label:'互动规则与边界'},{key:'openings',label:'开场与对话示例'}];
const fine=base.concat([{key:'biography',label:'人物经历与成长时间线'},{key:'relationship',label:'关系发展与互动细节'},{key:'plots',label:'可持续剧情支线'},{key:'guide',label:'导入与使用说明'}]);
module.exports={basic:base,detailed:fine,private:fine,advanced:fine.concat([{key:'worldView',label:'世界观与运行规则'},{key:'worldBackground',label:'世界背景与社会环境'},{key:'worldline',label:'世界线与剧情节点'}])};
