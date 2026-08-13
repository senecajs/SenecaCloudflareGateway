module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
  },
  ignorePatterns: ['dist/', 'coverage/'],
  rules: {
    'no-console': 0,
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
    'no-redeclare': 'off',
    '@typescript-eslint/no-redeclare': ['error'],
    yoda: ['error', 'always'],
    'max-len': ['error', { code: 80 }],
    // seneca/msg/ctx are untyped at their source (Seneca itself has no
    // useful static types for `this`, message bodies, or gateway ctx) —
    // gateway-azure/gateway-lambda use `any` at this boundary throughout,
    // and this package matches that, so these two default-on rules would
    // just flag the entire file rather than anything project-specific.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-this-alias': 'off',
  },
  globals: {
    Promise: 'readonly',
  },
}
