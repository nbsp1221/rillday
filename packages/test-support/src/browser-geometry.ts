import type { Locator } from '@playwright/test';
import invariant from 'tiny-invariant';

export async function visibleBox(locator: Locator) {
  const bounds = await locator.boundingBox();
  invariant(bounds !== null, 'Expected a visible element with a bounding box');
  return bounds;
}
