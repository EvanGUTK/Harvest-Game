/**
 * UTF-8 byte length without TextEncoder, so the engine stays free of host globals.
 * Used for the `maxSourceBytes` limit (language-spec.md §Limits).
 */

const TWO_BYTE_MIN = 0x80;
const THREE_BYTE_MIN = 0x800;
const FOUR_BYTE_MIN = 0x10000;

export function utf8Length(text: string): number {
  let bytes = 0;
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i) ?? 0;
    if (cp < TWO_BYTE_MIN) bytes += 1;
    else if (cp < THREE_BYTE_MIN) bytes += 2;
    else if (cp < FOUR_BYTE_MIN) bytes += 3;
    else bytes += 4;
    i += cp >= FOUR_BYTE_MIN ? 2 : 1;
  }
  return bytes;
}
