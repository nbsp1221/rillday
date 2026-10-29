import { type Locator, expect } from '@playwright/test';
import axe from 'axe-core';

export async function settleAnimations(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        element
          .getAnimations({ subtree: true })
          .some((animation) => animation.pending || animation.playState === 'running'),
      ),
    )
    .toBe(false);
}

interface Color {
  alpha: number;
  parseString(value: string): Color;
}

// axe-core exposes these public color utilities without TypeScript declarations.
interface Colors {
  Color: new (red?: number, green?: number, blue?: number, alpha?: number) => Color;
  flattenColors(front: Color, back: Color): Color;
  getContrast(background: Color, foreground: Color): number;
}

export async function appearance(locator: Locator) {
  const styles = await locator.evaluate((el) => {
    const styles = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const { color, backgroundColor, opacity, backgroundImage, filter, mixBlendMode } =
        getComputedStyle(node);
      styles.unshift({ color, backgroundColor, opacity, backgroundImage, filter, mixBlendMode });
    }
    return styles;
  });

  const { color } = axe.commons as typeof axe.commons & { color: Colors };
  const foreground = styles.at(-1)!.color;

  for (const style of styles) {
    if (
      style.backgroundImage !== 'none' ||
      style.filter !== 'none' ||
      style.mixBlendMode !== 'normal'
    ) {
      throw new Error('Contrast helper supports solid backgrounds without filters or blend modes');
    }
  }

  const paint = (text: boolean) => {
    let pixel = text ? new color.Color().parseString(foreground) : new color.Color(0, 0, 0, 0);

    // Opacity applies to each flattened group, including its descendants.
    for (const style of [...styles].reverse()) {
      pixel = color.flattenColors(pixel, new color.Color().parseString(style.backgroundColor));
      pixel.alpha *= Number(style.opacity);
    }

    return color.flattenColors(pixel, new color.Color(255, 255, 255, 1));
  };

  return {
    color: foreground,
    contrast: color.getContrast(paint(false), paint(true)),
    opacity: styles.map((style) => style.opacity),
  };
}
