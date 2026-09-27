import { describe, expect, it } from 'vitest';

import { assertIsError, jsonParseContext, regExpConstructorContext } from './workspace-errors';

describe('assertIsError', () => {
  it('returns normally, narrowing in place, when the value genuinely is an Error', () => {
    const error: unknown = new SyntaxError('bad input');
    expect(() => {
      assertIsError(error, 'some call');
    }).not.toThrow();
  });

  it('throws, naming the given context, for a non-Error value: a shape no real call site (JSON.parse and the RegExp constructor both only ever throw a real Error) produces', () => {
    expect(() => {
      assertIsError('not an error', 'some call');
    }).toThrow('Unreachable: some call threw a non-Error value.');
  });
});

describe('jsonParseContext', () => {
  it('names the exact manifest path JSON.parse was reading, including its double quotes', () => {
    expect(jsonParseContext('/root/pkg/package.json')).toBe('JSON.parse while parsing "/root/pkg/package.json"');
  });
});

describe('regExpConstructorContext', () => {
  it('names the exact nameRanks pattern the RegExp constructor rejected, including its double quotes', () => {
    expect(regExpConstructorContext('(')).toBe('the RegExp constructor while compiling "nameRanks" pattern "("');
  });
});
