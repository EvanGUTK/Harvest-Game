/**
 * The shared Sprout test corpus (`packages/lang/__corpus__/*.sprout`) as source files, in a fixed order.
 * Spec: docs/03-architecture/interpreter-vm.md §Parser (the corpus keeps the parser and the editor's Lezer
 * grammar in sync), §Testing (AST snapshots). Test support only; not part of the public API.
 * Invariant: every `.sprout` file in `__corpus__` is listed here exactly once (checked by review: tests
 * cannot list a directory without Node APIs).
 */

import crlf from '../../__corpus__/crlf.sprout?raw';
import errors from '../../__corpus__/errors.sprout?raw';
import expressions from '../../__corpus__/expressions.sprout?raw';
import layout from '../../__corpus__/layout.sprout?raw';
import lexical from '../../__corpus__/lexical.sprout?raw';
import specExample from '../../__corpus__/spec-example.sprout?raw';
import starterShowdown from '../../__corpus__/starter-showdown.sprout?raw';
import statements from '../../__corpus__/statements.sprout?raw';
import stringsComments from '../../__corpus__/strings-comments.sprout?raw';
import type { SourceFile } from '../types';

export const CORPUS: readonly SourceFile[] = [
  { name: 'spec-example.sprout', text: specExample },
  { name: 'starter-showdown.sprout', text: starterShowdown },
  { name: 'expressions.sprout', text: expressions },
  { name: 'statements.sprout', text: statements },
  { name: 'layout.sprout', text: layout },
  { name: 'strings-comments.sprout', text: stringsComments },
  { name: 'crlf.sprout', text: crlf },
  { name: 'errors.sprout', text: errors },
  { name: 'lexical.sprout', text: lexical },
];
