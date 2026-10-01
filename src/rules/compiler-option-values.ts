import * as ts from 'typescript';
import { isRecord } from '../is-record';

/**
 * A compiler option's value as the rule compares it: a boolean flag, an enum member (TypeScript stores `target: "es2022"` as the enum's number), a string, or `undefined` when the option is unset and TypeScript documents no plain default for it.
 */
export type CompilerOptionValue = boolean | number | string | undefined;

/**
 * One required compiler option: its name, the values it may take (already converted to the representation `ts.CompilerOptions` holds), and the spellings the person wrote, kept for messages.
 */
export interface CompilerOptionRequirement {
  readonly name: string;
  readonly accepted: readonly CompilerOptionValue[];
  readonly spelled: readonly string[];
}

interface OptionDeclaration {
  readonly name: string;
  // 'boolean', 'string', 'number', 'list', 'object', or a Map from the tsconfig spelling to the enum member for an enum-valued option.
  readonly type: unknown;
  // A plain boolean or enum member for an option with a fixed default; a diagnostic message object for one whose default depends on other options.
  readonly defaultValueDescription: unknown;
}

const UNSUPPORTED_COMPILER = 'requires TypeScript 5.4 or later: the installed compiler does not expose the option metadata (`optionDeclarations`, `computedOptions`) the rule reads to work out an option\'s effective value.';

function isOptionDeclaration(value: unknown): value is OptionDeclaration {
  return isRecord(value) && typeof value['name'] === 'string' && 'type' in value && 'defaultValueDescription' in value;
}

// `optionDeclarations` and `computedOptions` are exported by the compiler at run time but are not part of its published typings. They are the compiler's own record of every option and of how it derives an option's effective value from the others, so reading them is the only way to agree with `tsc` for options such as `strictNullChecks` (which follows `strict`) without restating its rules.
function declarations(): readonly OptionDeclaration[] {
  const exported: unknown = Reflect.get(ts, 'optionDeclarations');
  if (!Array.isArray(exported)) throw new Error(`@exadev/eslint-config: "exadev/require-compiler-options" ${UNSUPPORTED_COMPILER}`);

  return exported.filter(isOptionDeclaration);
}

function declarationOf(name: string): OptionDeclaration | undefined {
  return declarations().find((declaration) => declaration.name === name);
}

function computedValue(options: ts.CompilerOptions, name: string): unknown {
  const computed: unknown = Reflect.get(ts, 'computedOptions');
  if (!isRecord(computed)) throw new Error(`@exadev/eslint-config: "exadev/require-compiler-options" ${UNSUPPORTED_COMPILER}`);
  const entry = computed[name];
  if (!isRecord(entry) || typeof entry['computeValue'] !== 'function') return options[name];

  return Reflect.apply(entry['computeValue'], entry, [options]);
}

/**
 * Whether `value` is one of the scalar kinds a compiler option comparison can hold: a boolean, number or string.
 */
export function isScalarOptionValue(value: unknown): value is boolean | number | string {
  return typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string';
}

function toOptionValue(value: unknown): CompilerOptionValue {
  return isScalarOptionValue(value) ? value : undefined;
}

/**
 * The compiler options of the configuration `program` was created from, as `tsc` resolves them: `extends` followed, nothing else added. This re-reads the tsconfig named by the program's `configFilePath` instead of trusting `program.getCompilerOptions()`, because typescript-eslint overrides `noEmit`, `noUnusedLocals`, `noUnusedParameters`, `allowJs` and `checkJs` in the programs it builds, so those would always look satisfied. A program with no tsconfig behind it (`configFilePath` unset) has nothing to re-read and its own options are returned. Throws, quoting the compiler, when the tsconfig cannot be read or parsed.
 */
export function resolveCompilerOptions(program: ts.Program): ts.CompilerOptions {
  const programOptions = program.getCompilerOptions();
  const configFilePath = programOptions['configFilePath'];
  if (typeof configFilePath !== 'string') return programOptions;
  const parsed = ts.getParsedCommandLineOfConfigFile(configFilePath, undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(`@exadev/eslint-config: "exadev/require-compiler-options" cannot read ${configFilePath}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
    },
  });
  if (parsed === undefined) throw new Error(`@exadev/eslint-config: "exadev/require-compiler-options" cannot read ${configFilePath}.`);

  return parsed.options;
}

/**
 * The value TypeScript acts on for `name`: the compiler's own derivation where it has one (`strictNullChecks` follows `strict`, `target` has a version-dependent default), otherwise the value written in the resolved configuration, otherwise the plain default its option metadata documents. `undefined` means the option is unset and its default is not a fixed value (`allowUnreachableCode`, whose unset state is neither true nor false).
 */
export function effectiveCompilerOption(options: ts.CompilerOptions, name: string): CompilerOptionValue {
  const computed = toOptionValue(computedValue(options, name));
  if (computed !== undefined) return computed;
  const documented = declarationOf(name)?.defaultValueDescription;

  return typeof documented === 'boolean' || typeof documented === 'number' ? documented : undefined;
}

/**
 * Converts one accepted value to the representation `ts.CompilerOptions` holds, using the compiler's own tsconfig parser so `"es2022"` becomes the `ScriptTarget` it names. Throws, quoting the compiler's message, for an unknown option, a value the option does not accept, or a list-valued option.
 */
function convertValue(name: string, value: boolean | number | string): CompilerOptionValue {
  const { options, errors } = ts.convertCompilerOptionsFromJson({ [name]: value }, '');
  const [first] = errors;
  if (first !== undefined) {
    throw new Error(`@exadev/eslint-config: "exadev/require-compiler-options" cannot require ${name}: ${JSON.stringify(value)}: ${ts.flattenDiagnosticMessageText(first.messageText, ' ')}`);
  }

  return toOptionValue(options[name]);
}

/**
 * Turns one entry of the rule's option object (`true`, `false`, or a list of accepted values) into a requirement. A list of one is the same as the bare value.
 */
export function parseRequirement(name: string, specification: boolean | readonly (boolean | number | string)[]): CompilerOptionRequirement {
  const spelled = typeof specification === 'boolean' ? [specification] : specification;

  return { name, accepted: spelled.map((value) => convertValue(name, value)), spelled: spelled.map(String) };
}

/**
 * The tsconfig spelling of `value` for `name`: the enum member's name for an enum-valued option, `true` or `false` for a flag, and `not set` when the option has no effective value.
 */
export function describeCompilerOptionValue(name: string, value: CompilerOptionValue): string {
  if (value === undefined) return 'not set';
  const type = declarationOf(name)?.type;
  if (type instanceof Map) {
    const spelling = [...type].find(([, member]) => member === value);
    if (spelling !== undefined) return String(spelling[0]);
  }

  return String(value);
}
