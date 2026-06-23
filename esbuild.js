const esbuild = require('esbuild');

const nativePlugin = {
    name: 'native-node',
    setup(build) {
        build.onResolve({ filter: /\.node$/ }, (args) => ({
            path: args.path,
            namespace: 'native-node',
        }));
        build.onLoad({ filter: /.*/, namespace: 'native-node' }, () => ({
            contents: 'module.exports = {};',
            loader: 'js',
        }));
    },
};

esbuild.build({
    entryPoints: ['./src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    external: ['vscode', 'pg', 'better-sqlite3'],
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    plugins: [nativePlugin],
    sourcemap: !process.argv.includes('--minify'),
    minify: process.argv.includes('--minify'),
    treeShaking: true,
    define: {
        'process.env.NODE_ENV': process.argv.includes('--minify') ? '"production"' : '"development"',
    },
    logLevel: process.argv.includes('--minify') ? 'warning' : 'info',
    metafile: true,
}).catch(() => process.exit(1));
