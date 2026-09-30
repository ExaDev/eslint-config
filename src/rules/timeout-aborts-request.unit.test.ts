import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule from './timeout-aborts-request';

describe('rule metadata', () => {
  it('carries the docs url built from the rule name', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/timeout-aborts-request.ts');
  });

  it('takes no options', () => {
    expect(rule.meta.schema).toStrictEqual([]);
  });
});

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });

// The accepted shape, with the parts a case changes left as parameters.
function shape(parts: { readonly declare?: string; readonly timer?: string; readonly callback?: string; readonly catchClause?: string; readonly finalizer?: string; readonly race?: string } = {}): string {
  const {
    declare = 'const controller = new AbortController();\n  let timer;',
    timer = 'timer = setTimeout(CALLBACK, 1000);',
    callback = '() => { controller.abort(); reject(new Error("timeout")); }',
    catchClause = ' catch (error) {\n    if (controller.signal.aborted) return undefined;\n    throw error;\n  }',
    finalizer = ' finally {\n    clearTimeout(timer);\n  }',
    race = 'await Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => {\n      TIMER\n    })])',
  } = parts;

  return `async function f(url) {\n  ${declare}\n  try {\n    return ${race.replace('TIMER', timer.replace('CALLBACK', callback))};\n  }${catchClause}${finalizer}\n}`;
}

ruleTester.run('timeout-aborts-request', rule, {
  valid: [
    shape(),
    // No catch at all: nothing to check.
    shape({ catchClause: '' }),
    // The timer callback may be a named function or a function expression.
    shape({ callback: 'function () { controller.abort(); reject(new Error("timeout")); }' }),
    'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  const onTimeout = () => { controller.abort(); };\n  try {\n    return await Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(onTimeout, 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
    'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  function onTimeout() { controller.abort(); }\n  try {\n    return await Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(onTimeout, 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
    // A non-null assertion changes no value.
    shape({ callback: '() => { controller!.abort(); reject(new Error("timeout")); }' }),
    // The abort may sit anywhere in the callback, including a nested call.
    shape({ callback: '() => { reject(new Error("timeout")); queueMicrotask(() => controller.abort()); }' }),
    // The test may also be the signal read through a non-null assertion.
    shape({ catchClause: ' catch (error) {\n    if (controller!.signal!.aborted) return undefined;\n    throw error;\n  }' }),
    // The request may receive the controller through a const it was started in, or the controller itself.
    'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  const request = fetch(url, { signal: controller.signal });\n  try {\n    return await Promise.race([request, new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
    'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  try {\n    return await Promise.race([start(url, controller), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
    // The catch may test the signal through a compound condition.
    shape({ catchClause: ' catch (error) {\n    if (error instanceof Error && controller.signal.aborted) { log(error); return undefined; }\n    throw error;\n  }' }),
    // The timer id may be declared in the function and assigned in the executor, or the arm named first.
    'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("t")); }, 1); });\n  try {\n    return await Promise.race([fetch(url, { signal: controller.signal }), timeout]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
    // The race may be awaited through a type assertion, a chained then, or a const it is stored in.
    shape({ race: 'await (Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => {\n      TIMER\n    })]) as Promise<unknown>)' }),
    shape({ race: 'await Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => {\n      TIMER\n    })]).then((value) => value)' }),
    'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  try {\n    const pending = Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 5); })]);\n    return await pending;\n  } finally {\n    clearTimeout(timer);\n  }\n}',
    // Chained handlers are followed.
    'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  return Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("t")); }, 1); })])\n    .catch((error) => { if (controller.signal.aborted) return undefined; throw error; })\n    .finally(() => { clearTimeout(timer); });\n}',
    // A race in a catch clause is still followed by the try statement's finally, but is not covered by that same catch clause.
    'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  try {\n    setup();\n  } catch (error) {\n    return await Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
    // A race with no timer arm is outside the rule.
    'async function f(a, b) { return Promise.race([a, b]); }',
    'async function f(arms) { return Promise.race(arms); }',
    'async function f() { return Promise.race([new Promise((resolve) => other(resolve))]); }',
    'async function f() { return Promise.race([...arms]); }',
    'async function f(a) { return Promise.race([a, , a]); }',
    // A timer outside a race is outside the rule.
    'setTimeout(() => {}, 1);',
    'new Promise((resolve) => setTimeout(resolve, 1));',
    // Not the Promise.race call.
    'async function f(a) { return Promise.all([a, new Promise((_, reject) => setTimeout(reject, 1))]); }',
    'async function f(a) { return promise["race"]([a, new Promise((_, reject) => setTimeout(reject, 1))]); }',
    'async function f(a) { return Other.race([a, new Promise((_, reject) => setTimeout(reject, 1))]); }',
    // An arm that is not a new Promise of a function is not read.
    'async function f(a, timeout) { return Promise.race([a, timeout]); }',
    'async function f(a) { return Promise.race([a, new Promise(makeExecutor())]); }',
    'async function f(a) { const other = 1; return Promise.race([a, other]); }',
    'async function f(a) { return Promise.race([a, new Other((_, reject) => setTimeout(reject, 1))]); }',
    'async function f(a) { const t = new Other(); return Promise.race([a, t]); }',
  ],
  invalid: [
    // The timer only rejects.
    {
      code: shape({ callback: '() => reject(new Error("timeout"))', catchClause: '' }),
      errors: [{ messageId: 'timeoutDoesNotAbort', line: 6 }],
    },
    // The expression-bodied executor of the issue: nothing aborts, and the timer id is discarded.
    {
      code: 'async function f(url) {\n  const controller = new AbortController();\n  return Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => setTimeout(() => reject(new Error("t")), 1))]);\n}',
      errors: [{ messageId: 'timeoutDoesNotAbort' }, { messageId: 'timerNotCleared' }],
    },
    // A callback the rule cannot read.
    {
      code: 'async function f(url) {\n  let timer;\n  try {\n    return await Promise.race([fetch(url), new Promise((_, reject) => { timer = setTimeout(onTimeout, 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
      errors: [{ messageId: 'timeoutDoesNotAbort' }],
    },
    {
      code: 'async function f(url) {\n  let timer;\n  try {\n    return await Promise.race([fetch(url), new Promise((_, reject) => { timer = setTimeout(controller.abort.bind(controller), 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
      errors: [{ messageId: 'timeoutDoesNotAbort' }],
    },
    // A callback that is a name bound to something other than a function.
    {
      code: 'async function f(url) {\n  const onTimeout = makeHandler();\n  let timer;\n  try {\n    return await Promise.race([fetch(url), new Promise((_, reject) => { timer = setTimeout(onTimeout, 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
      errors: [{ messageId: 'timeoutDoesNotAbort' }],
    },
    // The controller is created outside the function that holds the race.
    {
      code: 'const controller = new AbortController();\nasync function f(url) {\n  let timer;\n  try {\n    return await Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
      errors: [{ messageId: 'controllerNotLocal' }],
    },
    // The controller is a parameter.
    {
      code: 'async function f(url, controller) {\n  let timer;\n  try {\n    return await Promise.race([fetch(url), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
      errors: [{ messageId: 'controllerNotLocal' }],
    },
    // The controller belongs to an outer function.
    {
      code: 'function outer() {\n  const controller = new AbortController();\n  return async function inner(url) {\n    let timer;\n    try {\n      return await Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n    } finally {\n      clearTimeout(timer);\n    }\n  };\n}',
      errors: [{ messageId: 'controllerNotLocal' }],
    },
    // The local is not an AbortController.
    {
      code: 'async function f(url) {\n  const controller = makeController();\n  let timer;\n  try {\n    return await Promise.race([fetch(url), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
      errors: [{ messageId: 'controllerNotLocal' }],
    },
    // The receiver is not a plain identifier, or is not declared at all.
    {
      code: 'class C {\n  async f(url) {\n    let timer;\n    try {\n      return await Promise.race([fetch(url), new Promise((_, reject) => { timer = setTimeout(() => this.controller.abort(), 1); })]);\n    } finally {\n      clearTimeout(timer);\n    }\n  }\n}',
      errors: [{ messageId: 'controllerNotLocal' }],
    },
    {
      code: 'async function f(url) {\n  let timer;\n  try {\n    return await Promise.race([fetch(url), new Promise((_, reject) => { timer = setTimeout(() => globalController.abort(), 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
      errors: [{ messageId: 'controllerNotLocal' }],
    },
    // A race at module level has no function to hold a controller.
    {
      code: 'const controller = new AbortController();\nlet timer;\ntry {\n  await Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n} finally {\n  clearTimeout(timer);\n}',
      errors: [{ messageId: 'controllerNotLocal' }],
    },
    // The timer is never cleared.
    {
      code: shape({ finalizer: '', catchClause: '' }).replace('\n  }\n}', '\n  } finally {}\n}'),
      errors: [{ messageId: 'timerNotCleared' }],
    },
    {
      code: 'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  return Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n}',
      errors: [{ messageId: 'timerNotCleared' }],
    },
    // Cleared outside a finally: an error path leaves the timer pending.
    {
      code: 'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  const result = await Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n  clearTimeout(timer);\n  return result;\n}',
      errors: [{ messageId: 'timerNotCleared' }],
    },
    // A finally that clears some other timer.
    {
      code: shape({ finalizer: ' finally {\n    clearTimeout(other);\n  }', catchClause: '' }),
      errors: [{ messageId: 'timerNotCleared' }],
    },
    {
      code: shape({ finalizer: ' finally {\n    clearInterval(timer);\n  }', catchClause: '' }),
      errors: [{ messageId: 'timerNotCleared' }],
    },
    {
      code: shape({ finalizer: ' finally {\n    clearTimeout(timer.id);\n  }', catchClause: '' }),
      errors: [{ messageId: 'timerNotCleared' }],
    },
    {
      code: shape({ finalizer: ' finally {\n    clearTimeout();\n  }', catchClause: '' }),
      errors: [{ messageId: 'timerNotCleared' }],
    },
    // The id lives inside the executor, out of reach of the finally.
    {
      code: shape({ timer: 'const timer = setTimeout(CALLBACK, 1000);', declare: 'const controller = new AbortController();', finalizer: ' finally {\n    clearTimeout(timer);\n  }', catchClause: '' }),
      errors: [{ messageId: 'timerNotCleared' }],
    },
    // A finally chained on a different promise does not count, and one on the race in another function neither.
    {
      code: 'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  return Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]).then(() => 1);\n}',
      errors: [{ messageId: 'timerNotCleared' }],
    },
    {
      code: 'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  try {\n    setup(() => { clearTimeout(timer); });\n  } finally {\n    clearTimeout(timer);\n  }\n  return Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n}',
      errors: [{ messageId: 'timerNotCleared' }],
    },
    // A race in the finally clause is followed by nothing of that statement.
    {
      code: 'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  try {\n    setup();\n  } finally {\n    clearTimeout(timer);\n    await Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n  }\n}',
      errors: [{ messageId: 'timerNotCleared' }],
    },
    // Returned without await inside the try: the finally runs at once, clearing the timer before it can fire, and the catch never sees the rejection.
    {
      code: 'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  try {\n    return Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("t")); }, 5); })]);\n  } catch (error) {\n    if (!controller.signal.aborted) return undefined;\n    throw error;\n  } finally {\n    clearTimeout(timer);\n  }\n}',
      errors: [{ messageId: 'timerNotCleared' }],
    },
    {
      code: 'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  try {\n    const pending = Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 5); })]);\n    return pending;\n  } finally {\n    clearTimeout(timer);\n  }\n}',
      errors: [{ messageId: 'timerNotCleared' }],
    },
    // Awaited after the try block has ended: the finally still runs first.
    {
      code: 'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  let pending;\n  try {\n    pending = Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 5); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n  return await pending;\n}',
      errors: [{ messageId: 'timerNotCleared' }],
    },
    // The timer aborts a controller the raced request never received.
    {
      code: 'async function f(url) {\n  const controller = new AbortController();\n  const other = new AbortController();\n  let timer;\n  try {\n    return await Promise.race([fetch(url, { signal: other.signal }), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
      errors: [{ messageId: 'controllerNotUsedByRequest', data: { controller: 'controller' } }],
    },
    {
      code: 'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  try {\n    return await Promise.race([fetch(url), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
      errors: [{ messageId: 'controllerNotUsedByRequest' }],
    },
    // The request named by a const is read through its initialiser.
    {
      code: 'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  const request = fetch(url);\n  try {\n    return await Promise.race([request, new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
      errors: [{ messageId: 'controllerNotUsedByRequest' }],
    },
    // A catch that does not test the signal.
    {
      code: shape({ catchClause: ' catch (error) {\n    throw error;\n  }' }),
      errors: [{ messageId: 'catchDoesNotCheckAbort', data: { controller: 'controller' } }],
    },
    // A catch that tests the signal but does not return.
    {
      code: shape({ catchClause: ' catch (error) {\n    if (controller.signal.aborted) log(error);\n    throw error;\n  }' }),
      errors: [{ messageId: 'catchDoesNotCheckAbort' }],
    },
    // A catch that returns without testing the signal, or tests some other property or controller.
    {
      code: shape({ catchClause: ' catch (error) {\n    if (error) return undefined;\n    throw error;\n  }' }),
      errors: [{ messageId: 'catchDoesNotCheckAbort' }],
    },
    {
      code: shape({ catchClause: ' catch (error) {\n    if (controller.signal.reason) return undefined;\n    throw error;\n  }' }),
      errors: [{ messageId: 'catchDoesNotCheckAbort' }],
    },
    {
      code: shape({ catchClause: ' catch (error) {\n    if (controller.aborted) return undefined;\n    throw error;\n  }' }),
      errors: [{ messageId: 'catchDoesNotCheckAbort' }],
    },
    {
      code: shape({ catchClause: ' catch (error) {\n    if (other.signal.aborted) return undefined;\n    throw error;\n  }' }),
      errors: [{ messageId: 'catchDoesNotCheckAbort' }],
    },
    // A test that is true without an abort does not make the return an abort handler.
    {
      code: shape({ catchClause: ' catch (error) {\n    if (!controller.signal.aborted) return undefined;\n    throw error;\n  }' }),
      errors: [{ messageId: 'catchDoesNotCheckAbort' }],
    },
    {
      code: shape({ catchClause: ' catch (error) {\n    if (error instanceof Error || controller.signal.aborted) return undefined;\n    throw error;\n  }' }),
      errors: [{ messageId: 'catchDoesNotCheckAbort' }],
    },
    // A return inside a nested function is not an early return of the handler.
    {
      code: shape({ catchClause: ' catch (error) {\n    if (controller.signal.aborted) { later(() => { return 1; }); }\n    throw error;\n  }' }),
      errors: [{ messageId: 'catchDoesNotCheckAbort' }],
    },
    // A chained catch is held to the same rule.
    {
      code: 'async function f(url) {\n  const controller = new AbortController();\n  let timer;\n  return Promise.race([fetch(url, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => controller.abort(), 1); })])\n    .catch((error) => { throw error; })\n    .finally(() => { clearTimeout(timer); });\n}',
      errors: [{ messageId: 'catchDoesNotCheckAbort' }],
    },
    // Several timer arms are each checked.
    {
      code: 'async function f(url) {\n  let timer;\n  try {\n    return await Promise.race([new Promise((_, reject) => { timer = setTimeout(() => reject(1), 1); }), new Promise((_, reject) => { timer = setTimeout(() => reject(2), 2); })]);\n  } finally {\n    clearTimeout(timer);\n  }\n}',
      errors: [{ messageId: 'timeoutDoesNotAbort' }, { messageId: 'timeoutDoesNotAbort' }],
    },
  ],
});
