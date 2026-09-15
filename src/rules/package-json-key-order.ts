import type { ArrayNode, ElementNode, MemberNode, ObjectNode, StringNode, ValueNode } from '@humanwhocodes/momoa';
import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';

export type PackageJsonKeyOrderMessageIds = 'outOfOrder';

export interface PackageJsonKeyOrderOptions {
  // Matches syncpack's own `sortFirst` default: these top-level keys are pinned to the front, in this exact order, whichever of them are actually present. Every other top-level key is sorted after them.
  readonly sortFirst?: readonly string[];
  // Matches syncpack's own `sortAz` default: the object/array VALUE of each of these keys has its own members/elements sorted.
  readonly sortAz?: readonly string[];
}

export const DEFAULT_SORT_FIRST: readonly string[] = ['name', 'description', 'version', 'author'];
export const DEFAULT_SORT_AZ: readonly string[] = [
  'bin',
  'contributors',
  'dependencies',
  'devDependencies',
  'keywords',
  'peerDependencies',
  'resolutions',
  'scripts',
];

type CharCategory = 0 | 1 | 2;

// Empirically reverse-engineered from real `syncpack@15` output (a Rust rewrite with no JS source to read directly): a per-character comparison where a symbol/punctuation character always sorts before a digit, which always sorts before a letter, and only characters in the same category are compared by their own code point (letters case-folded). Confirmed directly: syncpack orders "@a", "_a", "~a" (three symbols with codepoints below, between, and above the digit/letter range) all before "1a" and "aa", which no locale-aware `localeCompare`/`Intl.Collator` behavior reproduces -- those keep symbols separated from letters but not from digits, and order the symbols themselves differently to real syncpack output. This is the sole source of truth for what "the same order `syncpack format` would produce" means in this rule; it is not derived from syncpack's own documentation, which doesn't specify a collation this precisely.
function categorize(char: string): CharCategory {
  if (char >= '0' && char <= '9') return 1;
  if (/[a-z]/iu.test(char)) return 2;
  return 0;
}

/** Case-insensitive, symbol-before-digit-before-letter comparison matching real `syncpack format` output. Returns a negative number if `a` sorts before `b`, positive if after, zero if equal. */
export function compareSyncpackKey(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const charA = a[index] ?? '';
    const charB = b[index] ?? '';
    const categoryA = categorize(charA);
    const categoryB = categorize(charB);
    if (categoryA !== categoryB) return categoryA - categoryB;
    const foldedA = categoryA === 2 ? charA.toLowerCase() : charA;
    const foldedB = categoryB === 2 ? charB.toLowerCase() : charB;
    if (foldedA !== foldedB) return foldedA < foldedB ? -1 : 1;
  }
  return a.length - b.length;
}

/**
 * The pure decision for an adjacent pair of top-level keys, independent of ESLint/momoa: given syncpack's own `sortFirst` list, is `curr` allowed to immediately follow `prev`? A pinned key (present in `sortFirst`) must appear in exactly `sortFirst`'s own order; every other key sorts after every pinned key, and among themselves by `compareSyncpackKey`. Kept separate from `create()` below so it can be unit-tested directly, matching the same pattern `no-uphill-dependency`'s `checkDependencies` in the monorepo-template uses.
 */
export function isValidTopLevelOrder(prev: string, curr: string, sortFirst: readonly string[]): boolean {
  const prevIndex = sortFirst.indexOf(prev);
  const currIndex = sortFirst.indexOf(curr);
  if (prevIndex !== -1 && currIndex !== -1) return prevIndex < currIndex;
  if (prevIndex !== -1) return true;
  if (currIndex !== -1) return false;
  return compareSyncpackKey(prev, curr) <= 0;
}

/** The pure decision for an adjacent pair of keys/elements inside a `sortAz`-listed field's own object or array value: plain `compareSyncpackKey` order, no pinning. */
export function isValidSortAzOrder(prev: string, curr: string): boolean {
  return compareSyncpackKey(prev, curr) <= 0;
}

/**
 * The target permutation for a whole container's own keys, given a comparator over adjacent pairs (either `isValidTopLevelOrder`-shaped or `isValidSortAzOrder`-shaped). Returns, for each output position, the ORIGINAL index of the key that belongs there -- e.g. `[2, 0, 1]` means the key currently at index 2 comes first. A stable sort (ties keep their original relative order), matching real syncpack output for keys that compare equal (see `compareSyncpackKey`'s own case-insensitive-letter test case).
 *
 * Reordering by computing this full permutation once, rather than reporting and fixing one out-of-order adjacent pair at a time (the technique `@eslint/json`'s own `sort-keys` rule uses), is deliberate: an adjacent-swap fixer only makes one pass of bubble-sort-style progress per lint pass, and a realistically scrambled `package.json` (many top-level keys all needing to move several positions, several nested objects also needing sorting) was confirmed directly to need up to 11 fix passes to fully converge -- one more than ESLint's own `Linter#verifyAndFix` will ever run (`MAX_AUTOFIX_PASSES` is 10), meaning a single real `eslint --fix` invocation could leave such a file only partially reordered. Computing the whole target order up front and replacing every affected key's position in one combined fix converges in a single pass regardless of how scrambled the input is.
 */
export function computeOrderPermutation(keys: readonly string[], isValidOrder: (prev: string, curr: string) => boolean): number[] {
  const indices = keys.map((_, index) => index);
  return indices
    .map((index) => ({ key: keys[index] ?? '', index }))
    .sort((a, b) => {
      if (isValidOrder(a.key, b.key) && isValidOrder(b.key, a.key)) return a.index - b.index;
      return isValidOrder(a.key, b.key) ? -1 : 1;
    })
    .map((entry) => entry.index);
}

function isIdentityPermutation(permutation: readonly number[]): boolean {
  return permutation.every((originalIndex, position) => originalIndex === position);
}

function isStringNode(node: ValueNode): node is StringNode {
  return node.type === 'String';
}

function getMemberKeyName(member: MemberNode): string | undefined {
  return member.name.type === 'String' ? member.name.value : undefined;
}

interface Ranged {
  readonly range?: readonly [number, number];
}

function hasRange<T extends Ranged>(node: T): node is T & { range: readonly [number, number] } {
  return node.range !== undefined;
}

export type PackageJsonKeyOrderRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [PackageJsonKeyOrderOptions];
  MessageIds: PackageJsonKeyOrderMessageIds;
}>;

const commentTypes = new Set(['LineComment', 'BlockComment']);

/**
 * Enforces the same `package.json` key order `syncpack format` would produce: `sortFirst` fields pinned to the top in that exact order, then every other top-level key alphabetically; and, inside each `sortAz`-listed field's own object or array value, its members/elements sorted the same way (no pinning there -- `sortFirst` only ever applies at the top level).
 *
 * This exists so a project using `@exadev/eslint-config` without syncpack still gets real `package.json` canonicalization, and so a project using both never sees them fight: `eslint --fix` and `syncpack format` converge on the identical output, confirmed directly against real `syncpack@15` output rather than assumed from its docs (see `compareSyncpackKey`'s own comment). Deliberately narrower than `@eslint/json`'s own `sort-keys` rule, which only supports a single alphabetical order for every key with no field-specific pinning -- not a fit for syncpack's own two-tier scheme.
 *
 * Not part of `plugin.configs.recommended`: opt-in, the same tri-state shape as `react`/`nextjs` (see `docs.md`'s own usage example), since a project without syncpack needs to choose this deliberately, and a project with syncpack needs to confirm the two tools agree before turning it on.
 */
export const packageJsonKeyOrder: PackageJsonKeyOrderRuleDefinition = {
  meta: {
    type: 'layout',
    fixable: 'code',
    languages: ['json/json', 'json/jsonc'],
    docs: {
      recommended: false,
      description: "Require package.json keys to be ordered the same way `syncpack format` would order them.",
      url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/package-json-key-order.ts',
    },
    schema: [
      {
        type: 'object',
        properties: {
          sortFirst: { type: 'array', items: { type: 'string' } },
          sortAz: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{}],
    messages: {
      outOfOrder:
        'This key order does not match the order "syncpack format" would produce: "{{curr}}" should come before "{{prev}}" here.',
    },
  },

  create(context) {
    const [options] = context.options;
    const sortFirst = options.sortFirst ?? DEFAULT_SORT_FIRST;
    const sortAz = new Set(options.sortAz ?? DEFAULT_SORT_AZ);
    const { sourceCode } = context;

    function hasAdjacentComment(node: MemberNode | ValueNode): boolean {
      const before = sourceCode.getTokenBefore(node, { includeComments: true });
      let after = sourceCode.getTokenAfter(node, { includeComments: true });
      if (after?.type === 'Comma') {
        after = sourceCode.getTokenAfter(after, { includeComments: true });
      }
      return (before !== null && commentTypes.has(before.type)) || (after !== null && commentTypes.has(after.type));
    }

    // Rewrites `nodes` into `permutation`'s order in one string, reusing each node's own original source text and each ORIGINAL positional gap's own separator text (the comma, and whatever whitespace/newline/indentation surrounds it) between slots -- never a separator tied to a particular node's content, since it's the position, not the node, that owns a given gap's formatting.
    function buildReorderedText(nodes: readonly (MemberNode | ValueNode)[], permutation: readonly number[]): string {
      const separators = nodes.slice(0, -1).map((node, index) => {
        const next = nodes[index + 1];
        return hasRange(node) && next !== undefined && hasRange(next) ? sourceCode.text.slice(node.range[1], next.range[0]) : '';
      });
      return permutation.reduce<string>((result, originalIndex, position) => {
        const text = sourceCode.getText(nodes[originalIndex]);
        return position === 0 ? text : `${result}${separators[position - 1] ?? ''}${text}`;
      }, '');
    }

    // Every node's own range as a plain tuple, or undefined the moment any node lacks one -- fails closed rather than reaching for a non-null assertion on an optional field.
    function getNodeRanges(nodes: readonly Ranged[]): readonly (readonly [number, number])[] | undefined {
      const ranges: (readonly [number, number])[] = [];
      for (const node of nodes) {
        if (!hasRange(node)) return undefined;
        ranges.push(node.range);
      }
      return ranges;
    }

    function reportWholeContainerReorder<T extends MemberNode | ValueNode>(
      nodes: readonly T[],
      keys: readonly string[],
      isValidOrder: (prev: string, curr: string) => boolean,
      reportLoc: (node: T) => { readonly line: number; readonly column: number },
    ): void {
      const permutation = computeOrderPermutation(keys, isValidOrder);
      if (isIdentityPermutation(permutation)) return;

      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      // A non-identity permutation implies at least two entries, so both are structurally always defined here -- these checks exist to satisfy strict indexed access without a non-null assertion, not because either can genuinely be absent.
      if (firstNode === undefined || lastNode === undefined) return;

      let violationIndex = 1;
      for (let index = 1; index < keys.length; index += 1) {
        if (!isValidOrder(keys[index - 1] ?? '', keys[index] ?? '')) {
          violationIndex = index;
          break;
        }
      }

      context.report({
        loc: reportLoc(nodes[violationIndex] ?? firstNode),
        messageId: 'outOfOrder',
        data: { curr: keys[violationIndex] ?? '', prev: keys[violationIndex - 1] ?? '' },
        fix(fixer) {
          const ranges = getNodeRanges(nodes);
          if (ranges === undefined || nodes.some((node) => hasAdjacentComment(node))) return null;
          const firstRange = ranges[0];
          const lastRange = ranges[ranges.length - 1];
          if (firstRange === undefined || lastRange === undefined) return null;
          const rewritten = buildReorderedText(nodes, permutation);
          return fixer.replaceTextRange([firstRange[0], lastRange[1]], rewritten);
        },
      });
    }

    function checkMembers(members: readonly MemberNode[], isValidOrder: (prev: string, curr: string) => boolean): void {
      const keys: string[] = [];
      for (const member of members) {
        const key = getMemberKeyName(member);
        if (key === undefined) return;
        keys.push(key);
      }
      reportWholeContainerReorder(members, keys, isValidOrder, (member) => member.name.loc.start);
    }

    function checkElements(elements: readonly ElementNode[]): void {
      const stringValues: StringNode[] = [];
      for (const element of elements) {
        if (!isStringNode(element.value)) return;
        stringValues.push(element.value);
      }
      reportWholeContainerReorder(
        stringValues,
        stringValues.map((value) => value.value),
        isValidSortAzOrder,
        (value) => value.loc.start,
      );
    }

    return {
      Object(node: ObjectNode, parent) {
        if (parent === undefined) return;
        if (parent.type === 'Document') {
          checkMembers(node.members, (prev, curr) => isValidTopLevelOrder(prev, curr, sortFirst));
          return;
        }
        if (parent.type === 'Member') {
          const key = getMemberKeyName(parent);
          if (key !== undefined && sortAz.has(key)) checkMembers(node.members, isValidSortAzOrder);
        }
      },
      Array(node: ArrayNode, parent) {
        if (parent?.type !== 'Member') return;
        const key = getMemberKeyName(parent);
        if (key !== undefined && sortAz.has(key)) checkElements(node.elements);
      },
    } satisfies JSONRuleVisitor;
  },
};

export default packageJsonKeyOrder;
