const { defineConfig } = require('@vscode/test-cli');
const path = require('path');

module.exports = defineConfig({
    files: 'out/test/**/*.test.js',
    mocha: {
        require: [path.resolve(__dirname, 'out/test/helpers/diSetup.js')],
        timeout: 60000
    }
});
