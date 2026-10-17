import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default ts.config(
  { ignores: ['dist/**', 'node_modules/**', 'unpackage/**', 'coverage/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { globals: { uni: 'readonly' }, parserOptions: { parser: ts.parser } },
  },
  { files: ['**/*.{ts,vue}'], rules: { 'vue/multi-word-component-names': 'off' } },
  prettier,
)
