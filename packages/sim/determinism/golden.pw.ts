import { expect, test } from '@playwright/test';
import { expected } from '../src/__golden__/expected';
import { buildGoldenBundle } from './bundle';
import type { GoldenApi } from './browser-entry';

const PAGE = '<!doctype html><meta charset="utf-8"><title>determinism</title>';

let bundle = '';

test.beforeAll(async () => {
  bundle = await buildGoldenBundle();
});

test.beforeEach(async ({ page }) => {
  await page.setContent(PAGE);
  await page.addScriptTag({ content: bundle });
});

test.describe('golden scenarios, played in the browser engine (testing.md §Cross-engine determinism)', () => {
  test('plays the same cases the committed goldens name, in the same order', async ({ page }) => {
    const names = await page.evaluate(() =>
      (window as unknown as { goldens: GoldenApi }).goldens.caseNames(),
    );
    expect(names).toEqual(Object.keys(expected));
  });

  for (const [name, golden] of Object.entries(expected)) {
    test(`${name}: every hash and the final hash equal the committed golden`, async ({ page }) => {
      const played = await page.evaluate(
        (caseName) => (window as unknown as { goldens: GoldenApi }).goldens.runGolden(caseName),
        name,
      );
      expect(played.hashes).toEqual(golden.hashes);
      expect(played.finalStateHash).toBe(golden.finalStateHash);
    });
  }
});
