# 微信小程序

原生微信小程序基础项目，使用 JavaScript、WXML、WXSS，无第三方依赖。

## 本地预览

1. 下载仓库，或使用 Git 克隆。
2. 在微信开发者工具中导入仓库根目录，类型选择小程序。
3. 将 project.config.json 的 appid 替换为自己的小程序 AppID；当前 touristappid 仅用于游客体验，若工具不支持请选择工具提供的测试号或填入正式 AppID。
4. 编译打开首页，点击按钮查看交互。

## 代码检查

安装 Node.js 22 后运行：

```sh
npm run check
```

检查验证 JavaScript 语法、JSON 格式和页面文件完整性。微信模拟器编译及真机预览仍需要微信开发者工具。

## Codex 配置

在 Codex 的云环境创建页选择 fang0218733/1，按页面提示完成仓库授权。环境使用 Node.js 22 或更新的受支持 LTS 版本。无需 npm install，检查命令为 npm run check。完成环境测试并发布后开始任务。

AGENTS.md 提供项目开发说明。小程序业务需求尚未确定，目前仅包含基础首页。

## 文件位置

- miniprogram/：小程序源代码
- project.config.json：开发者工具配置
- scripts/check.cjs：基础检查
- .github/workflows/check.yml：自动检查

不要将 AppSecret、令牌、密码写入仓库。私有开发者工具配置和本地环境变量已加入忽略规则。
