# 贡献指南

## 开发环境设置

1. 克隆仓库
2. 安装依赖: `npm install`
3. 编译: `npm run compile`
4. 在 VS Code 中按 F5 调试

## 代码规范

- 遵循 TypeScript 严格模式
- 使用 ESLint 检查代码
- 提交前运行 `npm run lint`

## 提交规范

使用语义化提交信息：

- `feat: 新功能`
- `fix: 修复`
- `refactor: 重构`
- `test: 测试`
- `docs: 文档`
- `style: 格式`
- `perf: 性能优化`
- `ci: CI 相关`

## Pull Request 流程

1. Fork 仓库
2. 创建功能分支
3. 提交变更
4. 推送到分支
5. 创建 Pull Request

## 使用 DI 容器

添加新的单例服务时：

1. 在 `src/core/diContainer.ts` 中添加对应的 Token
2. 创建服务类和 `createXxx` 工厂函数
3. 在 `extension.ts` 中的 `registerServicesToContainer` 函数中注册
4. 通过 `getContainer().get<ServiceType>(Token)` 或使用 `getXxx()` 函数获取

## 测试

- 运行测试: `npm test`
- 运行测试并生成覆盖率: `npm run test:coverage`
- 确保所有测试通过后再提交 PR
