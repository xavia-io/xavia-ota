module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // New features
        'fix', // Bug fixes
        'docs', // Documentation changes
        'style', // Code style changes (formatting, etc)
        'refactor', // Code refactoring
        'perf', // Performance improvements
        'test', // Adding or modifying tests
        'build', // Build system changes
        'ci', // CI configuration changes
        'chore', // Other changes
        'revert', // Revert previous commits
      ],
    ],
  },
};
