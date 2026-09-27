import type { ConfigArrayValue, PublicConfigArray } from './config-types';

/* Isolated in its own module, doing nothing but this one cast, so eslint.config.ts's own override for @typescript-eslint/consistent-type-assertions (this repo's noInlineConfig means that can only ever be a scoped `files` override, never an inline disable) applies to exactly this line and nothing else in the codebase, the same reason to-public-plugin.ts is isolated the same way.

   See PublicConfigArray's own comment in config-types.ts for why this cast is necessary and safe: every element in a ConfigArrayValue this package ever builds is already a real, valid ESLint flat-config object, matching @eslint/core's own Config shape byte for byte; only the *type* built from typescript-eslint's own internal Config type isn't nominally assignable to @eslint/core's ConfigObject (a missing index signature on LanguageOptions). A single `as` suffices here, without the `unknown` escape hatch: each element's own fields, though typed against TSESLint's narrower shape, are still structurally a valid ConfigObject, so TypeScript accepts the direct cast to PublicConfigArray as comparable. */
export function toPublicConfigArray(built: ConfigArrayValue): PublicConfigArray {
  return built as PublicConfigArray;
}
