/**
 * The Sprout engine: the one object hosts use to compile programs and run them.
 * Spec: docs/03-architecture/interpreter-vm.md §Public API (LangEngine).
 * Invariants: stateless, so every call is independent and one engine can serve any number of
 * players; compile is the compiler's pipeline (lex → parse → resolve → check → emit → validate);
 * createVM, like compile and restoreVM, refuses another language version as a host bug
 * (LANG-VERSION-MISMATCH, chief ruling 2026-10-12).
 */

import { compile } from './compiler/compile';
import { InvariantError } from './invariant';
import { countTokens } from './lexer/count-tokens';
import type { BytecodeModule, LangEngine, Limits, VM } from './types';
import { LANGUAGE_VERSION } from './version';
import { Machine, restoreMachine } from './vm/machine';
import { valueOps } from './vm/value';

export function createLangEngine(): LangEngine {
  return {
    compile,
    countTokens,
    createVM,
    restoreVM: restoreMachine,
    values: valueOps,
  };
}

function createVM(module: BytecodeModule, limits: Limits): VM {
  if (module.languageVersion !== LANGUAGE_VERSION) {
    throw new InvariantError(
      'LANG-VERSION-MISMATCH',
      `module language ${module.languageVersion} is not ${LANGUAGE_VERSION}`,
    );
  }
  return new Machine(module, limits);
}
