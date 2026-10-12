module.exports = {
  privateMultiplier: 1.5, currency: '¥',
  relationships: ['BG', 'GL', 'BL'],
  referral: { enabled: false, target: 3, rewardPackage: 'basic', rewardMode: 'refund', oncePerUser: false, ruleVersion: 'invite-three-v1' },
  memberships: [
    { id: 'monthly', name: '月卡', price: 58.8, months: 1, allowance: 5, packages: ['basic', 'detailed'] },
    { id: 'yearly', name: '年卡', price: 228.8, months: 12, allowance: 8, packages: ['basic', 'detailed', 'ultra'] }
  ],
  packages: [
    { id: 'basic', name: '50题完整版', count: 50, price: 12.8, description: '从基础轮廓到相处边界，构建完整陪聊人设', deliverables: ['人物卡'] },
    { id: 'detailed', name: '100题精细版', count: 100, price: 18.8, description: '深入矛盾、情境反应与关系变化，描绘细腻人物', deliverables: ['精细人物卡'] },
    { id: 'ultra', name: '超详细定制', count: 150, price: 68.8, description: '150题涵盖人物生平与世界设定，可跳题；四份相互呼应的完整交付', deliverables: ['人物卡', '人物生平', '世界观', '世界背景'] }
  ]
};
