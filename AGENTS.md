# 项目开发说明

本项目是原生微信小程序，使用 JavaScript、WXML、WXSS，不是网页。

- 源码位于 miniprogram/，从仓库根目录导入微信开发者工具。
- 使用中文界面和中文说明。业务需求未确定，不自行添加支付、登录或云服务。
- 保持原生目录结构，不无故引入框架或依赖。
- 新页面必须在 app.json 中注册，并包含 js/json/wxml/wxss。
- 修改后运行 npm run check。该检查不能替代微信开发者工具编译与真机验证，交付时明确验证范围。
- 不提交 AppSecret、密码、令牌或 project.private.config.json。
- 新增需要授权的接口、服务器或云开发时，先明确配置需求，不使用虚构凭证。
