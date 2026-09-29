import { describe, expect, it } from 'vitest';
import { endOfString, parseJsonc, stripJsonc } from './jsonc';

describe('endOfString', () => {
  it('returns the index just past the closing quote', () => {
    const text = 'x"ab"y';
    expect(endOfString(text, 1)).toBe(text.indexOf('y'));
  });

  it('runs an unterminated string, including a dangling backslash, to the end of the text', () => {
    const text = '"a\\';
    expect(endOfString(text, 0)).toBe(text.length);
  });

  it('treats a backslash followed by any character, whitespace included, as one escape pair', () => {
    const text = '"a\\ b"';
    expect(endOfString(text, 0)).toBe(text.length);
  });

  it('throws when the start is not an opening quote', () => {
    expect(() => endOfString('abc', 0)).toThrow(/Unreachable/);
  });
});

describe('stripJsonc', () => {
  it('leaves plain JSON untouched', () => {
    const text = '{ "a": [1, 2, {"b": null}], "c": "d" }';
    expect(stripJsonc(text)).toBe(text);
  });

  it('removes a line comment but keeps the newline after it', () => {
    expect(stripJsonc('{ // note\n"a": 1 }')).toBe('{ \n"a": 1 }');
  });

  it('removes a line comment that runs to the end of the text', () => {
    expect(stripJsonc('{"a": 1} // trailing')).toBe('{"a": 1} ');
  });

  it('removes a block comment, including one spanning lines', () => {
    expect(stripJsonc('{ /* a\nb */ "a": 1 }')).toBe('{   "a": 1 }');
  });

  it('removes an unterminated block comment to the end of the text', () => {
    expect(stripJsonc('{"a": 1} /* open')).toBe('{"a": 1}  ');
  });

  it('treats a lone slash as ordinary text so the JSON parser can reject it', () => {
    expect(stripJsonc('{"a": 1 / 2}')).toBe('{"a": 1 / 2}');
  });

  it('keeps comment markers inside strings', () => {
    const text = '{"url": "http://x/*y*/", "b": "//"}';
    expect(stripJsonc(text)).toBe(text);
  });

  it('honours escaped quotes and escaped backslashes inside strings', () => {
    const text = '{"a": "q\\"//still string", "b": "back\\\\", "c": 1}';
    expect(stripJsonc(text)).toBe(text);
  });

  it('copes with an unterminated string by copying it to the end', () => {
    expect(stripJsonc('{"a": "open')).toBe('{"a": "open');
  });

  it('starts a block comment only at a slash followed by an asterisk', () => {
    expect(stripJsonc('{"a": 2*3}')).toBe('{"a": 2*3}');
  });

  it('does not close a block comment on the asterisk-slash overlapping its own opener', () => {
    expect(stripJsonc('/*/ x */1')).toBe(' 1');
  });

  it('keeps leading whitespace before a closing bracket that has no comma at all', () => {
    expect(stripJsonc('  ]')).toBe('  ]');
  });

  it('keeps whitespace inside brackets when there was no comma', () => {
    expect(stripJsonc('[ ]')).toBe('[ ]');
    expect(stripJsonc('{ }')).toBe('{ }');
  });

  it('keeps a string that ends in an escaped backslash before its closing quote, and one cut off by a dangling backslash', () => {
    expect(stripJsonc('["a\\"]')).toBe('["a\\"]');
    expect(stripJsonc('["a\\')).toBe('["a\\');
  });

  it('drops a trailing comma before } and before ]', () => {
    expect(stripJsonc('{"a": [1, 2,], "b": 1,}')).toBe('{"a": [1, 2], "b": 1}');
  });

  it('drops a trailing comma separated from the bracket by whitespace or comments', () => {
    expect(stripJsonc('[1, /* x */\n // y\n ]')).toBe('[1  \n \n ]');
  });

  it('replaces a block comment with a space so the tokens either side stay separate', () => {
    expect(stripJsonc('1/**/2')).toBe('1 2');
    expect(stripJsonc('{"a":1/**/2}')).toBe('{"a":1 2}');
  });

  it('keeps a comma that has no value before it so the JSON parser rejects it', () => {
    expect(stripJsonc('[,]')).toBe('[,]');
    expect(stripJsonc('{,}')).toBe('{,}');
    expect(stripJsonc('[1,,]')).toBe('[1,,]');
    expect(stripJsonc('[,1]')).toBe('[,1]');
    expect(stripJsonc('{"a":[,]}')).toBe('{"a":[,]}');
  });

  it('drops a trailing comma after a nested container closes', () => {
    expect(stripJsonc('[[],]')).toBe('[[]]');
    expect(stripJsonc('{"a":{},}')).toBe('{"a":{}}');
  });

  it('keeps a comma that is followed by a value', () => {
    expect(stripJsonc('[1, 2]')).toBe('[1, 2]');
  });

  it('keeps a comma inside a string directly before a bracket character', () => {
    expect(stripJsonc('["a,", "b"]')).toBe('["a,", "b"]');
  });

  it('does not let a comma before a string count as trailing when a closing bracket follows the string', () => {
    expect(stripJsonc('[1, "a"]')).toBe('[1, "a"]');
  });

  it('only drops the comma nearest the bracket, not an earlier one', () => {
    expect(stripJsonc('[[1,],[2,]]')).toBe('[[1],[2]]');
  });

  it('does not treat a later bracket as closing a comma that was already followed by a value', () => {
    expect(stripJsonc('[1,2]')).toBe('[1,2]');
    expect(stripJsonc('{"a":[1,2],"b":3}')).toBe('{"a":[1,2],"b":3}');
  });
});

describe('parseJsonc', () => {
  it('ignores a leading byte order mark', () => {
    expect(parseJsonc('\uFEFF{"a":1}', '/p/a.json')).toStrictEqual({ a: 1 });
  });

  it('rejects a byte order mark anywhere but the start', () => {
    expect(() => parseJsonc('{"a":1}\uFEFF', '/p/a.json')).toThrow(/"\/p\/a\.json"/);
  });

  it.each([
    ['a block comment between two value tokens', '{"a":1/**/2}'],
    ['a lone comma in an array', '[,]'],
    ['a lone comma in an object', '{,}'],
    ['a doubled trailing comma', '[1,,]'],
  ])('throws naming the path for %s', (_label, text) => {
    expect(() => parseJsonc(text, '/p/bad.json')).toThrow(/"\/p\/bad\.json"/);
  });

  it('parses a tsconfig-shaped document with comments and trailing commas', () => {
    const text = '{\n  // strict\n  "compilerOptions": { "strict": true, /* c */ "target": "es2022", },\n}\n';
    expect(parseJsonc(text, '/p/tsconfig.json')).toStrictEqual({ compilerOptions: { strict: true, target: 'es2022' } });
  });

  it('throws naming the source path, with the syntax error as the cause', () => {
    let caught: unknown;
    try {
      parseJsonc('{"a": }', '/p/turbo.json');
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof Error)) throw new Error('Unreachable: parseJsonc was expected to throw an Error.');
    expect(caught.message).toMatch(/^@exadev\/eslint-config: could not parse "\/p\/turbo.json" as JSON with comments: /);
    expect(caught.cause).toBeInstanceOf(SyntaxError);
  });
});
