export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'tailwind',
          'theme',
          'source',
          'utility',
          'variant',
          'custom-variant',
          'config',
          'slot',
          'apply',
          'reference',
        ],
      },
    ],
    // Project conventions: BEM-ish class names, rgba() color functions,
    // hand-organized token sections. Keep Stylelint focused on real errors.
    'selector-class-pattern': null,
    'alpha-value-notation': null,
    'color-function-notation': null,
    'color-function-alias-notation': null,
    'comment-empty-line-before': null,
    'declaration-empty-line-before': null,
    'at-rule-empty-line-before': null,
    'no-descending-specificity': null,
    'no-duplicate-selectors': null,
    'import-notation': null,
    'media-feature-range-notation': null,
    'declaration-block-no-redundant-longhand-properties': null,
    'font-family-name-quotes': null,
  },
  ignoreFiles: ['dist/**', 'coverage/**', 'node_modules/**'],
};
