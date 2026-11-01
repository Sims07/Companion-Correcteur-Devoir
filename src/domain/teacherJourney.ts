import { validateRubric, type Rubric } from './rubric.ts';

export type TeacherEntryStep = 'assignment' | 'copies';

export function getTeacherEntryStep(rubric: Rubric): TeacherEntryStep {
  return validateRubric(rubric).valid ? 'copies' : 'assignment';
}
