export interface AssignmentContextInput { title: string; description?: string; educationLevel?: string; question: string; }

/** Adds pedagogical context to the grading prompt without changing the rubric itself. */
export function buildAssignmentContext(input: AssignmentContextInput): string {
  const context: string[] = [];
  if (input.title.trim()) context.push('Nom du devoir : ' + input.title.trim());
  if (input.description?.trim()) context.push('Description et objectifs pédagogiques : ' + input.description.trim());
  if (input.educationLevel?.trim()) context.push('Niveau du public évalué : ' + input.educationLevel.trim() + '. Adaptez les attentes au niveau indiqué, sans ajouter de critères ni de points absents du barème.');
  context.push('Consigne de l’exercice : ' + input.question.trim());
  return context.join('\n\n');
}
