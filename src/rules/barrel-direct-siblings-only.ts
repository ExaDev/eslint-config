import type { Rule } from 'eslint';
import { isDirectSibling, isIndexFile } from './barrel-helpers';

// The 'siblings' barrel policy's defining constraint: an index file may re-export, but only from a direct sibling file or folder (`./module` / `./module.ts`), never from a nested path (`./a/b`), a parent (`../x`), or a bare package specifier (`document-schema.js`). This keeps each barrel a flat, local aggregation of its own directory's contents -- a reader can see at a glance exactly what a folder exposes and where each piece lives, with no transitive reach through arbitrary depths of the tree. A sibling folder is permitted because it resolves via its own index, which itself falls under the same constraint.
//
// Self-scoped to index files via isIndexFile and checking each re-export's source specifier through isDirectSibling -- both shared with barrel-policy's 'siblings' mode, so this standalone rule and the umbrella agree exactly. Covers both single-statement re-export forms (`export { x } from '...'`, `export * from '...'`); the split-statement form's import source is the barrel-policy umbrella's concern, not this rule's. No autofix: choosing the right sibling to re-export from is a structural decision, not a mechanical one.
const barrelDirectSiblingsOnly: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      notADirectSibling:
        "A barrel may re-export only from a direct sibling file or folder ('./module' or './module.ts') -- found '{{ source }}'. Move the source closer, or import it directly at the call site rather than re-exporting it through this barrel.",
    },
  },
  create(context) {
    if (!isIndexFile(context.filename)) return {};
    return {
      ExportNamedDeclaration(node) {
        if (node.source === null || node.source === undefined) return;
        const source = node.source.value;
        if (typeof source !== 'string') return; // impossible for a real re-export at runtime; narrows the wide ESTree Literal.value union without an assertion.
        if (!isDirectSibling(source)) {
          context.report({ node, messageId: 'notADirectSibling', data: { source } });
        }
      },
      ExportAllDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== 'string') return;
        if (!isDirectSibling(source)) {
          context.report({ node, messageId: 'notADirectSibling', data: { source } });
        }
      },
    };
  },
};

export default barrelDirectSiblingsOnly;
