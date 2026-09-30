import { AST_NODE_TYPES, ESLintUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import { isRecord } from '../is-record';
import { assertOnlyKeys } from './file-entry';
import { createFileScope, fileGlobsSchema, readFileGlobs, type FileScope } from './file-scope';

const OPTION_NAME = 'no-multiline-template-literal';

/**
 * The options of `exadev/no-multiline-template-literal`.
 */
export interface NoMultilineTemplateLiteralOptions {
  // Globs of files the rule skips entirely, in the `fileGlobsSchema` dialect (a leading `!` excludes). For a file whose multi-line strings are the point (fixtures, prompts, generated text).
  readonly allowFiles?: readonly string[];
}

/**
 * The rule's option schema. `readNoMultilineTemplateLiteralOptions` adds the checks a schema cannot express.
 */
export const noMultilineTemplateLiteralSchema: JSONSchema4 = {
  type: 'object',
  properties: { allowFiles: fileGlobsSchema },
  additionalProperties: false,
};

/**
 * Validates the options and compiles `allowFiles` into a scope. Throws naming the option for a non-object, an unknown key or an invalid glob list.
 */
export function readNoMultilineTemplateLiteralOptions(value: unknown): FileScope | undefined {
  if (!isRecord(value)) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" must be an object.`);
  assertOnlyKeys(value, ['allowFiles'], OPTION_NAME);
  const { allowFiles } = value;

  return allowFiles === undefined ? undefined : createFileScope(readFileGlobs(allowFiles, `${OPTION_NAME}.allowFiles`));
}

/**
 * One piece of a line of the template, kept in the escaped form the template's own source used, except for the three characters whose spelling depends on the literal that will hold them.
 * - `text` is verbatim source that means the same in a single-quoted string and in a template literal.
 * - `quote` is an unescaped `'`, which a single-quoted string must escape and a template need not.
 * - `backtick` and `dollar` are an escaped backtick and an escaped dollar sign, which a template needs escaped and a string does not.
 * - `expression` is a whole `${...}` substitution copied verbatim, comments included.
 */
type Part =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'quote' }
  | { readonly kind: 'backtick' }
  | { readonly kind: 'dollar' }
  | { readonly kind: 'expression'; readonly source: string };

const HEX_ESCAPE = /^x[0-9a-fA-F]{2}/u;
const UNICODE_ESCAPE = /^u(?:[0-9a-fA-F]{4}|\{[0-9a-fA-F]+\})/u;

/**
 * Characters that end a line in a template's raw source other than the line feed: a carriage return (so a CRLF file is never rewritten, since the cooked value normalises it), and the two Unicode separators. A fix that could not show it leaves the string unchanged declines rather than guess at these.
 */
const UNSUPPORTED_LINE_ENDINGS: ReadonlySet<string> = new Set(['\r', ' ', ' ']);

function isDecimalDigit(character: string): boolean {
  return character >= '0' && character <= '9';
}

/**
 * The number of line feeds in a quasi's cooked value. The cooked value is `null` only for a tagged template with an invalid escape, and this rule never looks at a tagged template, so `null` here is a broken invariant.
 */
export function cookedLineFeeds(quasi: { readonly value: { readonly cooked: string | null } }): number {
  const { cooked } = quasi.value;
  if (cooked === null) throw new Error('Unreachable: an untagged template literal cannot hold an invalid escape, so its cooked value is never null.');

  return cooked.split('\n').length - 1;
}

interface Lines {
  readonly lines: readonly (readonly Part[])[];
}

/**
 * Splits a template literal into the lines its cooked value has, or returns `undefined` when it cannot show that the pieces join back to exactly that value. A line ends at a real line feed and at an `\n` escape. Every other escape is carried over unchanged, which is sound because a backslash escape means the same in a single-quoted string as in a template; the exceptions are refused: a line continuation, a carriage return or Unicode separator in the source, and an octal-looking escape. A final count check compares the breaks found with the line feeds in the cooked value; it is what refuses a `\x` or `\u` escape that spells a line feed, which is carried over as text and so leaves the cooked value with a line feed the scanner did not count, and it stops any other escape this scanner mis-reads.
 */
function splitTemplate(sourceCode: Readonly<TSESLint.SourceCode>, node: TSESTree.TemplateLiteral): Lines | undefined {
  const lines: Part[][] = [[]];
  const emit = (part: Part): void => {
    const line = lines[lines.length - 1];
    if (line === undefined) throw new Error('Unreachable: the line list always holds the line being built.');
    line.push(part);
  };
  let breaks = 0;
  const breakLine = (): void => {
    breaks += 1;
    lines.push([]);
  };

  for (const [quasiIndex, quasi] of node.quasis.entries()) {
    const { raw } = quasi.value;
    for (let index = 0; index < raw.length; ) {
      const character = raw.charAt(index);
      if (UNSUPPORTED_LINE_ENDINGS.has(character)) return undefined;
      if (character === '\n') {
        breakLine();
        index += 1;
        continue;
      }
      if (character === "'") {
        emit({ kind: 'quote' });
        index += 1;
        continue;
      }
      if (character !== '\\') {
        emit({ kind: 'text', value: character });
        index += 1;
        continue;
      }
      const rest = raw.slice(index + 1);
      const next = rest.charAt(0);
      if (next === 'n') {
        breakLine();
        index += 2;
      } else if (next === 'x' || next === 'u') {
        const match = (next === 'x' ? HEX_ESCAPE : UNICODE_ESCAPE).exec(rest);
        if (match === null) return undefined;
        emit({ kind: 'text', value: `\\${match[0]}` });
        index += 1 + match[0].length;
      } else if (isDecimalDigit(next)) {
        if (next !== '0' || isDecimalDigit(rest.charAt(1))) return undefined;
        emit({ kind: 'text', value: '\\0' });
        index += 2;
      } else if (next === '`') {
        emit({ kind: 'backtick' });
        index += 2;
      } else if (next === '$') {
        emit({ kind: 'dollar' });
        index += 2;
      } else {
        const codePoint = rest.codePointAt(0);
        if (codePoint === undefined || next === '\n' || UNSUPPORTED_LINE_ENDINGS.has(next)) return undefined;
        const escaped = String.fromCodePoint(codePoint);
        emit({ kind: 'text', value: `\\${escaped}` });
        index += 1 + escaped.length;
      }
    }
    const following = node.quasis[quasiIndex + 1];
    // A TemplateElement's range covers its delimiters, so the substitution runs from the `$` of this quasi's closing `${` to the `}` of the next quasi's opening one.
    if (following !== undefined) emit({ kind: 'expression', source: sourceCode.text.slice(quasi.range[1] - 2, following.range[0] + 1) });
  }
  const cookedBreaks = node.quasis.reduce((total, quasi) => total + cookedLineFeeds(quasi), 0);

  return breaks === cookedBreaks ? { lines } : undefined;
}

function renderPart(part: Part, inTemplate: boolean): string {
  if (part.kind === 'text') return part.value;
  if (part.kind === 'quote') return inTemplate ? "'" : "\\'";
  if (part.kind === 'backtick') return inTemplate ? '\\`' : '`';
  if (part.kind === 'dollar') return inTemplate ? '\\$' : '$';

  return part.source;
}

/**
 * A line with no substitution becomes a single-quoted string; one with a substitution stays a template literal (now on a single line, so the rule does not report it again).
 */
function renderLine(line: readonly Part[]): string {
  const inTemplate = line.some((part) => part.kind === 'expression');
  const body = line.map((part) => renderPart(part, inTemplate)).join('');

  return inTemplate ? `\`${body}\`` : `'${body}'`;
}

/**
 * Whether the template sits where TypeScript needs its literal type, which `[...].join('\n')` (a plain `string`) does not have: under a `const` assertion, a type assertion or `satisfies`, as a string enum member's initialiser, or as the initialiser of a declaration with a type annotation, whose annotation may be a literal type. Containers (an array, an object, a property, a non-null assertion) are looked through, so an object under `as const` is covered. Without type information the contextual type of an argument, a return value or an assignment target cannot be known, so those positions are still fixed.
 */
function needsLiteralType(node: TSESTree.TemplateLiteral): boolean {
  let child: TSESTree.Node = node;
  for (let parent: TSESTree.Node | undefined = node.parent; parent !== undefined; child = parent, parent = parent.parent) {
    if (parent.type === AST_NODE_TYPES.TSAsExpression || parent.type === AST_NODE_TYPES.TSSatisfiesExpression || parent.type === AST_NODE_TYPES.TSTypeAssertion) return true;
    if (parent.type === AST_NODE_TYPES.TSEnumMember) return parent.initializer === child;
    if (parent.type === AST_NODE_TYPES.VariableDeclarator) return parent.init === child && parent.id.typeAnnotation !== undefined;
    if (parent.type === AST_NODE_TYPES.PropertyDefinition) return parent.value === child && parent.typeAnnotation !== undefined;
    const isContainer =
      parent.type === AST_NODE_TYPES.TSNonNullExpression || parent.type === AST_NODE_TYPES.ArrayExpression || parent.type === AST_NODE_TYPES.ObjectExpression || parent.type === AST_NODE_TYPES.Property;
    if (!isContainer) return false;
  }

  return false;
}

/**
 * The text before `node` on its first line, reduced to the whitespace it starts with, so the array elements can be indented one level deeper than the statement holding the template.
 */
function indentationOf(sourceCode: Readonly<TSESLint.SourceCode>, node: TSESTree.Node): string {
  const lineText = sourceCode.lines[node.loc.start.line - 1] ?? '';

  return /^[\t ]*/u.exec(lineText)?.[0] ?? '';
}

type MessageIds = 'multiline';

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

/**
 * Reports an untagged template literal whose cooked value contains a line feed and rewrites it to `['line one', 'line two'].join('\n')` when the rewrite provably yields the same string and the template is not in a position that needs its literal type. A tagged template is never reported: the tag receives the literal's pieces, so joining them would change what it is called with, and multi-line tagged templates (`sql`, `css`, `markdown`) are the point of the syntax. No type information is read.
 */
const noMultilineTemplateLiteral = createRule<[unknown], MessageIds>({
  name: 'no-multiline-template-literal',
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description: 'Disallow an untagged template literal whose value spans several lines; build it from an array of lines joined with a newline instead.',
    },
    schema: [noMultilineTemplateLiteralSchema],
    messages: {
      multiline: 'This template literal spans several lines. Write it as an array of lines and join them with "\\n", so each line stands alone and the indentation of the source is not part of the string.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const allowed = readNoMultilineTemplateLiteralOptions(options);
    if (allowed?.(context.filename, context.cwd) === true) return {};
    const { sourceCode } = context;

    return {
      TemplateLiteral(node) {
        if (node.parent.type === AST_NODE_TYPES.TaggedTemplateExpression && node.parent.quasi === node) return;
        if (!node.quasis.some((quasi) => cookedLineFeeds(quasi) > 0)) return;
        const split = needsLiteralType(node) ? undefined : splitTemplate(sourceCode, node);
        context.report({
          node,
          messageId: 'multiline',
          ...(split !== undefined && {
            fix(fixer) {
              const indent = indentationOf(sourceCode, node);
              const step = indent.includes('\t') ? '\t' : '  ';
              const elements = split.lines.map((line) => `${indent}${step}${renderLine(line)}`);

              return fixer.replaceText(node, `[\n${elements.join(',\n')}\n${indent}].join('\\n')`);
            },
          }),
        });
      },
    };
  },
});

export default noMultilineTemplateLiteral;
