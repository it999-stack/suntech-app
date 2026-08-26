// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const prettierConfig = require("eslint-config-prettier");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "android/**", ".expo/**"],
  },
  // Must be last — disables stylistic ESLint rules that would conflict with
  // Prettier, which owns formatting.
  prettierConfig,
]);
