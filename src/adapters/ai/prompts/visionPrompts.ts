/** Instructions de lecture, d'identité et de séparation des annotations. */

export function buildTranscriptionPrompt(model: string, mode: 'auto' | 'ocr' | 'general' = 'auto'): string {
  const dedicatedOcr = mode === 'ocr' || (mode === 'auto' && /(?:glm[-_]?ocr|ocr[-_]?model|paddleocr|dots[-_]?ocr)/i.test(model));
  const basePrompt = dedicatedOcr
    ? /glm[-_]?ocr/i.test(model)
      ? [
          'Text Recognition:',
          'For tables, preserve the original row and column structure. Transcribe a table as aligned rows with explicit column separators; keep headers, cell boundaries, empty cells, units and values in their original positions.',
          'Do not flatten a table into prose or merge adjacent cells. Keep table titles and notes immediately before or after the table.',
          'If a cell is unreadable, mark only that cell as [illisible] without shifting the other columns.',
        ].join('\n')
      : 'Text Recognition:'
    : [
        'Transcris fidèlement tout le contenu visible de cette page, dans son ordre de lecture.',
        'Conserve les numéros, titres, paragraphes, listes, tableaux, unités, symboles et retours à la ligne utiles.',
        'Ne résous pas les questions, ne corrige pas les réponses et ne reformule pas le texte.',
        'Si un passage est réellement illisible, écris [illisible]. Ne devine, ne complète et n’invente aucun mot.',
        'Ne répète aucun passage. N’ajoute aucun préambule, commentaire ni conclusion.',
        'Réduis les zones blanches à au plus deux lignes vides consécutives afin de ne pas interrompre la transcription.',
      ].join('\n');
  return basePrompt;
}

/** Dedicated first-page-only identity task, deliberately separate from answer transcription. */
export function buildStudentIdentityPrompt(): string {
  return [
    'RÔLE : identifie l’étudiant indiqué sur la première page d’une copie universitaire.',
    'ZONE À EXAMINER : uniquement la bande supérieure de la page, en particulier l’en-tête en haut à gauche et en haut à droite, ainsi que les champs administratifs immédiatement associés.',
    'N’examine pas le corps de la copie pour rechercher un nom. Un nom cité dans une réponse, un exemple ou une question ne constitue jamais l’identité de l’étudiant.',
    'Extrais uniquement les valeurs explicitement lisibles : firstName (prénom), lastName (nom), studentNumber (numéro étudiant). Ne complète pas un champ partiel et ne devine jamais.',
    'Si un champ est absent ou illisible, retourne null pour ce champ. Si aucun champ d’identité exploitable n’est visible, retourne null pour les trois champs et confidence "low".',
    'confidence vaut "high" si les champs identifiés sont nets et non ambigus, "medium" si une partie est incertaine, et "low" si aucune identité exploitable n’est visible.',
    'FORMAT DE SORTIE : réponds UNIQUEMENT par un objet JSON, sans texte avant ni après, sans Markdown. Champs obligatoires : firstName, lastName, studentNumber (chaînes ou null) et confidence (low, medium ou high). Exemple neutre : {"firstName":null,"lastName":null,"studentNumber":null,"confidence":"low"}.',
  ].join('\n\n');
}


export function buildTeacherAnnotationPrompt(originalPageText: string): string {
  return [
    'Tu réalises une seconde passe de séparation éditoriale sur cette page déjà transcrite. Identifie les annotations possiblement ajoutées par le professeur et produis une transcription fidèle du seul travail de l’étudiant.',
    'Repère les commentaires en marge, corrections, coches, croix, cercles, soulignements de correction et notes déjà attribuées. Une couleur différente est un indice, jamais une preuve : un étudiant peut utiliser plusieurs couleurs et un professeur peut écrire dans la même couleur.',
    'Distingue comment, correction, score (note/points déjà inscrits), mark (coche, croix, cercle) et unknown. Ne confonds jamais une réponse de l’étudiant, une rature ou une autocorrection de l’étudiant avec une annotation professorale.',
    'RÈGLE DE CONSERVATION : studentTranscription doit reprendre fidèlement le texte étudiant initial, sans reformulation, correction orthographique, résumé ni ajout. Retire uniquement les annotations de confiance high. Les annotations medium ou low doivent être signalées et nécessitent une confirmation explicite de l’enseignant avant toute correction.',
    'Ne supprime jamais une réponse, un mot barré, une rature, un schéma ou une tentative de l’étudiant au seul motif qu’il est corrigé, entouré, souligné ou écrit dans une autre couleur.',
    'N’invente rien.',
    'Analyse l’image entière, y compris les marges, les corrections superposées et les notes manuscrites. Utilise la transcription initiale comme aide pour préserver exactement les réponses de l’étudiant.',
    'TRANSCRIPTION INITIALE DE LA PAGE :\n<transcription_initiale>\n' + originalPageText + '\n</transcription_initiale>',
    'FORMAT DE SORTIE : réponds UNIQUEMENT par un objet JSON, sans texte ni Markdown. studentTranscription est obligatoire ; annotations est un tableau. Chaque annotation contient text, kind (comment, correction, score, mark, unknown), color, location, confidence (low, medium, high) et points (nombre ou null). Exemple neutre : {"studentTranscription":"Texte étudiant.","annotations":[]}.',
  ].join('\n\n');
}
