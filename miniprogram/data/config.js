module.exports = {
  currency: '¥', questionVersion: 'persona-choice-2026-10-v1', advancedVersion:'advanced-branch-150-v1', relationships: ['BG','GL','BL'],
  memberships: [], referral: {enabled:false},
  packages: [
    {id:'basic',name:'50题定制',count:50,price:12.8,description:'全选择题，完成后私聊确认报价与交付安排',deliverables:['人物设定','性格表达','互动边界','开场示例']},
    {id:'detailed',name:'100题定制',count:100,price:18.8,description:'深入描绘性格与相处方式，人工制作交付',deliverables:['完整人物档案','成长经历','关系发展','剧情支线','使用说明']},
    {id:'private',name:'私人定制',count:100,price:null,description:'使用100题精细问卷，成品仅本人可领取，不公开',deliverables:['精细整合包（不公开）']},
    {id:'advanced',name:'150题世界线高级定制',count:150,price:48.8,description:'前题选择驱动后续细化，50个主题各3层；完整人物、经历和世界线整合包',deliverables:['精细包全部内容','世界观','世界背景','世界线']}
  ]
};
