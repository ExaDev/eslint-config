import { defineConfig } from 'eslint/config';
import { importPolicyConfig } from './index';

type DefinedConfig = ReturnType<typeof defineConfig>;

/* The recipes in README.md's "Import-policy recipes" section, each written exactly as the README shows it after `...exadevConfig()`. Like readme-examples.ts, nothing here is bundled (only src/index.ts is), and tsc typechecks every recipe; import-policy-recipes.unit.test.ts lints code through each one with ESLint, so a recipe that stops reporting what the README says it reports fails a test. Each recipe is a function, so a recipe whose config throws fails its own test rather than the whole file's import. */

/**
 * A no-restricted-syntax entry: an esquery selector and the message reported where it matches.
 */
export interface RestrictedSyntax {
  readonly selector: string;
  readonly message: string;
}

/**
 * The message of every `telemetryContentFlags` entry.
 */
export const TELEMETRY_MESSAGE = 'telemetry content recording is set in src/telemetry/settings.ts only';

/**
 * Telemetry content recording is switched on or off in one settings module, so a call site cannot start recording prompts and completions on its own.
 */
export const telemetryContentFlags: readonly RestrictedSyntax[] = [
  { selector: 'ObjectExpression > Property:matches([key.name=/^record(Inputs|Outputs)$/], [key.value=/^record(Inputs|Outputs)$/])', message: TELEMETRY_MESSAGE },
];

/**
 * The message of every `providerKeyReads` entry.
 */
export const PROVIDER_KEY_MESSAGE = 'browser code is shipped to the user, so provider keys are read on the server only';

/**
 * Reads of key-shaped environment variables (`*_API_KEY`, `*_SECRET`, `*_TOKEN`), as a member, a string-indexed member, or a destructured property of `process.env`.
 */
export const providerKeyReads: readonly RestrictedSyntax[] = [
  {
    selector: "MemberExpression[object.object.name='process'][object.property.name='env']:matches([property.name=/_(API_KEY|SECRET|TOKEN)$/], [property.value=/_(API_KEY|SECRET|TOKEN)$/])",
    message: PROVIDER_KEY_MESSAGE,
  },
  {
    selector: "VariableDeclarator[init.object.name='process'][init.property.name='env'] > ObjectPattern > Property:matches([key.name=/_(API_KEY|SECRET|TOKEN)$/], [key.value=/_(API_KEY|SECRET|TOKEN)$/])",
    message: PROVIDER_KEY_MESSAGE,
  },
];

/**
 * The message of every `inlineRoleChecks` entry.
 */
export const ROLE_MESSAGE = 'check permissions through the can() policy helper, not by comparing roles in a handler';

/**
 * A `role` property compared with `===`, `!==`, `==` or `!=`, switched on, or passed to `.includes()`.
 */
export const inlineRoleChecks: readonly RestrictedSyntax[] = [
  { selector: "BinaryExpression[operator=/^[!=]==?$/] > MemberExpression[property.name='role']", message: ROLE_MESSAGE },
  { selector: "SwitchStatement > MemberExpression.discriminant[property.name='role']", message: ROLE_MESSAGE },
  { selector: "CallExpression[callee.property.name='includes'] > MemberExpression.arguments[property.name='role']", message: ROLE_MESSAGE },
];

/**
 * README "A vendor SDK behind its adapter": the SDK confined to its adapter directory, and both kept out of deterministic workflow code.
 */
export function buildVendorSdkRecipe(): DefinedConfig {
  return defineConfig(
    ...importPolicyConfig([
      {
        files: ['src/**'],
        ignores: ['src/**/*.test.ts'],
        confine: [{ specifiers: ['@vendor/model-sdk'], onlyIn: ['src/adapters/model/**'], message: 'call the model through src/adapters/model, which owns the vendor SDK' }],
      },
      {
        files: ['src/workflows/**'],
        deny: [
          {
            specifiers: ['@vendor/model-sdk', 'src/adapters/model'],
            allowTypeImports: true,
            message: 'workflow code is replayed and must be deterministic; call the model from an activity',
          },
        ],
      },
    ]),
  );
}

/**
 * README "Test doubles, fixtures and conformance kits stay out of shipped code": one deny list over every shipped file, with computed specifiers reported.
 */
export function buildTestOnlyModulesRecipe(): DefinedConfig {
  return defineConfig(
    ...importPolicyConfig([
      {
        files: ['src/**'],
        ignores: ['src/**/*.test.ts', 'src/**/*.fake.ts', 'src/testing/**'],
        deny: [
          {
            specifiers: ['src/testing', 'src/**/__fixtures__', 'src/**/*.fake{,.js}', '@scope/*/testing', '@scope/*/conformance'],
            message: 'test doubles, fixtures and conformance kits stay out of shipped code; import them from tests only',
          },
        ],
        computedSpecifiers: 'report',
      },
    ]),
  );
}

/**
 * README "Handlers built only from the authenticated procedure": an allow list of names from the procedures module, the RPC server package kept out of routers, and one exact exception.
 */
export function buildAuthenticatedHandlersRecipe(): DefinedConfig {
  return defineConfig(
    ...importPolicyConfig([
      {
        files: ['src/server/routers/**'],
        deny: [
          {
            specifiers: ['src/server/procedures'],
            allowImportNames: ['router', 'protectedProcedure'],
            allowTypeImports: true,
            message: 'every handler requires a signed-in caller; build it from protectedProcedure',
          },
          { specifiers: ['@scope/rpc-server'], allowTypeImports: true, message: 'procedures are built in src/server/procedures, not in a router' },
        ],
        exceptEdges: [{ file: 'src/server/routers/health.ts', specifier: '../procedures', reason: 'the health check answers before sign-in' }],
      },
    ]),
  );
}

/**
 * README "Model constructors in one module": the constructors banned by name everywhere but the module that builds the models.
 */
export function buildModelConstructorsRecipe(): DefinedConfig {
  return defineConfig(
    ...importPolicyConfig([
      {
        files: ['src/**'],
        ignores: ['src/adapters/model/models.ts'],
        deny: [{ specifiers: ['@vendor/model-sdk'], importNames: ['ChatModel', 'EmbeddingModel'], message: 'models are constructed once, in src/adapters/model/models.ts' }],
      },
    ]),
  );
}

/**
 * README "Syntax bans scoped to a set of files": one `no-restricted-syntax` block per set of files, each restating the entries of every broader block that also selects its files, because a later block replaces an earlier block's list.
 */
export function buildScopedSyntaxRecipe(): DefinedConfig {
  return defineConfig(
    {
      files: ['src/**/*.{ts,tsx}'],
      ignores: ['src/telemetry/settings.ts'],
      rules: { 'no-restricted-syntax': ['error', ...telemetryContentFlags] },
    },
    {
      files: ['src/client/**/*.{ts,tsx}'],
      rules: { 'no-restricted-syntax': ['error', ...telemetryContentFlags, ...providerKeyReads] },
    },
    {
      files: ['src/server/routers/**/*.ts'],
      rules: { 'no-restricted-syntax': ['error', ...telemetryContentFlags, ...inlineRoleChecks] },
    },
  );
}
