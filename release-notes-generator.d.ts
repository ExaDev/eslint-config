/**
 * The release-notes generator plugin ships no type declarations. This declares the one function release.config.unit.test.ts calls, with the context fields that function reads.
 */
declare module '@semantic-release/release-notes-generator' {
  export function generateNotes(
    pluginConfig: Readonly<Record<string, unknown>>,
    context: {
      readonly cwd: string;
      readonly commits: readonly { readonly hash: string; readonly message: string }[];
      readonly options: { readonly repositoryUrl: string };
      readonly lastRelease: { readonly gitTag: string };
      readonly nextRelease: { readonly gitTag: string; readonly version: string };
    },
  ): Promise<string>;
}
