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

/** Programmer error in a hash input (a character outside ASCII where only ASCII is defined). */
export class HashInputError extends Error {
  readonly code = 'LANG-HASH-ASCII-ONLY';

  constructor(message: string) {
    super(`LANG-HASH-ASCII-ONLY: ${message}`);
    this.name = 'HashInputError';
  }
}

function step(hash: number, byte: number): number {
  return Math.imul(hash ^ byte, FNV1A_PRIME) >>> 0;
}

/** FNV-1a over a sequence of byte values (each 0..255). */
export function fnv1a32Bytes(bytes: readonly number[]): number {
  let hash = FNV1A_OFFSET_BASIS;
  for (const byte of bytes) hash = step(hash, byte);
  return hash;
}

/** FNV-1a over the ASCII bytes of `text` (stream ids). Any character above 0x7f is an invariant violation. */
export function fnv1a32Ascii(text: string): number {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code > MAX_ASCII) {
      throw new HashInputError(`fnv1a32Ascii accepts ASCII only, got U+${code.toString(16)}`);
    }
    bytes.push(code);
  }
  return fnv1a32Bytes(bytes);
}

/** FNV-1a over a sequence of int32 words, each as four little-endian bytes (the state hash). */
export function fnv1a32Words(words: readonly number[]): number {
  const bytes: number[] = [];
  for (const word of words) {
    for (let byteIndex = 0; byteIndex < BYTES_PER_WORD; byteIndex += 1) {
      bytes.push((word >>> (byteIndex * BITS_PER_BYTE)) & BYTE_MASK);
    }
  }
  return fnv1a32Bytes(bytes);
}
