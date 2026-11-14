module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    es2022: true,
    node: true,
    jest: true,
  },
  ignorePatterns: ['**/dist/**', '**/.next/**', '**/node_modules/**'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      files: ['apps/admin-web/**/*.{ts,tsx}'],
      extends: ['next/core-web-vitals'],
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    {
      files: ['apps/*-mobile/**/*.{ts,tsx}'],
      parserOptions: { ecmaFeatures: { jsx: true } },
      env: { es2022: true },
    },
  ],
};
