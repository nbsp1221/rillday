import assert from 'node:assert/strict';
import type { Locator } from '@playwright/test';

export async function visibleBox(locator: Locator) {
  const bounds = await locator.boundingBox();
  assert(bounds !== null, 'Expected a visible element with a bounding box');
  return bounds;
}
