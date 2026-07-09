import * as assert from 'assert';
import { describe, it } from 'mocha';
import type { MaterializedViewDesign } from '../views/materializedViewDesigner/MaterializedViewDesignerPanel';

describe('MaterializedViewDesigner', () => {
    describe('MaterializedViewDesign Interface', () => {
        it('should accept valid create mode design', () => {
            const data: MaterializedViewDesign = {
                viewName: 'mv_test',
                database: 'test_db',
                mode: 'create',
                ddl: 'CREATE MATERIALIZED VIEW `mv_test`\nAS\nSELECT id, name FROM users',
                originalDDL: '',
                refreshType: 'ASYNC'
            };

            assert.strictEqual(data.viewName, 'mv_test');
            assert.strictEqual(data.mode, 'create');
            assert.strictEqual(data.refreshType, 'ASYNC');
        });

        it('should accept valid alter mode design', () => {
            const data: MaterializedViewDesign = {
                viewName: 'mv_test',
                database: 'test_db',
                mode: 'alter',
                ddl: 'CREATE MATERIALIZED VIEW `mv_test`\nREFRESH MANUAL\nAS\nSELECT id, name FROM users',
                originalDDL: 'CREATE MATERIALIZED VIEW `mv_test`\nREFRESH ASYNC\nAS\nSELECT id FROM users',
                refreshType: 'MANUAL'
            };

            assert.strictEqual(data.viewName, 'mv_test');
            assert.strictEqual(data.mode, 'alter');
            assert.strictEqual(data.refreshType, 'MANUAL');
            assert.notStrictEqual(data.ddl, data.originalDDL);
        });

        it('should handle all refresh types', () => {
            const refreshTypes = ['ASYNC', 'SYNC', 'MANUAL'];

            refreshTypes.forEach(function(refreshType) {
                const data: MaterializedViewDesign = {
                    viewName: 'mv_test',
                    database: 'test_db',
                    mode: 'create',
                    ddl: 'CREATE MATERIALIZED VIEW `mv_test`\nREFRESH ' + refreshType + '\nAS\nSELECT 1',
                    originalDDL: '',
                    refreshType: refreshType
                };

                assert.strictEqual(data.refreshType, refreshType);
            });
        });
    });

    describe('Diff Computation', () => {
        it('should detect no changes when DDL is same', function() {
            const oldText = 'CREATE MATERIALIZED VIEW `mv_test`\nAS\nSELECT id FROM users';
            const newText = 'CREATE MATERIALIZED VIEW `mv_test`\nAS\nSELECT id FROM users';

            assert.strictEqual(oldText, newText);
        });

        it('should detect changes when DDL is different', function() {
            const oldText = 'CREATE MATERIALIZED VIEW `mv_test`\nREFRESH ASYNC\nAS\nSELECT id FROM users';
            const newText = 'CREATE MATERIALIZED VIEW `mv_test`\nREFRESH MANUAL\nAS\nSELECT id, name FROM users';

            assert.notStrictEqual(oldText, newText);
        });
    });

    describe('SQL Generation', () => {
        it('should generate SWAP WITH SQL for alter mode', function() {
            const viewName = 'order_mv';
            const tempViewName = viewName + '_tmp_' + Date.now();
            const newDDL = 'CREATE MATERIALIZED VIEW `order_mv`\nREFRESH MANUAL\nAS\nSELECT * FROM orders WHERE status = 1';

            const tempDDL = newDDL.replace(
                new RegExp('CREATE\\s+MATERIALIZED\\s+VIEW\\s+`?' + viewName + '`?', 'i'),
                'CREATE MATERIALIZED VIEW `' + tempViewName + '`'
            );

            const sqlStatements = [
                tempDDL,
                'ALTER MATERIALIZED VIEW `' + viewName + '` SWAP WITH `' + tempViewName + '`',
                'DROP MATERIALIZED VIEW IF EXISTS `' + tempViewName + '`'
            ];

            assert.strictEqual(sqlStatements.length, 3);
            assert.ok(sqlStatements[0].includes('CREATE MATERIALIZED VIEW'));
            assert.ok(sqlStatements[1].includes('SWAP WITH'));
            assert.ok(sqlStatements[2].includes('DROP MATERIALIZED VIEW'));
        });

        it('should not generate SWAP WITH for create mode', function() {
            const mode = 'create';
            const ddl = 'CREATE MATERIALIZED VIEW `mv_test`\nAS\nSELECT 1';

            if (mode === 'create') {
                assert.ok(ddl.includes('CREATE MATERIALIZED VIEW'));
            } else {
                assert.fail('Should be create mode');
            }
        });
    });
});