// minimatch bounds the number of extglobs in one path segment, because compiling them recurses and enough of them exhaust the call stack. This is one more than it accepts.
const EXTGLOBS_PAST_THE_BOUND = 257;

/** A glob minimatch refuses to compile, for tests of the error an option reports. */
export const UNCOMPILABLE_GLOB = '+(a)'.repeat(EXTGLOBS_PAST_THE_BOUND);
