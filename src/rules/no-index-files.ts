import type { Rule } from 'eslint';
import { isIndexFile } from './barrel-helpers';

// The strictest of the three barrel policies ('banned' in barrel-policy's mode enum): no index/barrel files at all. Import directly from the module that owns the export instead. Hidden transitive dependencies through index files obscure the module graph and make tree-shaking unreliable -- the motivation is the same one that led several repos to ban barrels outright. The inverse of no-non-barrel-index, which permits exactly src/index.ts: this rule permits none.
//
// Self-scoped to index files via isIndexFile (context.filename) -- no-ops on every non-index file, so it never relies on a consumer's own `files` config and never misfires when applied unscoped.
const noIndexFiles: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      indexFileBanned:
        "Index (barrel) files are banned -- import directly from the module that owns the export instead. Rename this file to something descriptive.",
    },
  },
  create(context) {
    if (!isIndexFile(context.filename)) return {};
    return {
      Program(node) {
        context.report({ node, messageId: 'indexFileBanned' });
      },
    };
  },
};

export default noIndexFiles;
