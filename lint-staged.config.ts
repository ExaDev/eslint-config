import type { Configuration } from 'lint-staged';

const config: Configuration = {
  '*.{ts,json,md}': 'eslint --fix --cache',
};

export default config;
