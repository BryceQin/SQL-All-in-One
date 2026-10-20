# PRD 024：VSIX 包体积优化

- **状态**：已实施
- **日期**：2026-10-20
- **关联分支**：`perf/vsix-size`
- **基线**：v2.35.0 — VSIX 8.92 MB / 5196 文件（node_modules 解包 19.77 MB）
- **结果**：7.54 MB / 4085 文件（**-15.5%**，node_modules 解包 13.98 MB，**-29.3%**）

## 1. 背景

v2.35.0 发布日志中 vsce 警告扩展包含 5196 个文件（其中 4653 个 JS 文件）。历史优化（v2.29.5、v2.32.1）已剔除大量 dev 依赖与多格式产物，但本次分析发现仍有三类体积来源：`out/` 下散装 tsc 死代码、安装期专用依赖子树、以及多个包的多格式 dist 变体。

## 2. 分析方法（全部结论基于实证探针，非猜测）

1. **依赖闭包分析**（`/tmp/reach.js`）：解析 `vsce ls --tree` 构建入包包图，从 8 个 esbuild external 运行时根 BFS——248 个入包 node_modules 包中 247 个在闭包内，证明**按包一刀切不可行**，必须逐子树甄别。
2. **运行时加载探针**：对每个 external 包执行 `require()` 后枚举 `require.cache`，得到确定性加载集（如 better-sqlite3 仅加载 `lib/**`+`bindings`；odbc 运行时仅走 node-pre-gyp 的 `find()` 路径）。
3. **反向依赖检查**（`/tmp/requirers.js`）：对每个候选剔除包列出依赖方，确认依赖方全部落在安装链或不可达分支。
4. **入口文件审计**（`/tmp/audit.js`）：对解包 VSIX 的每个包解析 package.json `main`，检查入口文件是否在包内——由此发现预置 bug（见 §4）。
5. **打包后端到端验证**：解包 VSIX → 全驱动加载探针 + 高保真 `vscode` stub 驱动真实 bundle 激活（65 命令注册）→ 诊断链（走 bundle 内 node-sql-parser）→ 格式化/转换命令。

## 3. 实施改动

### 3.1 `.vscodeignore`（主体）

| 规则组 | 内容 | 依据 |
|---|---|---|
| 死代码 | `out/**` + `!out/extension.js` | tsc 散装产物从不被 require；bundle 自包含 |
| 安装期子树 | prebuild-install/tar/node-fetch 等 31 个包 | VSIX 内预编译 `.node` 已存在，下载工具链永不执行 |
| 顶层流库 | readable-stream/bl/buffer/string_decoder | 顶层副本属安装链；tedious/ssh2 用嵌套副本（单段 glob 不匹配嵌套，故保留） |
| 构建工具 | nan/buildcheck/commander | ssh2/cpu-features 构建期依赖；mssql CLI 专用 |
| 不可达包 | aws-ssl-profiles/undici-types | 仅 `ssl:"Amazon RDS"` 字面量分支加载；孤儿包 |
| Azure 多格式 | `@azure/*/dist/{esm,browser,react-native}/**` | 13 包 `require.resolve` 全部指向 `dist/commonjs/` |
| @js-joda 精简 | 仅保留 `dist/js-joda.js` | tedious 运行时唯一加载入口；其余为 ESM 重复+source maps |
| 杂物 | 根目录 `test-*.js`、`.oxfmtrc.jsonc`、`.oxlintrc.json` | 非运行时文件 |

### 3.2 node-sql-parser 收编进 bundle（"收敛 dependencies"）

- `esbuild.js` external 列表移除 `node-sql-parser`；`package.json` 将其移至 devDependencies
- 收益：原 2.39 MB 未压缩 webpack bundle（node_modules 散装）→ bundle 内单份 minify 副本，净省 ~1.3 MB
- `SqlParserEngine.getParser()` 的懒加载 `require("node-sql-parser")` 由 esbuild `__commonJS` 包装保留懒执行语义（探针实证：sqlify 往返、DDL 解析、零外部残留引用）
- 覆盖回归风险：367 个解析/转换相关测试全过（CI 全量验证）

### 3.3 预置 bug 修复（本次分析发现）

**入口文件审计发现 5 个历史回归（非本次引入）**：

| 包 | 引入版本 | 症状 |
|---|---|---|
| `@js-joda/core`（整体剔除） | v2.32.1 | SQL Server 连接即崩（tedious DATETIME2 解析顶层 require） |
| `debug`、`js-md4`、`sprintf-js`、`ecdsa-sig-formatter`（`src/**` 误伤主入口） | v2.26.1 | 同上——四包均在 mssql→tedious→@azure 链上，打包版 SQL Server 连接崩溃 |

根因：v2.26.1 的 `node_modules/**/src/**` 规则假设 src/ 只含构建源码，但部分纯 JS 包的 `main` 指向 `src/` 且无 exports 兜底；开发/CI 从源码跑测试，打包链路缺陷从未暴露。修复：文件末尾 `!node_modules/{debug,js-md4,sprintf-js,ecdsa-sig-formatter}/src/**` 再包含（后置规则胜出）+ `@js-joda` 仅剔除非 CJS 变体。

**另发现并撤销一处误删**：嵌套 `@azure/identity@3.4.2`（mssql 下）为单文件 bundle，其 `dist/index.js:21` 顶层 `require('open')`（顶层 4.x 才是懒加载）——剔除 `open` 会导致 tedious 加载崩溃，规则已撤销并留注释警示。

## 4. 验证记录

| 检查项 | 结果 |
|---|---|
| 解包 VSIX 全驱动加载探针（tedious/mssql/mysql2/pg/oracledb/ssh2/async/better-sqlite3/odbc） | ✅ 全过（better-sqlite3 执行真实查询返回 42） |
| `@js-joda` 功能探针（`LocalDateTime.parse`） | ✅ |
| 入口文件审计（203 包 main 解析） | ✅ 0 真实缺失（8 个无扩展名 main 为审计脚本误报，`.js` 补全后存在；3 个 exports-map 包按子路径引用） |
| bundle 激活（高保真 stub） | ✅ 65 命令注册 |
| 诊断链（linter→bundle 内 node-sql-parser） | ✅ 产出 `SELECT *` 规则诊断 |
| 格式化 + 转换命令 | ✅ |
| node-sql-parser 收编机制复现（独立 esbuild 打包 + sqlify 往返 + DDL） | ✅ 零外部引用残留 |
| 解析/转换测试子集（novscode shim） | ✅ |

**已知验证局限**：本地 Electron 宿主被 SIGKILL（环境资源限制），VSCode 宿主内端到端测试依赖 CI 全量套件执行；odbc 的 `.node` 二进制本机无 unixODBC 无法 dlopen（用户机器装驱动管理器后正常，绑定路径已验证正确）。

## 5. 未采纳方案

| 方案 | 否决原因 |
|---|---|
| esbuild 收编 mssql/tedious/@azure 链 | 动态 require 面广（keyvault 按需加载等），本地无 SQL Server 实例可回归验证，风险收益比不划算 |
| 剔除 `es-abstract` 年份目录 | `index.js` 急切加载 es5→es2025 全部年份目录（探针实证），剔除即崩 |
| 剔除 `open` 链 | 嵌套 azure-identity@3.4.2 顶层 require（见 §3.3） |
| 全局 `!node_modules/**/*.node` 再包含 | 会重新带入 dev 二进制（@oxlint、oracledb thick-mode 等），维持逐文件白名单 |

## 6. 后续可选项

- media/monaco 4.2 MB 为 webview 编辑器运行时必需，不动。
- `@typespec/ts-http-runtime` 4.8 MB（commonjs 1.2 MB）随 azure 链保 exterior；若未来 mssql 升级至 identity 4.x（懒加载 open），可再评估剔除 `open` 链与 azure-identity 收编。
