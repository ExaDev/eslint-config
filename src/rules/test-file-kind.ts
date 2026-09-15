import type { Rule } from 'eslint';
import { classifyTestFile } from './test-file-helpers';

const DEFAULT_KINDS: readonly string[] = ['unit', 'integration', 'e2e'];

export interface TestFileKindOptions {
  readonly kinds?: readonly string[];
}

// Extracts and validates the `kinds` option. A standalone function (not inline in create) so ESLint's `any`-typed `context.options[0]` is funneled through an `unknown` parameter boundary — passing `any` into `unknown` is safe, whereas inline member access on `any` (`options.kinds`) propagates `any` through every later use and trips the type-aware lint rules. Inside the function `options` is `unknown`, so the narrowing composes cleanly without an assertion. Exported so its own throws — a safety net behind the rule's schema and `defaultOptions`, which ESLint's own Linter/RuleTester already enforce before create() is ever called with anything else — can be exercised directly rather than left permanently unreachable through real linting.
export function readKinds(options: unknown): readonly string[] {
  if (typeof options !== 'object' || options === null) {
    throw new Error("Unreachable: exadev/test-file-kind requires options[0] to be an object, which its own schema and defaultOptions guarantee before create() ever runs.");
  }
  if (!('kinds' in options)) return DEFAULT_KINDS;
  const { kinds } = options;
  if (!Array.isArray(kinds) || !kinds.every((kind): kind is string => typeof kind === 'string')) {
    throw new Error("Unreachable: exadev/test-file-kind requires options.kinds to be a string array, which its own schema guarantees before create() ever runs.");
  }
  return kinds;
}

// Self-scoped to real test/spec files via classifyTestFile (context.filename) — no-ops on every non-test file, so it never relies on a consumer's own `files` config and never misfires when applied unscoped. A file's own "kind" tag is the dot-segment immediately before its `.test`/`.spec` extension (e.g. `foo.unit.test.ts`); this rule requires one to be present and to be one of the configured `kinds`, so a consumer — or downstream tooling, e.g. a Vitest project split by test kind — can reliably tell unit from integration from e2e coverage by filename alone, without opening the file. This is a naming-discipline rule, not a content classifier: it says nothing about whether a file's actual contents match its declared kind.
const testFileKind: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          kinds: { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingKind:
        "Test file names must declare their test kind via a filename suffix (e.g. 'foo.unit.test.ts'). '{{ filename }}' has none — expected one of: {{ kinds }}.",
      invalidKind:
        "Test file names must declare a recognised test kind via a filename suffix. '{{ filename }}' declares '{{ found }}', which is not one of: {{ kinds }}.",
    },
    defaultOptions: [{}],
  },
  create(context) {
    const classification = classifyTestFile(context.filename);
    if (!classification.isTestFile) return {};

    const kinds = readKinds(context.options[0]);
    const { filename } = context;

    if (classification.kind === undefined) {
      return {
        Program(node) {
          context.report({ node, messageId: 'missingKind', data: { filename, kinds: kinds.join(', ') } });
        },
      };
    }

    const { kind } = classification;
    if (!kinds.includes(kind)) {
      return {
        Program(node) {
          context.report({ node, messageId: 'invalidKind', data: { filename, found: kind, kinds: kinds.join(', ') } });
        },
      };
    }

    return {};
  },
};

export default testFileKind;
