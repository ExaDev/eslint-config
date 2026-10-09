import { basename, dirname } from 'node:path';
import type { MarkdownRuleDefinition } from '@eslint/markdown';
import { isRecord } from '../is-record';
import { parseFrontmatter } from './skill-document';

/**
 * The longest `name` the Agent Skills specification allows (https://agentskills.io/specification). Longer names are rejected by agents that validate against it.
 */
export const MAX_SKILL_NAME_LENGTH = 64;

/**
 * The longest `description` the Agent Skills specification allows (https://agentskills.io/specification). Agents load every description into context up front, so an over-long one is also costly.
 */
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;

// Lower-case letters and digits in hyphen-separated runs: the specification's shape for a skill name, which also keeps a name safe to use as a directory name and a slash-command suffix.
const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/u;

export type SkillFrontmatterMessageIds =
  | 'missingFrontmatter'
  | 'invalidYaml'
  | 'notMapping'
  | 'invalidName'
  | 'nameFormat'
  | 'nameTooLong'
  | 'nameMismatch'
  | 'invalidDescription'
  | 'descriptionTooLong'
  | 'invalidInternal';

export type SkillFrontmatterRuleDefinition = MarkdownRuleDefinition<{
  RuleOptions: [];
  MessageIds: SkillFrontmatterMessageIds;
}>;

/**
 * One finding about a frontmatter mapping: the message to report and the values its text interpolates.
 */
export interface SkillFrontmatterProblem {
  readonly messageId: SkillFrontmatterMessageIds;
  readonly data: Readonly<Record<string, string>>;
}

// Counts Unicode code points, the specification's "characters", so a description of emoji is not counted twice over as UTF-16 code units.
function lengthOf(text: string): number {
  return Array.from(text).length;
}

function nameProblems(name: unknown, directory: string): readonly SkillFrontmatterProblem[] {
  if (typeof name !== 'string' || name.length === 0) return [{ messageId: 'invalidName', data: {} }];
  const problems: SkillFrontmatterProblem[] = [];
  if (!SKILL_NAME_PATTERN.test(name)) problems.push({ messageId: 'nameFormat', data: { name } });
  if (lengthOf(name) > MAX_SKILL_NAME_LENGTH) problems.push({ messageId: 'nameTooLong', data: { max: String(MAX_SKILL_NAME_LENGTH) } });
  if (name !== directory) problems.push({ messageId: 'nameMismatch', data: { name, directory } });

  return problems;
}

function descriptionProblems(description: unknown): readonly SkillFrontmatterProblem[] {
  // A description of only whitespace tells the model that reads it nothing, so it counts as empty. The length limit counts the value as written, untrimmed: the limit is on what the loader puts in front of the model, and a block scalar's trailing newline is part of that.
  if (typeof description !== 'string' || description.trim().length === 0) return [{ messageId: 'invalidDescription', data: {} }];
  if (lengthOf(description) > MAX_SKILL_DESCRIPTION_LENGTH) return [{ messageId: 'descriptionTooLong', data: { max: String(MAX_SKILL_DESCRIPTION_LENGTH) } }];

  return [];
}

function internalProblems(metadata: unknown): readonly SkillFrontmatterProblem[] {
  if (!isRecord(metadata) || !('internal' in metadata)) return [];

  return typeof metadata['internal'] === 'boolean' ? [] : [{ messageId: 'invalidInternal', data: {} }];
}

/**
 * Checks a parsed SKILL.md frontmatter mapping against the parts of the Agent Skills specification that decide whether a skill loads: `name` (non-empty, hyphenated lower case, within its length limit, equal to `directory`), `description` (not empty or only whitespace, within its length limit) and `metadata.internal` (a boolean when present). Any other key is accepted, since the specification keeps growing (`argument-hint`, `disable-model-invocation`, `allowed-tools`, `model` and `metadata` among them). `directory` is the name of the directory holding the SKILL.md.
 */
export function checkSkillFrontmatter(frontmatter: Readonly<Record<string, unknown>>, directory: string): readonly SkillFrontmatterProblem[] {
  return [...nameProblems(frontmatter['name'], directory), ...descriptionProblems(frontmatter['description']), ...internalProblems(frontmatter['metadata'])];
}

/**
 * Requires a SKILL.md to start with YAML frontmatter that is a mapping and passes `checkSkillFrontmatter`. The skills CLI silently skips a skill with no `name`, and a `name` that differs from the directory makes the same skill answer to two identifiers (the slash command Claude Code derives from the directory, and the name other agents list). Runs under `markdown/gfm` with `frontmatter: 'yaml'`, so the block is a node of its own; `agentSkillsConfig` wires that. The rule needs no options.
 */
export const skillFrontmatter: SkillFrontmatterRuleDefinition = {
  meta: {
    type: 'problem',
    languages: ['markdown/commonmark', 'markdown/gfm'],
    docs: {
      recommended: false,
      description: 'Require a SKILL.md to start with valid Agent Skills frontmatter: a name equal to its directory and a description within the specified limits.',
      url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/skill-frontmatter.ts',
    },
    schema: [],
    messages: {
      missingFrontmatter: 'A SKILL.md must start with a YAML frontmatter block, or the skills CLI cannot list it.',
      invalidYaml: 'The frontmatter is not valid YAML: {{message}}',
      notMapping: 'The frontmatter must be a YAML mapping of keys to values.',
      invalidName: 'The frontmatter must set "name" to a non-empty string, or the skills CLI skips the skill.',
      nameFormat: 'The skill name "{{name}}" must be lower-case letters and digits in hyphen-separated runs.',
      nameTooLong: 'The skill name must be at most {{max}} characters.',
      nameMismatch: 'The skill name "{{name}}" must equal its directory name "{{directory}}".',
      invalidDescription: 'The frontmatter must set "description" to a string with text in it; agents match it against the task.',
      descriptionTooLong: 'The skill description must be at most {{max}} characters.',
      invalidInternal: '"metadata.internal" must be a boolean.',
    },
  },
  create(context) {
    const directory = basename(dirname(context.filename));
    let seenFrontmatter = false;

    return {
      yaml(node) {
        seenFrontmatter = true;
        const parsed = parseFrontmatter(node.value);
        if (parsed.kind === 'invalid') {
          context.report({ node, messageId: 'invalidYaml', data: { message: parsed.message } });
        } else if (parsed.kind === 'other') {
          context.report({ node, messageId: 'notMapping' });
        } else {
          for (const { messageId, data } of checkSkillFrontmatter(parsed.value, directory)) context.report({ node, messageId, data });
        }
      },
      'root:exit'() {
        if (!seenFrontmatter) context.report({ loc: { line: 1, column: 1 }, messageId: 'missingFrontmatter' });
      },
    };
  },
};

export default skillFrontmatter;
