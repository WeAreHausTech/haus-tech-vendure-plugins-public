const baseConfig = require('../../eslint.config.cjs')

module.exports = [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.js', '**/*.jsx'],
    rules: {},
  },
]
