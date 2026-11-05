import type { Preview } from '@storybook/react';
import '../src/ui/design-system/tokens.css';
import '../src/ui/design-system/controls.css';
import '../src/ui/design-system/application-theme.css';
import '../src/ui/teacherAtelier.css';
import '../src/ui/correctionAtelier.css';
import '../src/ui/atelierBLayout.css';
import '../src/ui/atelierBRubric.css';
import '../src/ui/atelierBProcessing.css';

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
