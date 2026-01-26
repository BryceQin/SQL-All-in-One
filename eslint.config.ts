// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import tsdoc from 'eslint-plugin-tsdoc';

export default defineConfig([
    {
        files: ['**/*.ts', '*.tsx'],
        plugins: {
            tsdoc: tsdoc
        },
        languageOptions: {
            parser: tseslint.parser
        },
        extends: [
            eslint.configs.recommended,
            tseslint.configs.strict,
            tseslint.configs.stylistic
        ],
        rules: { 'tsdoc/syntax': 'warn' }
    }
]);
