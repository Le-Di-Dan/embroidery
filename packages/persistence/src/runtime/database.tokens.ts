/**
 * Injection tokens for the persistence runtime.
 *
 * Symbols rather than strings so a token cannot be collided with (or guessed)
 * by an unrelated provider, and so a missing import fails at compile time.
 */
export const DATABASE_CONFIG = Symbol('DATABASE_CONFIG');
export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');
