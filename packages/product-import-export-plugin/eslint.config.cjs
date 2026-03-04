const baseConfig = require('../../eslint.config.cjs')

module.exports = [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
]
