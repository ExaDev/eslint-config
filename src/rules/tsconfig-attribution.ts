import { resolve } from 'node:path';
import type * as ts from 'typescript';
import { readTsconfig, tsconfigPathOf } from './compiler-option-values';

/**
 * Answers which tsconfig governs `filename` when it is linted with `program`, or `undefined` when none does.
 */
export type TsconfigAttribution = (program: ts.Program, filename: string) => string | undefined;

/**
 * Creates an attribution that answers with the tsconfig `program` was created from and remembers it for the file. For a program with no tsconfig behind it, it answers with the tsconfig the file was last linted under, as long as that tsconfig still lists the file, and with `undefined` otherwise.
 *
 * typescript-eslint hands a file a program with no tsconfig when, having inferred a single run, it parses a file it has already parsed in the process (as in a fix pass): it builds a program of that one file instead of reusing the tsconfig's program. That file still belongs to its tsconfig, which the remembered path recovers. Re-reading the tsconfig's file list keeps a file that has since left the tsconfig (and now sits in a default project) from being attributed to it.
 */
export function createTsconfigAttribution(): TsconfigAttribution {
  const tsconfigOfFile = new Map<string, string>();

  return (program, filename) => {
    const own = tsconfigPathOf(program);
    if (own !== undefined) {
      tsconfigOfFile.set(filename, own);

      return own;
    }
    const earlier = tsconfigOfFile.get(filename);
    if (earlier === undefined) return undefined;

    return readTsconfig(earlier).fileNames.some((fileName) => resolve(fileName) === resolve(filename)) ? earlier : undefined;
  };
}
