import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import '@repo/ui/styles/fonts/web.css';
import './gallery.css';
import { Choices, NumericChoices } from './WorkspaceChoice.story';

const stories: Record<string, ComponentType<{ locale?: string }>> = { Choices, NumericChoices };
const container = document.getElementById('root')!;
let root = createRoot(container);

Object.assign(window, {
  async mount({
    story,
    props = {},
  }: {
    story: string;
    props?: { locale?: string; theme?: string };
  }) {
    const Story = stories[story];
    if (!Story) {
      throw new Error(`Unknown component story: ${story}`);
    }
    document.documentElement.dataset.theme = props.theme ?? 'dark';
    document.documentElement.classList.toggle('dark', props.theme !== 'light');
    document.documentElement.lang = props.locale ?? 'en';
    await new Promise<void>((ready) => {
      root.render(
        <div
          ref={(element) => {
            if (element) {
              ready();
            }
          }}
        >
          <Story key={story} locale={props.locale} />
        </div>,
      );
    });
    await document.fonts.ready;
  },
  unmount() {
    root.unmount();
    root = createRoot(container);
  },
});
