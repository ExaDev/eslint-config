import type { Configuration } from 'lint-staged';

const config: Configuration = {
  '*.{ts,json}': 'eslint --fix',
};

export default config;
