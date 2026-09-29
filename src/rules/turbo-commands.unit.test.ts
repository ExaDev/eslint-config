import { describe, expect, it } from 'vitest';
import { delegatesTo, invokedTurboWords, runsBoundaries } from './turbo-commands';

describe('delegatesTo', () => {
  it.each([
    ['turbo run _lint', 'turbo run', true],
    ['turbo run _lint --force', 'turbo run', true],
    ['turbo run _lint --filter=web --force', 'turbo run', true],
    ['  turbo   run   _lint ', 'turbo run', true],
    ['turbo _lint', 'turbo', true],
    ['turbo _lint --force', 'turbo', true],
    ['turbo run _lint --filter web', 'turbo run', true],
    ['turbo run _lint -- --fix', 'turbo run', true],
    ['turbo run _lint2', 'turbo run', false],
    ['turbo run _lint _typecheck', 'turbo run', false],
    ['turbo run _lint extra', 'turbo run', false],
    ['turbo run _lint --force extra more', 'turbo run', false],
    ['turbo _lint _typecheck', 'turbo', false],
    ['turbo run _lin', 'turbo run', false],
    ['eslint .', 'turbo run', false],
    ['', 'turbo run', false],
    ['tsc --noEmit && turbo run _lint', 'turbo run', false],
    ['turbo run _lint && tsc', 'turbo run', false],
    ['turbo run _lint || true', 'turbo run', false],
    ['turbo run _lint; tsc', 'turbo run', false],
    ['turbo run _lint | cat', 'turbo run', false],
    ['turbo run _lint > out.log', 'turbo run', false],
    ['turbo run _lint < in', 'turbo run', false],
    ['turbo run _lint --force&', 'turbo run', false],
    ['turbo _lint', 'turbo run', false],
    ['turbo run _lint', 'turbo', false],
  ] as const)('reads %j against the %j form as %s', (command, delegate, expected) => {
    expect(delegatesTo(command, { delegate, task: '_lint' })).toBe(expected);
  });

  it('compares the task name whole, including a colon suffix', () => {
    expect(delegatesTo('turbo run _test:mutation', { delegate: 'turbo run', task: '_test:mutation' })).toBe(true);
    expect(delegatesTo('turbo run _test', { delegate: 'turbo run', task: '_test:mutation' })).toBe(false);
  });
});

describe('invokedTurboWords', () => {
  it('reads the words after turbo run', () => {
    expect(invokedTurboWords('turbo run lint')).toEqual(['lint']);
  });

  it('reads the words after turbo without run', () => {
    expect(invokedTurboWords('turbo lint typecheck')).toEqual(['lint', 'typecheck']);
  });

  it('leaves out flags but keeps the separate value of a flag', () => {
    expect(invokedTurboWords('turbo run lint --force --filter web')).toEqual(['lint', 'web']);
    expect(invokedTurboWords('turbo run lint --filter=web')).toEqual(['lint', 'web']);
  });

  it('finds turbo behind a package manager or by path', () => {
    expect(invokedTurboWords('pnpm turbo run lint')).toEqual(['lint']);
    expect(invokedTurboWords('pnpm exec ./node_modules/.bin/turbo run lint')).toEqual(['lint']);
  });

  it('reads each invocation of a chained command up to its operator', () => {
    expect(invokedTurboWords('turbo run a && echo b && turbo run c d')).toEqual(['a', 'c', 'd']);
    expect(invokedTurboWords('turbo run a; turbo b | cat')).toEqual(['a', 'b']);
    expect(invokedTurboWords('turbo run a || turbo run b')).toEqual(['a', 'b']);
    expect(invokedTurboWords('turbo run a&&turbo run b')).toEqual(['a', 'b']);
  });

  it('reads nothing from a command that does not run turbo', () => {
    expect(invokedTurboWords('eslint . && tsc')).toEqual([]);
    expect(invokedTurboWords('turbotax run lint')).toEqual([]);
    expect(invokedTurboWords('')).toEqual([]);
  });

  it('reads nothing after a bare turbo', () => {
    expect(invokedTurboWords('turbo')).toEqual([]);
    expect(invokedTurboWords('turbo run')).toEqual([]);
  });

  it('reads a run that is not directly after turbo as an ordinary word', () => {
    expect(invokedTurboWords('turbo --force run lint')).toEqual(['run', 'lint']);
  });

  it('reads only the first turbo of a segment, the others being its arguments', () => {
    expect(invokedTurboWords('turbo run turbo')).toEqual(['turbo']);
  });

  it('keeps qualified root task names whole', () => {
    expect(invokedTurboWords('turbo run //#depcheck')).toEqual(['//#depcheck']);
  });
});

describe('runsBoundaries', () => {
  it.each([
    ['turbo boundaries', true],
    ['pnpm turbo boundaries', true],
    ['pnpm exec turbo boundaries', true],
    ['pnpm lint && turbo boundaries', true],
    ['pnpm boundaries', true],
    ['pnpm run boundaries', true],
    ['npm run boundaries', true],
    ['yarn boundaries', true],
    ['bun run boundaries', true],
    ['pnpm lint && pnpm boundaries && pnpm test', true],
    ['turbo run lint --filter boundaries', false],
    ['pnpm --filter boundaries lint', false],
    ['echo boundaries', false],
    ['boundaries', false],
    ['turbo run boundaries', false],
    ['pnpm lint', false],
    ['', false],
  ] as const)('reads %j as %s', (command, expected) => {
    expect(runsBoundaries(command)).toBe(expected);
  });
});
