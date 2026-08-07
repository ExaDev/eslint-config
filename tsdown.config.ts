import { defineConfig } from 'tsdown';

// src/index.ts mixes a default export (recommendedTypeChecked) with a named one (plugin), which rolldown's CJS output warns about (MIXED_EXPORTS): Node's own NATIVE `import()` of the built .cjs file does not respect the `__esModule` marker TypeScript/bundler interop helpers use, so a raw `require('@exadev/eslint-config').default` differs from what a TS-compiled or bundler-mediated `import exadev from '@exadev/eslint-config'` resolves to (confirmed empirically: the real, faithful path -- a "type": "module" project installing this package and using ESM `import` -- resolves correctly; only a hypothetical direct-CommonJS-require consumer would see the raw exports object instead of the array). No current consumer of this package is CommonJS, and both `attw --pack` and `publint` -- the standard tools for exactly this class of packaging defect -- report no problems, matching how this package already accepts a comparable, narrower CJS-interop quirk (`false-export-default`, see the `.attw.json` ignore rule and src/plugin.ts's own top-of-file comment). Restructuring the CJS output shape to also serve a require()-based consumer that does not exist would be speculative work for a need nobody has.
export default defineConfig({
  entry: ['src/index.ts'],
  root: 'src',
  format: ['esm', 'cjs'],
  dts: true,
  platform: 'neutral',
  clean: true,
});
