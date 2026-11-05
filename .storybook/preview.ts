import type { Preview } from '@storybook/react';
// Keep this import order identical to src/main.tsx: Storybook must show the real app cascade.
import '../src/ui/styles.css';
import '../src/ui/correctionFlow.css';
import '../src/ui/annotationInk.css';
import '../src/ui/modelSelect.css';
import '../src/ui/observability.css';
import '../src/ui/design-system/tokens.css';
import '../src/ui/design-system/controls.css';
import '../src/ui/design-system/application-theme.css';
import '../src/ui/teacherAtelier.css';
import '../src/ui/correctionAtelier.css';
import '../src/ui/atelierBLayout.css';
import '../src/ui/atelierBRubric.css';
import '../src/ui/aiToolsAtelier.css';
import '../src/ui/modelEvaluationWorkspace.css';
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
        order: ['Fondations', 'Composants', 'Parcours enseignant', 'Outils IA'],
      },
    },
  },
  tags: ['autodocs'],
};

export default preview;
