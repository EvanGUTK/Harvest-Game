import { describe, expect, it } from 'vitest';
import { InvariantError, assertNever } from './invariant';

describe('InvariantError and assertNever (standards.md §Errors, §TypeScript)', () => {
  it('carries a stable code, a name and the code in the message', () => {
    const e = new InvariantError('LANG-HEAP-INDEX', 'slot 3');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('LANG-HEAP-INDEX');
    expect(e.name).toBe('InvariantError');
    expect(e.message).toBe('LANG-HEAP-INDEX: slot 3');
  });

  it('throws LANG-UNREACHABLE when a value escapes an exhaustive switch', () => {
    const escaped = 'surprise' as never;
    try {
      assertNever(escaped);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvariantError);
      expect((e as InvariantError).code).toBe('LANG-UNREACHABLE');
    }
  });
});
