/**
 * The Sprout language version, stamped on every bytecode module and snapshot.
 * Spec: docs/02-language/language-spec.md §Versioning. Lives apart from index.ts so the compiler and
 * VM can read it without importing their own package entry point.
 */

export const LANGUAGE_VERSION = '0.1.0';
