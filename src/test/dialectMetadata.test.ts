import * as assert from "assert";
import { AdapterFactory } from "../database/adapters/AdapterFactory";
import { MysqlAdapter } from "../database/adapters/MysqlAdapter";
import { StarrocksAdapter } from "../database/adapters/StarrocksAdapter";
import { SqlServerAdapter } from "../database/adapters/SqlServerAdapter";
import { OracleAdapter } from "../database/adapters/OracleAdapter";
import { DamengAdapter } from "../database/adapters/DamengAdapter";

suite("AdapterFactory 方言元数据测试", () => {
    test("未注册方言应返回 undefined", () => {
        const meta = AdapterFactory.getDialectMetadata("nonexistent");
        assert.strictEqual(meta, undefined);
    });

    test("mysql 方言元数据应正确", () => {
        AdapterFactory.register("mysql", MysqlAdapter, MysqlAdapter.getDialectMetadata);
        const meta = AdapterFactory.getDialectMetadata("mysql");
        assert.ok(meta, "mysql 元数据应存在");
        assert.strictEqual(meta!.dialect, "mysql");
        assert.strictEqual(meta!.displayName, "MySQL");
        assert.strictEqual(meta!.defaultPort, 3306);
        assert.strictEqual(meta!.defaultUsername, "root");
        assert.strictEqual(meta!.supportsSshTunnel, true);
        assert.strictEqual(meta!.supportsSsl, true);
        assert.strictEqual(meta!.isFileBased, false);
    });

    test("getAllMetadata 应包含 mysql", () => {
        const all = AdapterFactory.getAllMetadata();
        assert.ok(
            all.some((m) => m.dialect === "mysql"),
            "应包含 mysql",
        );
    });

    test("starrocks 方言元数据应正确", () => {
        AdapterFactory.register("starrocks", StarrocksAdapter, StarrocksAdapter.getDialectMetadata);
        const meta = AdapterFactory.getDialectMetadata("starrocks");
        assert.ok(meta, "starrocks 元数据应存在");
        assert.strictEqual(meta!.dialect, "starrocks");
        assert.strictEqual(meta!.displayName, "StarRocks");
        assert.strictEqual(meta!.defaultPort, 9030);
        assert.strictEqual(meta!.defaultUsername, "root");
        assert.strictEqual(meta!.supportsSshTunnel, true);
        assert.strictEqual(meta!.supportsSsl, true);
        assert.strictEqual(meta!.isFileBased, false);
    });

    test("getAllMetadata 应包含 starrocks", () => {
        const all = AdapterFactory.getAllMetadata();
        assert.ok(
            all.some((m) => m.dialect === "starrocks"),
            "应包含 starrocks",
        );
    });

    test("sqlserver 方言元数据应正确", () => {
        AdapterFactory.register("sqlserver", SqlServerAdapter, SqlServerAdapter.getDialectMetadata);
        const meta = AdapterFactory.getDialectMetadata("sqlserver");
        assert.ok(meta, "sqlserver 元数据应存在");
        assert.strictEqual(meta!.dialect, "sqlserver");
        assert.strictEqual(meta!.displayName, "SQL Server");
        assert.strictEqual(meta!.defaultPort, 1433);
        assert.strictEqual(meta!.defaultUsername, "sa");
        assert.strictEqual(meta!.supportsSshTunnel, true);
        assert.strictEqual(meta!.supportsSsl, true);
        assert.strictEqual(meta!.isFileBased, false);
    });

    test("getAllMetadata 应包含 sqlserver", () => {
        const all = AdapterFactory.getAllMetadata();
        assert.ok(
            all.some((m) => m.dialect === "sqlserver"),
            "应包含 sqlserver",
        );
    });

    test("oracle 方言元数据应正确", () => {
        AdapterFactory.register("oracle", OracleAdapter, OracleAdapter.getDialectMetadata);
        const meta = AdapterFactory.getDialectMetadata("oracle");
        assert.ok(meta, "oracle 元数据应存在");
        assert.strictEqual(meta!.dialect, "oracle");
        assert.strictEqual(meta!.displayName, "Oracle");
        assert.strictEqual(meta!.defaultPort, 1521);
        assert.strictEqual(meta!.defaultUsername, "system");
        assert.strictEqual(meta!.supportsSshTunnel, true);
        assert.strictEqual(meta!.supportsSsl, true);
        assert.strictEqual(meta!.isFileBased, false);
    });

    test("getAllMetadata 应包含 oracle", () => {
        const all = AdapterFactory.getAllMetadata();
        assert.ok(
            all.some((m) => m.dialect === "oracle"),
            "应包含 oracle",
        );
    });

    test("dameng 方言元数据应正确", () => {
        AdapterFactory.register("dameng", DamengAdapter, DamengAdapter.getDialectMetadata);
        const meta = AdapterFactory.getDialectMetadata("dameng");
        assert.ok(meta, "dameng 元数据应存在");
        assert.strictEqual(meta!.dialect, "dameng");
        assert.strictEqual(meta!.displayName, "达梦 DM");
        assert.strictEqual(meta!.defaultPort, 5236);
        assert.strictEqual(meta!.defaultUsername, "SYSDBA");
        assert.strictEqual(meta!.supportsSshTunnel, true);
        assert.strictEqual(meta!.supportsSsl, false);
        assert.strictEqual(meta!.isFileBased, false);
    });

    test("getAllMetadata 应包含 dameng", () => {
        const all = AdapterFactory.getAllMetadata();
        assert.ok(
            all.some((m) => m.dialect === "dameng"),
            "应包含 dameng",
        );
    });

    test("getRegisteredDialects 应包含 dameng", () => {
        AdapterFactory.register("dameng", DamengAdapter, DamengAdapter.getDialectMetadata);
        const dialects = AdapterFactory.getRegisteredDialects();
        assert.ok(dialects.includes("dameng"), "注册方言列表应包含 dameng");
    });
});
