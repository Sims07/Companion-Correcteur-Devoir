import type { GradingProvider, ImageInput, DiagnosticModelResult } from '../ports/aiProvider.ts';

/** Read the reference document before any visual scoring that depends on it.
 * The provider uses its dedicated subject-reading prompt and stops before
 * transcribing a student's answer or contacting the analysis model.
 */
export async function transcribeSubjectReference(
  provider: GradingProvider,
  subjectImages: ImageInput[],
  signal?: AbortSignal,
  onDiagnosticResult?: (result: DiagnosticModelResult) => void,
): Promise<string> {
  if (!subjectImages.length) throw new Error('Importez le sujet de référence pour analyser les schémas.');
  const transcription = await provider.generate({
    question: 'Transcrire fidèlement le sujet de référence sans résoudre les exercices.',
    rubric: '{"title":"Sujet de référence","criteria":[]}',
    images: subjectImages,
    subjectImages,
    visionOnly: true,
    subjectOnly: true,
  }, undefined, undefined, undefined, onDiagnosticResult, undefined, undefined, undefined, signal);
  if (!transcription.trim()) throw new Error('Le sujet de référence n’a pas pu être lu : aucune note ne peut en dépendre.');
  return transcription.trim();
}
