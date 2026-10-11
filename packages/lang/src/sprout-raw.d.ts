/**
 * Type for `*.sprout?raw` imports (Vite/Vitest load the file's text at build time, no runtime file
 * access), used only to bring the shared corpus `packages/lang/__corpus__/*.sprout` into tests.
 * Spec: docs/03-architecture/interpreter-vm.md §Parser (shared test corpus).
 */
declare module '*.sprout?raw' {
  const text: string;
  export default text;
}
