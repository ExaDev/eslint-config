import { describe, expect, it } from 'vitest';
import { UNTYPED_ROBUSTNESS_RULES } from './robustness-rules';

describe('UNTYPED_ROBUSTNESS_RULES', () => {
  it('sets each core rule with its exact severity and options', () => {
    expect(UNTYPED_ROBUSTNESS_RULES).toStrictEqual({
      'default-case-last': 'error',
      eqeqeq: ['error', 'always'],
      'max-depth': ['error', { max: 4 }],
      'no-await-in-loop': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-return-assign': ['error', 'always'],
      'require-atomic-updates': 'error',
    });
  });

  it('names only unprefixed core rules, since the bundle that shares it registers no plugin', () => {
    for (const ruleId of Object.keys(UNTYPED_ROBUSTNESS_RULES)) {
      expect(ruleId).not.toContain('/');
    }
  });
});
