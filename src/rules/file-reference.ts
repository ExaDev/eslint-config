import { dirname, resolve } from 'node:path';
import { isRecord } from '../is-record';
import { parseJsonc } from './jsonc';
import type { WorkspaceFs } from './workspace-fs';
import { resolveWorkspaceRoot } from './workspace-graph';

/**
 * What a reference's `path` is resolved against: the directory of the file being linted (`file`, the sibling case) or the workspace root (`root`, resolved as `resolveWorkspaceRoot` does: a `root` rule option, else the nearest ancestor owning a `pnpm-workspace.yaml`). An absolute `path` ignores the base.
 */
export type FileReferenceBase = 'file' | 'root';

export interface FileReference {
  readonly path: string;
  // Defaults to 'file'.
  readonly relativeTo?: FileReferenceBase;
}

/**
 * The option schema for a rule option naming another file to read (a sibling manifest, a root config).
 */
export const fileReferenceSchema = {
  type: 'object',
  properties: {
    path: { type: 'string', minLength: 1 },
    relativeTo: { type: 'string', enum: ['file', 'root'] },
  },
  required: ['path'],
  additionalProperties: false,
} as const;

/**
 * Validates a file-reference option value at runtime, mirroring `fileReferenceSchema` for callers that build rule options before ESLint's own schema validation sees them. Throws naming `optionName` for anything else, including an unknown key.
 */
export function readFileReference(value: unknown, optionName: string): FileReference {
  const fail = (): never => {
    throw new Error(`@exadev/eslint-config: "${optionName}" must be { path: string, relativeTo?: "file" | "root" }.`);
  };
  if (!isRecord(value)) return fail();
  const { path, relativeTo, ...unknownKeys } = value;
  if (typeof path !== 'string' || path.length === 0 || Object.keys(unknownKeys).length > 0) return fail();
  if (relativeTo === undefined) return { path };
  if (relativeTo !== 'file' && relativeTo !== 'root') return fail();

  return { path, relativeTo };
}

export interface FileReferenceContext {
  readonly fs: WorkspaceFs;
  // ESLint's `context.filename` for the file being linted.
  readonly filename: string;
  // The rule's `root` option, when it has one; only consulted for `relativeTo: 'root'`.
  readonly rootOption?: string | undefined;
}

/**
 * Resolves a reference to an absolute path. Throws (via `resolveWorkspaceRoot`) when `relativeTo` is `root` and no workspace root can be found.
 */
export function resolveFileReference(reference: FileReference, context: FileReferenceContext): string {
  const base = reference.relativeTo === 'root' ? resolveWorkspaceRoot(context.fs, context.filename, context.rootOption) : dirname(resolve(context.filename));

  return resolve(base, reference.path);
}

/**
 * Reads the referenced file as JSONC (plain JSON is a subset, so a `.json` manifest and a commented tsconfig parse alike). Returns `undefined` when the file does not exist, so the caller decides whether absence is a finding; a file that exists but is not valid JSONC throws naming its path.
 */
export function readReferencedJson(reference: FileReference, context: FileReferenceContext): unknown {
  const absolutePath = resolveFileReference(reference, context);
  if (!context.fs.existsSync(absolutePath)) return undefined;

  return parseJsonc(context.fs.readFileSync(absolutePath), absolutePath);
}
