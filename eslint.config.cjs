module.exports = [
  {
    files: ["**/*.js"],
    ignores: [
      "node_modules/**",
      "frontend/react-app/dist/**",
      "dist-tools/**",
      "test-results/**",
      ".tmp/**"
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script"
    },
    rules: {
      "no-unused-vars": "warn",
      "no-implicit-globals": "warn"
    }
  }
];
