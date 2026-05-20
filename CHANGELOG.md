# 更新日志

## 0.18.4
- 修复扩展无法激活：engines.vscode 版本要求过高（^1.108.1），降为 ^1.85.0
- activate 函数添加 try-catch 容错保护，单个 Provider 创建失败不影响其他功能
- header 补全恢复双轨策略：基础版由 VS Code 内置 snippet 提供，增强版（header+）由动态补全提供
- 修复可视化配置保存后作者设置丢失
- 修复可视化配置保存提示不准确

## 0.18.3
- 修复键入 header 无法触发注释补全：静态 snippet label 改用英文前缀，确保模糊匹配生效
- 移除 sql.json 中的 Comment Header 静态 snippet，由动态补全统一提供 header 项
- header 补全始终可用：有作者配置时自动填充作者/修改人/表依赖，无作者时提供基础模板
- 修复可视化配置保存后作者设置丢失：_updateConfig 添加 try-catch 保护，避免单项失败阻塞后续保存
- 修复 headerAuthor/headerModifier 空值处理：空值传 undefined 而非空字符串，避免 VS Code 误删配置
- 修复可视化配置保存提示不准确：改为等待实际保存完成后才显示成功/失败提示

## 0.18.2
- 修复 header/col/tbl 补全项缺少 range 属性导致无法匹配用户输入
- 添加 try-catch 保护，避免 extractTableDependencies 异常导致补全项全部消失

## 0.18.1
- 修复 header/col/tbl 补全不生效：改用 SnippetString 构造函数避免占位符被转义
- 修复补全项 label 包含中文导致模糊匹配失败，中文描述移至 detail/documentation
- 可视化配置编辑器新增「注释设置」组（作者、修改人、注释模板补全开关）

## 0.18.0
- 新增智能注释切换：Ctrl+/ 单行/多行自动切换，Ctrl+Shift+/ 高级模式（DDL 列注释、格式化禁用标记）
- 新增注释模板补全：静态 Snippet（todo/fixme/hack/desc/section）+ 动态补全（header/col/tbl）
- header 补全自动检测表依赖（FROM/JOIN 为输入表，INSERT INTO/CTAS 为输出表）
- 新增 4 条注释 Lint 规则：复杂查询缺注释、DDL 列缺 COMMENT、注释掉的代码、过期 TODO/FIXME
- 每条 Lint 规则均提供 Quick Fix 一键修复
- Code Action 改用 diagnostic.code 匹配，更健壮
- 新增状态栏临时消息反馈（添加/移除注释等操作后显示）
- 右键菜单集成注释切换命令
- 版本号升级到 0.18.0

## 0.17.0
- 优化配置区布局，由 CSS Grid 改为 Multi-column 多列流式布局，消除配置组之间的大片空白
- 配置组高度自适应，矮组不再被撑高，整体布局更紧凑
- 添加 break-inside: avoid 防止配置组跨列断裂
- 版本号升级到 0.17.0

## 0.16.0
- 优化可视化配置编辑器布局，由左右结构改为上下结构
- 预览区移至顶部，内部改为左右分栏（输入 SQL | 格式化结果），空间利用更高效
- 配置区移至底部，9 个配置组改为多列网格布局，宽屏自动排 2-3 列
- 新增可拖拽分割线，自由调整预览区高度（160px ~ 600px）
- 整体视觉优化：更紧凑的间距、更柔和的边框、更精致的圆角
- 容器最大宽度从 1260px 扩展到 1400px，更好利用宽屏空间
- 版本号升级到 0.16.0

## 0.15.0
- 新增智能补全功能（IntelliSense / Auto-completion），大幅降低 SQL 编写心智负担
- 支持关键字补全，输入 SEL 自动提示 SELECT，覆盖 Hive/MySQL/Spark/通用 SQL 四种方言
- 支持函数补全（带签名、参数占位符、返回值类型和中文说明），合计 470+ 内置函数签名
- 支持代码片段触发补全，在补全列表中展示已有的 17 个 SQL 代码片段
- 支持 CTE 名称补全，定义 WITH 子句后自动提示 CTE 名称
- 支持表名/列名上下文补全，根据当前 SQL 子句位置智能提示
- 新增可配置的补全开关（enableCompletion、completion.keywords、completion.functions、completion.snippets、completion.cteNames、completion.identifiers）
- 更新 package.json，添加补全相关配置项
- 版本号升级到 0.15.0

## 0.14.0
- 全面美化可视化配置编辑器 UI，采用现代化卡片设计
- 新增可折叠配置分组，用箭头动画展开/收拢，减少视觉噪音
- 默认 checkbox 替换为 iOS 风格 Toggle Switch 开关，带流畅过渡动画
- 优化 Lint 规则布局，规则名称 + 严重级别下拉 + 开关一览无余
- 新增徽章计数器显示各组配置项数量
- 新增保存成功 Toast 通知（2 秒自动消失）
- 新增预览格式化结果绿色边框闪烁反馈
- 新增输入框焦点蓝色辉光效果
- 预设按钮改为圆角药丸芯片样式（pill chips）
- 优化双栏布局，配置区更宽，预览区右侧 sticky 固定
- 自定义暗色滚动条样式
- 版本号升级到 0.14.0

## 0.13.0
- 修复 sqlDialects.ts 中语言 ID 不匹配问题（hql → hive），修复 .hql 文件格式化和诊断功能失效
- 修复 package.json 中 enableEnhancedChecks 配置项重复定义
- 修复 SqlParameterHightlighter 中 isSqlDocument 判断不一致问题，统一使用 sqlDialects
- 修复 configEditor.test.ts 测试代码中的断言引用错误和常量缺失问题
- 优化测试用例，全部核心功能测试通过
- 版本号升级到 0.13.0

## 0.12.0
- 新增丰富的格式化配置项，提升用户定制化体验
- 新增 commaPosition 配置，支持逗号在行首或行尾
- 新增 alignColumnDefinitions 配置，支持对齐列定义
- 新增 tabulateAlias 配置，支持对齐表别名
- 新增 newlineAfterSelect 配置，控制 SELECT 关键字后是否换行
- 新增 newlineAfterFrom 配置，控制 FROM 关键字后是否换行
- 新增 newlineBeforeWhere 配置，控制 WHERE 关键字前是否换行
- 新增 newlineAfterWhere 配置，控制 WHERE 关键字后是否换行
- 新增 newlineBeforeOrderBy 配置，控制 ORDER BY 关键字前是否换行
- 新增 newlineBeforeGroupBy 配置，控制 GROUP BY 关键字前是否换行
- 新增 newlineBeforeHaving 配置，控制 HAVING 关键字前是否换行
- 新增 newlineBeforeLimit 配置，控制 LIMIT 关键字前是否换行
- 新增 maxLineLength 配置，设置最大行长度
- 新增 reservedKeywordCase 配置，控制保留关键字大小写（SELECT, FROM, WHERE 等）
- 新增 builtinFunctionCase 配置，控制内置函数大小写（COUNT, SUM, MAX 等）
- 新增 newlineBeforeJoin 配置，控制 JOIN 关键字前是否换行
- 新增 newlineAfterComma 配置，控制逗号后是否强制换行
- 新增 alignWhereClauses 配置，控制 WHERE 子句是否对齐
- 新增 alignCaseStatements 配置，控制 CASE 语句是否对齐
- 新增 breakAfterSelectItem 配置，控制每个 SELECT 项后是否换行
- 新增 breakAfterFromItem 配置，控制每个 FROM 项后是否换行
- 新增 spaceBeforeComma 配置，控制逗号前是否加空格
- 新增 spaceInsideParentheses 配置，控制括号内是否加空格
- 新增 trimTrailingSpaces 配置，控制是否修剪尾部空格
- 新增 semicolonAtEnd 配置，控制是否在语句结尾添加分号
- 新增 singleLineMaxLength 配置，设置单行查询最大长度
- 更新 package.json，添加所有新配置项
- 更新 configEditorCommand.ts，在可视化配置编辑器中添加新选项（按功能分组展示）
- 更新 FormatOptions.ts，添加新配置类型
- 更新 sqlFormatter.ts，更新默认配置
- 更新 core/config.ts，支持从 VS Code 配置中读取新选项
- 更新 validateConfig.ts，移除 commaPosition 和 tabulateAlias 的废弃标记
- 更新所有预设配置（default, hive, mysql, compact），支持新配置项
- 版本号升级到 0.12.0

## 0.11.3
- 修复 JOIN ON 子句中的 ON 被误报为保留字标识符的问题
- 改进保留字识别逻辑，增加扩展范围检查
- 提高诊断规则的准确性
- 版本号升级到 0.11.3

## 0.11.2
- 修复 SELECT WITH FROM 误报问题
- 改进 SELECT without FROM 检测逻辑
- 实现查询范围检测，正确识别 FROM 子句
- 提高诊断规则的准确性，减少误报
- 版本号升级到 0.11.2

## 0.11.1
- 优化主键检测规则，识别常见的id字段
- 当表包含常见的主键字段名时（id, uuid, guid, _id等）不显示警告
- 提高 lint 规则的智能性，减少误报
- 版本号升级到 0.11.1

## 0.11.0
- 修复配置编辑器中的 lint 错误
- 移除未使用的导入和变量
- 优化类型注解，避免使用 any 类型
- 修复保留字检测问题，正确识别 CREATE TABLE 等语句
- 改进代码质量，修复所有 lint 错误
- 优化项目结构
- 版本号升级到 0.11.0

## 0.10.0
- 新增 SQL Lint 功能，内置 13+ 条规则
- 新增代码折叠功能，支持 CTE、子查询、函数块等
- 新增大纲视图功能，提供 SQL 文档快速导航
- 新增参数化查询支持，支持变量高亮和批量替换
- 新增替换参数命令和快捷键
- 新增可配置的 Lint 规则系统
- 支持自定义 Lint 规则的启用状态和严重级别
- 更新 package.json，添加 Lint 配置选项
- 更新 README，添加 Lint 功能详细说明
- 版本号升级到 0.10.0

## 0.9.0
- 新增状态栏显示功能，显示当前 SQL 方言
- 新增代码片段支持，提供 15+ 常用 SQL 模板
- 新增快速修复功能，支持一键修复常见问题
- 支持 null 比较修复（= NULL → IS NULL）
- 支持保留字标识符修复（添加反引号）
- 支持子查询别名添加
- 支持 INSERT 列名添加
- 支持 HAVING 缺少 GROUP BY 的修复
- 更新 package.json，添加 snippets 配置
- 更新 README，添加新功能详细说明
- 版本号升级到 0.9.0

## 0.8.0
- 新增增强的语法检查功能
- 新增 15+ 项语法和代码质量检查
- 支持配置是否启用增强检查
- 支持按严重程度过滤诊断信息（错误/警告/信息）
- 配置变更时自动重新检查
- 更新文档，添加新功能说明
- 更新版本号

## 0.7.0
- 新增可视化配置编辑器功能
- 命令名从"Open Config Editor"改为"Hive Formatter Config"
- 提供图形化配置界面，支持实时预览格式化效果
- 内置快速预设（默认、Hive、MySQL、紧凑）
- 支持 VSCode 主题适配（深色/浅色/高对比度）
- 更新 README 文档，添加可视化配置编辑器使用说明
- 更新版本号

## 0.6.0
- 新增可视化配置编辑器命令
- 实现 ConfigEditorPanel 类管理 Webview 生命周期
- 支持配置保存和读取
- 集成实时格式化预览功能
- 更新版本号

## 0.5.0
- 大规模重构 src 目录结构，按功能模块组织文件
- 创建 commands 目录，存放所有 VSCode 命令（格式化选择、MySQL转Hive、Hive转MySQL）
- 创建 providers 目录，存放所有提供者类（SqlFormattingProvider、SqlDiagnosticsProvider）
- 创建 core 目录，存放核心工具和配置（config、sqlDialects）
- 创建 utils 目录，存放通用工具函数（formatEditorText）
- 优化 extension.ts，简化命令注册逻辑
- 更新所有导入路径，保持代码正常工作
- 提高项目的可维护性和可读性
- 更新版本号

## 0.4.0
- 重构项目代码结构，提高可读性和可维护性
- 将转换逻辑模块化，分离类型映射、函数映射、SQL解析等功能
- 创建独立的转换器类（MysqlToHiveConverter、HiveToMysqlConverter）
- 创建 converter 目录，组织相关文件
- 简化主转换类（SqlConverter）
- 优化代码组织，每个功能有明确的职责
- 更新版本号

## 0.3.0
- 新增 MySQL 与 HiveSQL 互相转换功能
- 支持将 MySQL 语法转换为 HiveSQL
- 支持将 HiveSQL 转换为 MySQL
- 数据类型自动转换（VARCHAR → STRING, DATETIME → TIMESTAMP 等）
- 函数自动转换（IFNULL → COALESCE, NOW() → CURRENT_TIMESTAMP 等）
- 表创建语句自动转换（移除 AUTO_INCREMENT, PRIMARY KEY 等 MySQL 特有语法）
- 更新插件描述
- 新增两个转换命令到命令面板
- 更新版本号

## 0.2.3
- 将发布日志从 README 移到 CHANGELOG 文件中
- 更新版本号

## 0.2.2
- 修复 TokenizerEngine 中的英文错误提示
- 将所有解析错误信息改为中文
- 更新版本号

## 0.2.1
- 修复语法错误检测误报问题
- 优化检测逻辑，避免正常 SQL 语句被误判
- 所有错误提示改为中文
- 更新 README 文档

## 0.2.0
- 新增语法错误检测功能
- 支持检测常见 SQL 语法错误
- 错误信息包含行号，方便定位
- 优化错误提示的可读性

## 0.1.0
- 增强错误检测能力
- 添加更多常见语法检查
- 改进错误消息格式

## 0.0.9
- 实现基础语法错误提示功能
- 集成 Nearley 解析器进行语法检查

## 0.0.8
- 完善代码注释，提高可读性
- 优化代码结构和组织
- 完善 README 文档
- 修复配置命名不一致问题

## 0.0.7
- 完善代码注释和文档
- 优化代码结构和可读性

## 0.0.6
- 修复配置命名不一致问题

## 0.0.5
- 补充 README
- 优化配置项说明

## 0.0.4
- 修复测试问题
- 鸣谢 @TalDu

## 0.0.3
- 修复测试问题

## 0.0.2
- 修复测试问题

## 0.0.1
- 发布测试版
