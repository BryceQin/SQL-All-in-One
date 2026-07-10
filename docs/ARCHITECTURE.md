# SQL All-in-One 架构文档

## 项目概述

SQL All-in-One 是一个功能丰富的 VS Code 扩展，提供 SQL 格式化、语法检查、智能补全、数据库连接等功能。

## 目录结构

```
src/
├── commands/           # 命令实现
├── completion/         # 代码补全
├── config/             # 配置定义
├── core/               # 核心基础设施
│   ├── diContainer.ts  # 依赖注入容器
│   ├── configManager.ts # 配置管理
│   └── errorHandler.ts # 错误处理
├── database/           # 数据库功能
│   ├── adapters/       # 数据库适配器
│   ├── commands/       # 数据库命令
│   ├── connection/     # 连接管理
│   └── schema/         # Schema 管理
├── formatter/          # SQL 格式化
├── hover/              # 悬停提示
├── i18n/               # 国际化
├── languages/          # 方言支持
├── lexer/              # 词法分析
├── linter/             # 代码检查
├── navigation/         # 代码导航
├── parser/             # SQL 解析
├── providers/          # VS Code 提供器
├── test/               # 测试
├── utils/              # 工具函数
├── views/              # 视图组件
└── extension.ts        # 扩展入口
```

## 核心模块

### DIContainer (依赖注入容器)

负责管理所有服务的生命周期：

```typescript
const container = getContainer();
container.registerSingleton(Token, factoryFn);
const service = container.get<ServiceType>(Token);
```

### ConfigManager (配置管理)

统一管理 VS Code 配置，提供缓存和变更通知。

### ErrorHandler (错误处理)

统一处理错误，支持多种级别的日志和通知，包括输出通道记录。

## 扩展新功能

### 添加新的 Linter 规则

1. 在 `src/linter/rules/` 创建新规则文件
2. 在 `src/linter/rules/index.ts` 中注册

### 添加新的数据库适配器

1. 在 `src/database/adapters/` 创建适配器类
2. 实现 `IDatabaseAdapter` 接口
3. 在 `DatabaseModule` 中注册

## 测试

```bash
npm run compile     # 编译
npm run lint        # 代码检查
npm test            # 运行测试
npm run test:coverage  # 运行测试并生成覆盖率报告
```

## 单例管理

所有核心服务现在都通过 `DIContainer` 统一管理，包括：

- `ConfigManager`
- `ErrorHandler`
- `ConnectionManager`
- `SchemaProvider`
- `SchemaCache`
- `DocumentAstCache`
- `SqlParserEngine`
- `RuleRegistry`
- `PerformanceMonitor`

每个服务都有对应的 factory 函数和 token 常量，在 `extension.ts` 的 `activate` 函数中统一注册。
