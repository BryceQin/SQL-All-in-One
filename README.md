# hive-formatter README

Hive Formatter是一个用于对SQL查询进行格式美化的VSCode插件。最初是基于[SQL Formatter](https://github.com/sql-formatter-org/sql-formatter)开发而来，但自那以后已经发生了显著的差异。

## Features

区别于市场上多数仅提供单一格式化效果的 SQL 插件，本工具以个性化配置为核心设计理念，内置丰富的可配置项，并计划持续迭代扩展，满足不同开发者、不同团队的格式化偏好。

> Tip: 如果你有问题或者好的格式化配置建议，可以在此处反馈 [Hive Formatter](https://github.com/BryceQin/Hive-Formatter/issues)。


## Extension Settings

- `dialect`: 选择使用的SQL方言。强烈建议选择否则可能出错。

- `ignoreTabSettings`: 是否忽略用户和工作区设置的 `tabSize` 和 `insertSpaces` ?

- `tabSizeOverride`: "当 `ignoreTabSettings#`激活时，覆盖 `tabSize` 设置

- `insertSpacesOverride`: 当 `ignoreTabSettings`激活时，覆盖 `insertSpaces` 设置

- `keywordCase`: 以大写、小写或保留现状来格式化关键字

- `dataTypeCase`: 以大写、小写或保留现状来格式化数据类型

- `functionCase`: 以大写、小写或保留现状来格式化函数名

- `identifierCase`: 以大写、小写或保留现状来格式化标识符

- `indentStyle`: 在标准关键词定位与保持中心位置列之间进行切换

- `logicalOperatorNewline`: 是否在 AND 和 OR 之前或之后换行

- `expressionWidth`: 一对括号之间的字符数达到多少时，应将表达式拆分为多行

- `linesBetweenQueries`: 每个查询/语句之间应放置多少个换行符

- `denseOperators`: 是否去除运算符（如+或>=）周围的空格

- `newlineBeforeSemicolon`: 分号应另起一行还是放在上一行

- `paramTypes`: 指定要支持的参数占位符类型

## Release Notes


### 0.0.1

发布测试版

### 0.0.2

修复测试问题

### 0.0.3

修复测试问题

### 0.0.4

修复测试问题，鸣谢@TalDu

### 0.0.5

- 补充README
- 优化配置项说明
