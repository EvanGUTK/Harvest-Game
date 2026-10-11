/**
 * FNV-1a, 32-bit: the one hash behind PRNG stream ids, the sim state hash and the `lang` goldens.
 * Design: docs/03-architecture/simulation-engine.md §State hash and §PRNG seeding.
 * Invariants: multiplication is `Math.imul`, results are uint32 (`>>> 0`); words are written as
 * four little-endian bytes of their int32 reinterpretation, so negative and uint32 inputs agree.
 * Lives in `lang` because `lang` cannot import `sim`; `sim` imports it from `@harvest/lang`.
 */

export const FNV1A_OFFSET_BASIS = 0x811c9dc5;
export const FNV1A_PRIME = 0x01000193;

const BYTE_MASK = 0xff;
const BITS_PER_BYTE = 8;
const BYTES_PER_WORD = 4;
const MAX_ASCII = 0x7f;

const INT32_MIN = -0x80000000;
const UINT32_MAX = 0xffffffff;
const MAX_BYTE = 0xff;

export type HashInputCode = 'LANG-HASH-ASCII-ONLY' | 'LANG-HASH-BAD-BYTE' | 'LANG-HASH-BAD-WORD';

/** Programmer error in a hash input: a value outside the domain the entry point defines. */
export class HashInputError extends Error {
  readonly code: HashInputCode;

  constructor(code: HashInputCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'HashInputError';
    this.code = code;
  }
}

function step(hash: number, byte: number): number {
  return Math.imul(hash ^ byte, FNV1A_PRIME) >>> 0;
}

/** FNV-1a over a sequence of byte values; a value that is not an integer in 0..255 is an invariant violation. */
export function fnv1a32Bytes(bytes: readonly number[]): number {
  let hash = FNV1A_OFFSET_BASIS;
  for (const byte of bytes) {
    if (!Number.isInteger(byte) || byte < 0 || byte > MAX_BYTE) {
      throw new HashInputError('LANG-HASH-BAD-BYTE', `a byte must be an integer in 0..255, got ${byte}`);
    }
    hash = step(hash, byte);
  }
  return hash;
}

/** FNV-1a over the ASCII bytes of `text` (stream ids). Any character above 0x7f is an invariant violation. */
export function fnv1a32Ascii(text: string): number {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code > MAX_ASCII) {
      throw new HashInputError(
        'LANG-HASH-ASCII-ONLY',
        `fnv1a32Ascii accepts ASCII only, got U+${code.toString(16)}`,
      );
    }
    bytes.push(code);
  }
  return fnv1a32Bytes(bytes);
}

/**
 * FNV-1a over a sequence of int32 words, each as four little-endian bytes (the state hash). A word is an
 * integer in −2^31..2^32−1 (an int32 or a uint32 read as its int32 reinterpretation); anything else is an
 * invariant violation, so an out-of-range value cannot alias another one silently.
 */
export function fnv1a32Words(words: readonly number[]): number {
  const bytes: number[] = [];
  for (const word of words) {
    if (!Number.isInteger(word) || word < INT32_MIN || word > UINT32_MAX) {
      throw new HashInputError(
        'LANG-HASH-BAD-WORD',
        `a word must be an integer in −2^31..2^32−1, got ${word}`,
      );
    }
    for (let byteIndex = 0; byteIndex < BYTES_PER_WORD; byteIndex += 1) {
      bytes.push((word >>> (byteIndex * BITS_PER_BYTE)) & BYTE_MASK);
    }
  }
  return fnv1a32Bytes(bytes);
}
