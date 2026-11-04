import type { Preview } from '@storybook/react';
import '../src/ui/design-system/tokens.css';
import '../src/ui/design-system/controls.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'padded',
    options: {
      storySort: {
        order: ['Fondations', 'Composants'],
      },
    },
  },
  tags: ['autodocs'],
};

export default preview;
