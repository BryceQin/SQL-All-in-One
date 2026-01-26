"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sql = exports.spark = exports.mysql = exports.hive = void 0;
var hive_formatter_1 = require("./hive/hive.formatter");
Object.defineProperty(exports, "hive", { enumerable: true, get: function () { return hive_formatter_1.hive; } });
var mysql_formatter_1 = require("./mysql/mysql.formatter");
Object.defineProperty(exports, "mysql", { enumerable: true, get: function () { return mysql_formatter_1.mysql; } });
var spark_formatter_1 = require("./spark/spark.formatter");
Object.defineProperty(exports, "spark", { enumerable: true, get: function () { return spark_formatter_1.spark; } });
var sql_formatter_1 = require("./sql/sql.formatter");
Object.defineProperty(exports, "sql", { enumerable: true, get: function () { return sql_formatter_1.sql; } });
//# sourceMappingURL=allDialects.js.map