# Changelog

## [2.0.0] - 2026-06-01

### Security

- **SAVEPOINT SQL 注入防护** — 对 SAVEPOINT 名称进行白名单验证，仅允许字母数字下划线 (#2)
- **SSH 密钥路径白名单** — 验证私钥路径必须位于用户主目录、`.ssh` 目录或 `/etc/ssh` 下，防止路径遍历攻击 (#32)
- **BLOB 预览 XSS 修复** — 对 mimeType 进行白名单验证，使用 DOM API 替代 innerHTML 拼接 (#7)
- **CSP 策略添加** — 所有 5 个 Webview HTML 文件添加 Content-Security-Policy meta 标签 (#5)
- **导出连接密码泄露修复** — `includePasswords = false` 时同时清除 SSH 密码和 passphrase，导出文件设置 0600 权限 (#3)
- **SQL 高亮正则替换风险修复** — designerPanel.js 中 SQL 高亮改为基于 token 的方式，消除正则替换破坏 HTML 实体的风险 (#22)
- **导入数据运行时校验** — ConnectionStore.importConnections 添加 validateImportData 方法，防止恶意或损坏文件导致运行时异常 (#20)
- **Webview inline onclick 迁移** — 所有 5 个 HTML 文件中的 inline onclick/onchange/oninput 替换为 addEventListener 绑定 (#27)
- **i18n 全局变量注入替换** — 配置编辑器中 `window.__I18N__` 全局变量替换为 WebView 消息机制 (#29)

### Architecture

- **AST 缓存 TOCTOU 竞态修复** — getOrBuildSymbolIndex 原子性写入 symbolIndex，处理 LRU 淘汰和版本不匹配情况 (#11)
- **DI 容器单例竞态修复** — 添加 creating 中间状态标记，防止工厂函数被并发调用 (#10)
- **ConnectionManager 资源泄漏修复** — dispose() 正确清理 retryTimers、healthCheckTimers、idleCheckTimers 和事件发射器 (#6)
- **disconnectAll 并行断开** — 使用 Promise.allSettled() 并行断开连接，避免单个连接挂起阻塞后续 (#9)
- **SSH 隧道双重超时冲突修复** — 统一超时机制，确保应用级超时清理 SSH 客户端 (#16)
- **SSH 隧道 close() 关闭活跃 socket** — 追踪并销毁所有活跃 socket 转发连接 (#17)

### i18n

- **格式化器错误消息 i18n** — sqlFormatter.ts 中两处中文硬编码错误消息替换为 i18n 函数调用 (#19)

### Bug Fixes

- **config-editor.js 语法错误** — 7 个预设配置对象中 lintExpiredTodoSeverity 后缺少逗号，导致配置编辑器完全不可用 (#1)
- **testConnection SSH 密码逻辑错误** — 数据库密码被错误赋给 SSH 配置的 password 字段 (#8)
- **transferDialog.js Node.js API** — Webview 中使用 require('fs') 改为消息机制请求文件内容 (#4)
- **formatUnknown 回退输出优化** — 移除 JSON.stringify 输出，只保留类型注释 (#31)

### Configuration

- **Lint 规则配置格式统一** — 将分散的阈值/子选项配置整合到规则对象中，删除 7 个独立配置键 (#28)

### Verification

- **formatUse 已验证** — 已确认使用 quoteIdentifier 包裹数据库名，无需修改 (#30)

---

## [1.11.0] - 2026-05-25

### Architecture

- DI 容器增强、核心服务集成
- RuleRegistry 重构简化（规则注册代码从 44 行重复代码缩减至 8 行）
- DocumentAstCache LRU 验证

---

## [1.10.0] - 2026-05-18

### Architecture

- AstLinter 规则体系模块化：策略模式 + 规则注册机制
- 14 个独立规则类实现统一 LintRule 接口
- AstLinter 从 877 行缩减至 64 行
- 支持独立测试和开闭原则扩展

---

## [1.8.0] - 2026-05-04

### Features

- 国际化全面改造（设置界面跟随 VS Code 语言切换）
- README/CHANGELOG 双语化
- 配置编辑器多语言
- 统一方言注册中心

### Bug Fixes

- 修复内存泄漏
- 架构优化

---

## [1.7.0] - 2026-04-20

### Features

- Go to Definition（CTE/表别名/列别名）
- Find All References
- Rename Symbol（含保留字/冲突校验）
- Breadcrumb 子句级导航
- AstNavigator 共享导航引擎
