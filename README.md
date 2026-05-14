# Hive Formatter

一个强大的 SQL 格式化 VSCode 插件，支持 Hive、MySQL、SparkSQL 等多种 SQL 方言，提供丰富的自定义配置选项。

## 特性

区别于市场上多数仅提供单一格式化效果的 SQL 插件，本工具以个性化配置为核心设计理念，内置丰富的可配置项：

- 📝 **多种 SQL 方言支持** - Hive、MySQL、SparkSQL、通用 SQL
- 🎨 **丰富的格式化选项** - 关键字大小写、缩进风格、换行策略等
- 📏 **灵活的缩进配置** - 支持标准缩进和表格风格对齐
- ⚙️ **高度自定义** - 超过 10 项可配置项满足各种团队规范
- 🔧 **命令支持** - 提供"格式化选择"命令，支持部分格式化
- ✅ **语法错误检测** - 实时检测常见 SQL 语法错误并提供友好的中文提示

## 快速开始

1. 安装插件后，打开任意 `.sql` 或 `.hql` 文件
2. 使用快捷键 `Shift+Alt+F`（Windows/Linux）或 `Shift+Option+F`（Mac）格式化文档
3. 或右键选择"格式化文档"
4. 或使用命令面板搜索"Format Selection (Hive Formatter)"格式化选中内容

## 扩展设置

在 VSCode 设置中搜索 "Hive Formatter" 进行配置：

| 设置项 | 描述 | 默认值 |
|--------|------|--------|
| `dialect` | 选择使用的SQL方言（hive/mysql/spark/sql） | `hive` |
| `ignoreTabSettings` | 是否忽略编辑器的 tabSize 和 insertSpaces 设置 | `false` |
| `tabSizeOverride` | 覆盖 tabSize 设置（需要先启用 ignoreTabSettings） | `2` |
| `insertSpacesOverride` | 覆盖 insertSpaces 设置（需要先启用 ignoreTabSettings） | `true` |
| `keywordCase` | 关键字大小写（preserve/upper/lower） | `preserve` |
| `dataTypeCase` | 数据类型大小写（preserve/upper/lower） | `preserve` |
| `functionCase` | 函数名大小写（preserve/upper/lower） | `preserve` |
| `identifierCase` | 标识符大小写（preserve/upper/lower） | `preserve` |
| `indentStyle` | 缩进风格（standard/tabularLeft/tabularRight） | `standard` |
| `logicalOperatorNewline` | AND/OR 换行位置（before/after） | `before` |
| `expressionWidth` | 表达式拆分为多行的字符阈值 | `50` |
| `linesBetweenQueries` | 查询语句之间的空行数 | `1` |
| `denseOperators` | 是否去除运算符周围的空格 | `false` |
| `newlineBeforeSemicolon` | 分号是否另起一行 | `false` |
| `paramTypes` | 指定支持的参数占位符类型 | - |

### 缩进风格说明

- **standard**: 标准 SQL 格式，带有级联缩进
- **tabularLeft**: 在关键字和参数之间保留空格列，使关键字左对齐
- **tabularRight**: 在关键字和参数之间保留空格列，将关键字向右对齐

## 支持的文件类型

- `.sql` - SQL 文件
- `.hql` - HiveQL 文件

## 使用示例

### 格式化前
```sql
select id,name,email from users where age>18 and status='active' order by created_at desc limit 10;
```

### 格式化后（standard 风格）
```sql
SELECT
    id,
    name,
    email
FROM users
WHERE
    age > 18
    AND status = 'active'
ORDER BY created_at DESC
LIMIT 10;
```

## 语法错误检测

插件会实时检测 SQL 语法错误，并在编辑器中用红色波浪线高亮显示，同时在问题面板中提供详细的中文错误信息。

### 支持检测的错误类型

- 逗号后面缺少列名（如 `select id, from ...`）
- SELECT 后面缺少列名
- FROM 后面缺少表名
- 不匹配的括号
- 未正确闭合的字符串
- ORDER BY 后面缺少列名
- WHERE 后面缺少条件
- GROUP BY 后面缺少列名
- 多余的逗号

错误信息会明确指出问题所在的行号，方便快速定位和修复。

## 反馈与贡献

如果你有问题或者好的格式化配置建议，欢迎在 [GitHub Issues](https://github.com/BryceQin/Hive-Formatter/issues) 反馈。

## 鸣谢

- 基于 [SQL Formatter](https://github.com/sql-formatter-org/sql-formatter) 开发
- 感谢贡献者 @TalDu

## 更新日志

请查看 [CHANGELOG.md](CHANGELOG.md) 文件了解详细的版本更新历史。

## 许可证

MIT License
