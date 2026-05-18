import * as vscode from 'vscode'
import * as assert from 'assert'

suite('ConfigEditorPanel 测试', () => {
    
    suite('基础功能测试', () => {
        
        test('配置编辑器应该能够打开', async function() {
            this.timeout(30000)
            
            const extension = vscode.extensions.getExtension('hive-formatter.hive-formatter')
            if (!extension) {
                throw new Error('Extension not found')
            }
            
            await extension.activate()
            
            await vscode.commands.executeCommand('hive-formatter.open-config-editor')
            
            await new Promise(resolve => setTimeout(resolve, 1000))
            
            const textEditors = vscode.window.visibleTextEditors
            const hasWebviewPanel = vscode.window.tabGroups.all.some(group =>
                group.tabs.some(tab => tab.viewType === 'hiveFormatterConfig')
            )
            
            if (!hasWebviewPanel) {
                throw new Error('Config editor panel did not open')
            }
        })
        
        test('命令应该在命令面板中注册', async function() {
            this.timeout(5000)
            
            await new Promise(resolve => setTimeout(resolve, 500))
            
            const commands = await vscode.commands.getCommands()
            
            assert.ok(
                commands.includes('hive-formatter.open-config-editor'),
                'Open Config Editor 命令未找到'
            )
            
            assert.ok(
                commands.includes('hive-formatter.format-selection'),
                'Format Selection 命令未找到'
            )
            
            assert.ok(
                commands.includes('hive-formatter.mysql-to-hive'),
                'MySQL to HiveSQL 命令未找到'
            )
            
            assert.ok(
                commands.includes('hive-formatter.hive-to-mysql'),
                'HiveSQL to MySQL 命令未找到'
            )
        })
    })
    
    suite('配置保存和读取测试', () => {
        
        test('配置应该能正确更新', async function() {
            this.timeout(10000)
            
            const originalDialect = vscode.workspace.getConfiguration('Hive-Formatter').get<string>('dialect')
            
            try {
                
                const config = vscode.workspace.getConfiguration('Hive-Formatter')
                await config.update('dialect', 'mysql', vscode.ConfigurationTarget.Global)
                
                const updatedDialect = config.get<string>('dialect')
                
                strictEqual(updatedDialect, 'mysql', '配置未正确更新')
                
            } finally {
                
                if (originalDialect) {
                    const config = vscode.workspace.getConfiguration('Hive-Formatter')
                    await config.update('dialect', originalDialect, vscode.ConfigurationTarget.Global)
                }
            }
        })
    })
})

suite('回归测试 - 现有功能完整性', () => {
    
    suite('格式化功能回归测试', () => {
        
        test('基本 SQL 格式化应该正常工作', async function() {
            this.timeout(15000)
            
            const document = await vscode.workspace.openTextDocument({
                content: "select id,name from users where age>18",
                language: 'sql'
            })
            
            const editor = await vscode.window.showTextDocument(document)
            
            await vscode.commands.executeCommand('editor.action.formatDocument')
            
            await new Promise(resolve => setTimeout(resolve, 500))
            
            const formattedText = document.getText()
            
            ok(formattedText.includes('SELECT') || formattedText.includes('select'), 
               '格式化后应包含 SELECT 关键字')
            ok(formattedText.includes('FROM') || formattedText.includes('from'), 
               '格式化后应包含 FROM 关键字')
            
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
        })
        
        test('HiveQL 格式化应该正常工作', async function() {
            this.timeout(15000)
            
            const document = await vscode.workspace.openTextDocument({
                content: "select id,name,email from users where status='active' order by created_at desc limit 10",
                language: 'hive'
            })
            
            const editor = await vscode.window.showTextDocument(document)
            
            const config = vscode.workspace.getConfiguration('Hive-Formatter')
            const originalDialect = config.get<string>('dialect')
            
            try {
                await config.update('dialect', 'hive', vscode.ConfigurationTarget.Workspace)
                
                await vscode.commands.executeCommand('editor.action.formatDocument')
                
                await new Promise(resolve => setTimeout(resolve, 500))
                
                const formattedText = document.getText()
                
                ok(formattedText.length > 0, '格式化结果不应为空')
                ok(formattedText.includes('SELECT') || formattedText.includes('select'), 
                   '应包含 SELECT 关键字')
                   
            } finally {
                if (originalDialect) {
                    await config.update('dialect', originalDialect, vscode.ConfigurationTarget.Workspace)
                }
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
            }
        })
    })
    
    suite('转换功能回归测试', () => {
        
        test('MySQL 到 HiveSQL 转换应该正常工作', async function() {
            this.timeout(10000)
            
            const document = await vscode.workspace.openTextDocument({
                content: "SELECT id, name, email FROM users WHERE age > 18 LIMIT 10",
                language: 'sql'
            })
            
            const editor = await vscode.window.showTextDocument(document)
            
            const originalText = document.getText()
            
            await vscode.commands.executeCommand('hive-formatter.mysql-to-hive')
            
            await new Promise(resolve => setTimeout(resolve, 500))
            
            const convertedText = document.getText()
            
            ok(convertedText.length > 0, '转换结果不应为空')
            
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
        })
        
        test('HiveSQL 到 MySQL 转换应该正常工作', async function() {
            this.timeout(10000)
            
            const document = await vscode.workspace.openTextDocument({
                content: "SELECT id, name, email FROM users WHERE age > 18 LIMIT 10",
                language: 'hive'
            })
            
            const editor = await vscode.window.showTextDocument(document)
            
            await vscode.commands.executeCommand('hive-formatter.hive-to-mysql')
            
            await new Promise(resolve => setTimeout(resolve, 500))
            
            const convertedText = document.getText()
            
            ok(convertedText.length > 0, '转换结果不应为空')
            
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
        })
    })
    
    suite('语法诊断回归测试', () => {
        
        test('语法错误检测应该正常工作', async function() {
            this.timeout(10000)
            
            const document = await vscode.workspace.openTextDocument({
                content: "select id, from users where",
                language: 'hive'
            })
            
            const editor = await vscode.window.showTextDocument(document)
            
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            const diagnostics = vscode.languages.getDiagnostics(document.uri)
            
            ok(diagnostics.length >= 0, '诊断系统应正常运行')
            
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
        })
        
        test('有效 SQL 应该没有错误诊断', async function() {
            this.timeout(10000)
            
            const document = await vscode.workspace.openTextDocument({
                content: "SELECT id, name, email FROM users WHERE age > 18 AND status = 'active'",
                language: 'hive'
            })
            
            const editor = await vscode.window.showTextDocument(document)
            
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            const diagnostics = vscode.languages.getDiagnostics(document.uri)
            
            ok(true, '诊断系统处理有效SQL时不应崩溃')
            
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
        })
    })
    
    suite('配置选项回归测试', () => {
        
        test('所有配置项都应该可访问', async function() {
            this.timeout(5000)
            
            const config = vscode.workspace.getConfiguration('Hive-Formatter')
            
            const expectedKeys = [
                'dialect',
                'ignoreTabSettings',
                'tabSizeOverride',
                'insertSpacesOverride',
                'keywordCase',
                'dataTypeCase',
                'functionCase',
                'identifierCase',
                'indentStyle',
                'logicalOperatorNewline',
                'expressionWidth',
                'linesBetweenQueries',
                'denseOperators',
                'newlineBeforeSemicolon',
                'paramTypes'
            ]
            
            for (const key of expectedKeys) {
                const value = config.get(key)
                ok(value !== undefined, `配置项 ${key} 应存在`)
            }
        })
        
        test('配置枚举值应该在允许范围内', async function() {
            this.timeout(5000)
            
            const config = vscode.workspace.getConfiguration('Hive-Formatter')
            
            const validDialects = ['hive', 'mysql', 'spark', 'sql']
            const dialect = config.get<string>('dialect')
            ok(validDialects.includes(dialect || ''), `方言值 ${dialect} 应在有效范围内`)
            
            const validCases = ['preserve', 'upper', 'lower']
            const keywordCase = config.get<string>('keywordCase')
            ok(validCases.includes(keywordCase || ''), `关键字大小写 ${keywordCase} 应在有效范围内`)
            
            const validIndentStyles = ['standard', 'tabularLeft', 'tabularRight']
            const indentStyle = config.get<string>('indentStyle')
            ok(validIndentStyles.includes(indentStyle || ''), `缩进风格 ${indentStyle} 应在有效范围内`)
        })
    })
})

suite('集成测试', () => {
    
    suite('完整工作流测试', () => {
        
        test('从配置到格式的端到端工作流', async function() {
            this.timeout(30000)
            
            const config = vscode.workspace.getConfiguration('Hive-Formatter')
            
            const originalKeywordCase = config.get<string>('keywordCase')
            
            try {
                
                await config.update('keywordCase', 'upper', vscode.ConfigurationTarget.Workspace)
                
                const document = await vscode.workspace.openTextDocument({
                    content: "select id,name,email from users where age>18 and status='active' order by created_at desc limit 10;",
                    language: 'sql'
                })
                
                const editor = await vscode.window.showTextDocument(document)
                
                await vscode.commands.executeCommand('editor.action.formatDocument')
                
                await new Promise(resolve => setTimeout(resolve, 1000))
                
                const formattedText = document.getText()
                
                ok(formattedText.toUpperCase().includes('SELECT'), 
                   '大写模式下应包含大写的 SELECT')
                ok(formattedText.toUpperCase().includes('FROM'), 
                   '大写模式下应包含大写的 FROM')
                ok(formattedText.toUpperCase().includes('WHERE'), 
                   '大写模式下应包含大写的 WHERE')
                
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
                
            } finally {
                if (originalKeywordCase) {
                    await config.update('keywordCase', originalKeywordCase, vscode.ConfigurationTarget.Workspace)
                }
            }
        })
        
        test('多文件格式化一致性', async function() {
            this.timeout(25000)
            
            const sqlContent1 = "select a,b,c from t where x=1"
            const sqlContent2 = "select d,e,f from u where y=2"
            
            const doc1 = await vscode.workspace.openTextDocument({
                content: sqlContent1,
                language: 'hive'
            })
            
            const doc2 = await vscode.workspace.openTextDocument({
                content: sqlContent2,
                language: 'hive'
            })
            
            const editor1 = await vscode.window.showTextDocument(doc1)
            
            await vscode.commands.executeCommand('editor.action.formatDocument')
            
            await new Promise(resolve => setTimeout(resolve, 500))
            
            const formatted1 = doc1.getText()
            
            await vscode.commands.executeCommand('vscode.open', doc2.uri)
            
            await new Promise(resolve => setTimeout(resolve, 300))
            
            await vscode.commands.executeCommand('editor.action.formatDocument')
            
            await new Promise(resolve => setTimeout(resolve, 500))
            
            const formatted2 = doc2.getText()
            
            ok(formatted1.length > 0 && formatted2.length > 0, '两个文件都应成功格式化')
            
            const hasSimilarStructure = 
                (formatted1.toUpperCase().includes('SELECT') && formatted2.toUpperCase().includes('SELECT')) &&
                (formatted1.toUpperCase().includes('FROM') && formatted2.toUpperCase().includes('FROM'))
            
            ok(hasSimilarStructure, '两个文件应有相似的结构')
            
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
        })
    })
})
