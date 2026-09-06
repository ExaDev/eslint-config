import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { defaultConfig, exadevConfig } from './create-config';

// Not imported by index.ts (see tsdown.config.ts's entry -- only src/index.ts is bundled), so this file contributes nothing to the published package. Its only job is to be included in `tsc -p tsconfig.json` (see tsconfig.json's own `include`), so `pnpm typecheck` fails the moment either consumption pattern below stops compiling -- a real regression test for PublicConfigArray's own compatibility claim (see config-types.ts), not just a comment asserting it.
// tseslint.config() is @deprecated (see config-types.ts's own comment on PublicConfigArray) -- deliberately exercised here anyway, since this line's whole job is proving the still-fully-functional legacy pattern keeps working for existing consumers, not adopting it for new code. noInlineConfig (this repo's own linterOptions) rules out an inline disable here -- eslint.config.ts's own override for this exact file is the only mechanism this codebase allows.
export const viaTseslintConfig = tseslint.config(...defaultConfig);
export const viaDefineConfig = defineConfig(defaultConfig);
export const viaDefineConfigSpread = defineConfig(...exadevConfig());
