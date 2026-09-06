import type { ConfigArrayValue, PublicConfigArray } from './config-types';

// Isolated in its own module, doing nothing but this one cast, so eslint.config.ts's own override for @typescript-eslint/consistent-type-assertions (this repo's noInlineConfig means that can only ever be a scoped `files` override, never an inline disable) applies to exactly this line and nothing else in the codebase.
//
// See PublicConfigArray's own comment in config-types.ts for why this cast is necessary and safe: every element in a ConfigArrayValue this package ever builds is already a real, valid ESLint flat-config object -- only the *type* built from typescript-eslint's own internal Config type isn't nominally assignable to @eslint/core's ConfigObject (a missing index signature on LanguageOptions), a gap confirmed to reproduce even for a bare, unmodified tseslint.config() array with none of this package's own code involved.
export function toPublicConfigArray(built: ConfigArrayValue): PublicConfigArray {
  return built as unknown as PublicConfigArray;
}
