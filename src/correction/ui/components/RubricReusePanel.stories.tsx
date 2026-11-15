import type { Meta, StoryObj } from '@storybook/react';
import { RubricReusePanel } from './RubricReusePanel.tsx';
import './TeacherSetup.css';

const rubric = { title: 'Cycle cellulaire', criteria: [
  { id: 'mitose', title: 'Phases de la mitose', description: 'Identifier les phases.', maxPoints: 5 },
  { id: 'fuseau', title: 'Fuseau mitotique', description: 'Expliquer le mécanisme.', maxPoints: 3 },
] };
const meta = {
  title: 'Parcours enseignant/Réutiliser des critères',
  component: RubricReusePanel,
  tags: ['autodocs'],
  args: {
    assignments: [
      { id: 'source', title: 'Biologie cellulaire L1', rubric },
      { id: 'target', title: 'Nouveau devoir', rubric: { title: 'Nouveau barème', criteria: [] } },
    ],
    activeAssignmentId: 'target',
    rubric: { title: 'Nouveau barème', criteria: [] },
    onReuse: () => undefined,
  },
} satisfies Meta<typeof RubricReusePanel>;

export default meta;
type Story = StoryObj<typeof meta>;
export const DepuisUnDevoir: Story = {};
