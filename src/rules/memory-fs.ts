import type { WorkspaceFs } from './workspace-fs';

/**
 * An in-memory `WorkspaceFs` over a map of absolute forward-slash file paths to their contents, so a rule that reads sibling and ancestor files can be driven from a fabricated tree with no disk access. A path exists when it is a file in the map or a directory holding at least one; `readFileSync` throws `ENOENT` for a missing file, exactly as node does; `realpathSync` is the identity, since a fabricated tree has no symlinks.
 */
export function createMemoryFs(files: Readonly<Record<string, string>>): WorkspaceFs {
  const filePaths = Object.keys(files);

  return {
    existsSync: (path) => path in files || filePaths.some((filePath) => filePath.startsWith(`${path}/`)),
    readFileSync: (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: no such file "${path}"`);

      return content;
    },
    readdirSync: (path) => {
      const prefix = `${path}/`;
      const children = new Map<string, boolean>();
      for (const filePath of filePaths.filter((candidate) => candidate.startsWith(prefix))) {
        const rest = filePath.slice(prefix.length);
        const slash = rest.indexOf('/');
        children.set(slash === -1 ? rest : rest.slice(0, slash), slash !== -1);
      }

      return [...children].map(([name, isDirectory]) => ({ name, isDirectory: () => isDirectory }));
    },
    realpathSync: (path) => path,
  };
}
