import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import {
  buildAuthenticatedHandlersRecipe,
  buildModelConstructorsRecipe,
  buildScopedSyntaxRecipe,
  buildTestOnlyModulesRecipe,
  buildVendorSdkRecipe,
  inlineRoleChecks,
  PROVIDER_KEY_MESSAGE,
  ROLE_MESSAGE,
  TELEMETRY_MESSAGE,
  telemetryContentFlags,
} from './import-policy-recipes';

// Each recipe is linted as the README shows it. The one block added in front gives TypeScript files a parser, which `...exadevConfig()` supplies in a real config; the rest of exadevConfig() is left out because its type-checked rules need a tsconfig program that a lintText call has none of.
const typescriptParser: Linter.Config = { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } };

const COMPUTED = 'This module specifier is computed at runtime, so the import policy for this file cannot check it. Write it as a string literal.';
const restricted = (specifier: string, message: string): string => `"${specifier}" cannot be imported here: ${message}`;

// A source line followed by the messages it must be reported with, in order; a line with none must pass.
type AnnotatedLine = readonly [code: string, ...expected: string[]];

const withoutReports = (lines: readonly AnnotatedLine[]): readonly AnnotatedLine[] => lines.map(([code]) => [code]);

// Lints the lines as one file and requires exactly the annotated reports, each on its own line.
async function expectReports(recipe: readonly Linter.Config[], filePath: string, lines: readonly AnnotatedLine[]): Promise<void> {
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [typescriptParser, ...recipe], cwd: import.meta.dirname });
  const [result] = await eslint.lintText(lines.map(([code]) => code).join('\n'), { filePath });
  if (result === undefined) throw new Error('Unreachable: lintText returns one result per text.');
  expect(result.messages.map((message) => [message.line, message.message])).toStrictEqual(lines.flatMap(([, ...expected], index) => expected.map((message) => [index + 1, message])));
}

describe('import-policy recipes', () => {
  describe('a vendor SDK behind its adapter', () => {
    const CONFINED = 'call the model through src/adapters/model, which owns the vendor SDK';
    const DETERMINISTIC = 'workflow code is replayed and must be deterministic; call the model from an activity';
    const sdkImports: readonly AnnotatedLine[] = [
      ["import { ChatClient } from '@vendor/model-sdk';", restricted('@vendor/model-sdk', CONFINED)],
      ["const streaming = await import('@vendor/model-sdk/streaming');", restricted('@vendor/model-sdk/streaming', CONFINED)],
      ["import type { Reply } from '@vendor/model-sdk';", restricted('@vendor/model-sdk', CONFINED)],
    ];

    it('reports the SDK outside its adapter in every import form, and passes the code calling the adapter', async () => {
      await expectReports(buildVendorSdkRecipe(), 'src/features/summary.ts', [...sdkImports, ["import { summarise } from '../adapters/model/summarise';"]]);
    });

    it('passes the SDK in its adapter and in tests', async () => {
      const recipe = buildVendorSdkRecipe();
      await expectReports(recipe, 'src/adapters/model/client.ts', withoutReports(sdkImports));
      await expectReports(recipe, 'src/features/summary.test.ts', withoutReports(sdkImports));
    });

    it('keeps the SDK and its adapter out of workflow code, allows their types there, and reports a file both policies select once per policy', async () => {
      await expectReports(buildVendorSdkRecipe(), 'src/workflows/order.ts', [
        ["import { summarise } from '../adapters/model/summarise';", restricted('../adapters/model/summarise', DETERMINISTIC)],
        ["import type { Summary } from '../adapters/model/summarise';"],
        ["import { ChatClient } from '@vendor/model-sdk';", restricted('@vendor/model-sdk', CONFINED), restricted('@vendor/model-sdk', DETERMINISTIC)],
        ["import { approve } from '../activities/approve';"],
      ]);
    });
  });

  describe('test doubles, fixtures and conformance kits stay out of shipped code', () => {
    const TEST_ONLY = 'test doubles, fixtures and conformance kits stay out of shipped code; import them from tests only';
    const service: readonly AnnotatedLine[] = [
      ["import { createFakeClock } from '../testing/clock';", restricted('../testing/clock', TEST_ONLY)],
      ["import { order } from './__fixtures__/order';", restricted('./__fixtures__/order', TEST_ONLY)],
      ["import { FakeRepository } from './repository.fake.js';", restricted('./repository.fake.js', TEST_ONLY)],
      ["import { runConformance } from '@scope/orders-contract/conformance';", restricted('@scope/orders-contract/conformance', TEST_ONLY)],
      ["const kit = await import('@scope/orders-contract/testing');", restricted('@scope/orders-contract/testing', TEST_ONLY)],
      ['const plugin = await import(`./plugins/${kit.name}`);', COMPUTED],
      ["import { orderSchema } from '@scope/orders-contract';"],
      ["import { createRepository } from './repository.js';"],
    ];

    it('reports each kind of test-only module, statically and dynamically imported, and a computed specifier, in shipped code', async () => {
      await expectReports(buildTestOnlyModulesRecipe(), 'src/orders/service.ts', service);
    });

    it('passes the same imports in tests, in the testing directory and in a fake', async () => {
      const recipe = buildTestOnlyModulesRecipe();
      await expectReports(recipe, 'src/orders/service.test.ts', withoutReports(service));
      await expectReports(recipe, 'src/testing/orders.ts', [["import { order } from '../orders/__fixtures__/order';"]]);
      await expectReports(recipe, 'src/orders/repository.fake.ts', [["import { order } from './__fixtures__/order';"]]);
    });
  });

  describe('handlers built only from the authenticated procedure', () => {
    const AUTHENTICATED = 'every handler requires a signed-in caller; build it from protectedProcedure';
    const BUILT_CENTRALLY = 'procedures are built in src/server/procedures, not in a router';

    it('passes the allowed names and types, and reports any other name, a namespace import and the RPC server package', async () => {
      await expectReports(buildAuthenticatedHandlersRecipe(), 'src/server/routers/orders.ts', [
        ["import { router, protectedProcedure } from '../procedures';"],
        ["import type { Context } from '../procedures';"],
        ["import { publicProcedure } from '../procedures';", restricted('../procedures', AUTHENTICATED)],
        ["import * as procedures from '../procedures';", restricted('../procedures', AUTHENTICATED)],
        ["import { initRpc } from '@scope/rpc-server';", restricted('@scope/rpc-server', BUILT_CENTRALLY)],
        ["import type { AnyRouter } from '@scope/rpc-server';"],
      ]);
    });

    it('lets only the router the exception names use the public procedure, and keeps the RPC server package banned there', async () => {
      const publicImport = "import { router, publicProcedure } from '../procedures';";
      const recipe = buildAuthenticatedHandlersRecipe();
      await expectReports(recipe, 'src/server/routers/health.ts', [[publicImport], ["import { initRpc } from '@scope/rpc-server';", restricted('@scope/rpc-server', BUILT_CENTRALLY)]]);
      await expectReports(recipe, 'src/server/routers/status.ts', [[publicImport, restricted('../procedures', AUTHENTICATED)]]);
    });
  });

  describe('model constructors in one module', () => {
    const ONE_MODULE = 'models are constructed once, in src/adapters/model/models.ts';
    const imports: readonly AnnotatedLine[] = [
      ["import { ChatModel } from '@vendor/model-sdk';", restricted('@vendor/model-sdk', ONE_MODULE)],
      ["import { EmbeddingModel as Embedder, type ModelSettings } from '@vendor/model-sdk';", restricted('@vendor/model-sdk', ONE_MODULE)],
      ["import * as sdk from '@vendor/model-sdk';", restricted('@vendor/model-sdk', ONE_MODULE)],
      ["import { ModelError } from '@vendor/model-sdk';"],
    ];

    it('reports a constructor by name, renamed and through a namespace, and passes the other exports', async () => {
      await expectReports(buildModelConstructorsRecipe(), 'src/features/search.ts', imports);
    });

    it('passes every import in the module that builds the models', async () => {
      await expectReports(buildModelConstructorsRecipe(), 'src/adapters/model/models.ts', withoutReports(imports));
    });
  });

  describe('syntax bans scoped to a set of files', () => {
    const router: readonly AnnotatedLine[] = [
      ["if (ctx.user.role === 'admin') {}", ROLE_MESSAGE],
      ["if ('owner' !== user.role) {}", ROLE_MESSAGE],
      ['switch (user.role) { default: }', ROLE_MESSAGE],
      ["const allowed = ['admin', 'owner'].includes(user.role);", ROLE_MESSAGE],
      ["if (can(ctx.user, 'orders:refund')) {}"],
      ['const reply = await model.generate({ telemetry: { recordOutputs: true } });', TELEMETRY_MESSAGE],
      ['const key = process.env.MODEL_API_KEY;'],
      ["const { role } = user; if (role === 'admin') {}"],
    ];

    it('reports provider key reads and telemetry flags in browser files, and leaves a public variable, a role comparison and a computed name alone', async () => {
      await expectReports(buildScopedSyntaxRecipe(), 'src/client/settings.tsx', [
        ['const key = process.env.MODEL_API_KEY;', PROVIDER_KEY_MESSAGE],
        ["const secret = process.env['WEBHOOK_SECRET'];", PROVIDER_KEY_MESSAGE],
        ['const { SEARCH_TOKEN } = process.env;', PROVIDER_KEY_MESSAGE],
        ['const url = process.env.PUBLIC_API_URL;'],
        ['track({ telemetry: { recordInputs: true } });', TELEMETRY_MESSAGE],
        ["if (user.role === 'admin') {}"],
        ['const computed = process.env[name];'],
      ]);
    });

    it('reports inline role checks and telemetry flags in handlers, and leaves the policy helper, a server-side key read and a role read into a local alone', async () => {
      await expectReports(buildScopedSyntaxRecipe(), 'src/server/routers/orders.ts', router);
    });

    it('reports a telemetry flag anywhere else, quoted or not and whatever its value, but not in the settings module or when destructured', async () => {
      const recipe = buildScopedSyntaxRecipe();
      await expectReports(recipe, 'src/features/search.ts', [
        ["const options = { 'recordInputs': true };", TELEMETRY_MESSAGE],
        ['const quiet = { recordOutputs: false };', TELEMETRY_MESSAGE],
        ['const { recordInputs } = options;'],
      ]);
      await expectReports(recipe, 'src/telemetry/settings.ts', [['export const telemetry = { recordInputs: false, recordOutputs: false };']]);
    });

    it('loses the broader list in the narrower files when a later block names only its own entries, which is why the recipe restates them', async () => {
      const ownEntriesOnly: Linter.Config[] = [
        { files: ['src/**/*.{ts,tsx}'], ignores: ['src/telemetry/settings.ts'], rules: { 'no-restricted-syntax': ['error', ...telemetryContentFlags] } },
        { files: ['src/server/routers/**/*.ts'], rules: { 'no-restricted-syntax': ['error', ...inlineRoleChecks] } },
      ];
      await expectReports(
        ownEntriesOnly,
        'src/server/routers/orders.ts',
        router.map(([code, ...expected]) => [code, ...expected.filter((message) => message !== TELEMETRY_MESSAGE)]),
      );
    });
  });
});
