import type { Preview } from '@storybook/react';
// Keep this import order identical to src/main.tsx: Storybook must show the real app cascade.
import '../src/shared/ui/styles.css';
import '../src/correction/ui/correctionFlow.css';
import '../src/correction/ui/annotationInk.css';
import '../src/shared/ui/modelSelect.css';
import '../src/shared/ui/observability.css';
import '../src/shared/ui/design-system/tokens.css';
import '../src/shared/ui/design-system/controls.css';
import '../src/shared/ui/design-system/application-theme.css';
import '../src/correction/ui/teacherAtelier.css';
import '../src/correction/ui/correctionAtelier.css';
import '../src/correction/ui/atelierBLayout.css';
import '../src/correction/ui/atelierBRubric.css';
import '../src/shared/ui/aiToolsAtelier.css';
import '../src/evaluation/ui/modelEvaluationWorkspace.css';
import '../src/correction/ui/atelierBProcessing.css';

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
