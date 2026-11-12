import { getRubricSubcriteria, type Rubric, type RubricCriterion, type RubricSubcriterion } from './rubric.ts';
import type { GradingProposal } from './grading.ts';

/**
 * A literal/lexical audit is NOT scientific entailment. It can disprove that a
 * cited passage is usable, but cannot prove that a biological relation is true.
 * False alarms become teacher reviews, never automatic zeroes or made-up quotes.
 */
export type GradingEvidenceCheck = 'located' | 'needs-review';

const neutral = new Set([
  'a','au','aux','avec','ce','ces','cet','cette','dans','de','des','du','elle','en','est','et','ils',
  'il','la','le','les','leur','leurs','lors','mais','ne','ni','ou','par','pas','pour','que','qui',
  'se','ses','son','sur','une','un','verifier','affirme','affirmation','reponse','etudiant',
  'attendu','attendus','critere','criteres','sous','element','elements','correct','correcte',
  'presente','present','presence','absence','lieu','besoin','produit','produits',
  'reactif','reactifs','utilise','utilisee','utilises','consomme','consommee','consommes',
  'libere','liberee','synthese','synthetise','synthetises','permet','principalement',
  'exact','exacte','partie','point','points','notamment','exemple','comme','concerne',
  'mesure','mesures','mesuree','mesurees','relevee','relevees','unite','unites',
  'decrit','explique','conduit','necessaire','utilisation','production','pendant',
]);

export function normalizeEvidenceText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function keywords(text: string): string[] {
  return [...new Set((normalizeEvidenceText(text).match(/[a-z0-9]+/g) ?? [])
    .filter((token) => (token.length > 2 || /^[a-z]+[0-9]+$/.test(token)) && !neutral.has(token)))];
}

/** A conservative lexical normalizer for French singular/plural surface forms.
 * It does not turn word similarity into evidence of scientific correctness. */
function evidenceRoot(token: string): string {
  return token.length >= 5 ? token.replace(/[sx]$/, '') : token;
}
function hasRoot(tokens: Iterable<string>, root: string): boolean {
  return [...tokens].some((token) => evidenceRoot(token) === root);
}

/**
 * Use alternatives supplied by the TEACHER only when the same clause explicitly
 * refers to this particular subcriterion. Never spread all contract synonyms
 * across every expected relation.
 */
function expectationKeywords(criterion: RubricCriterion, subcriterion: RubricSubcriterion): {
  heading: string[]; description: string[]; alternatives: string[];
} {
  const contextKeywords = new Set(parentConcept(criterion).map(evidenceRoot));
  const heading = keywords(subcriterion.title).filter((word) => !contextKeywords.has(evidenceRoot(word)));
  const description = keywords(subcriterion.description).filter((word) => !contextKeywords.has(evidenceRoot(word)));
  const anchorRoots = new Set(normalizeEvidenceText(subcriterion.title + ' ' + subcriterion.description)
    .split(' ').filter((token) => token.length > 2).map(evidenceRoot));
  const alternatives = (criterion.correctionContract?.acceptedAlternatives ?? '').split(/[;\n]/)
    .flatMap((clause) => {
      const clauseTokens = normalizeEvidenceText(clause).split(' ').filter(Boolean);
      // The phrase must refer to this teacher-authored expectation, including
      // short meaningful anchors such as "ATP" and "O2".
      return clauseTokens.some((token) => anchorRoots.has(evidenceRoot(token)))
        ? keywords(clause).filter((token) => !contextKeywords.has(evidenceRoot(token))) : [];
    });
  return { heading, description, alternatives: [...new Set(alternatives)] };
}

/** OCR may contain the printed assignment question as well as the student answer.
 * A source quote from the printed question must NEVER validate an awarded point.
 * If no explicit answer delimiter exists, retain the original transcription. */
export function studentAnswerForEvidence(transcription: string): string {
  const marker = /(?:^|\n)\s*(?:\*\*)?r[eé]ponse(?:\s+de\s+l['’](?:[eé]tudiant|[eé]l[eè]ve))?(?:\*\*)?\s*:?\s*(?:\r?\n|$)/i.exec(transcription);
  return marker ? transcription.slice(marker.index + marker[0].length).trim() : transcription;
}

/**
 * When the teacher identified a question, inspect only that question's student
 * answer. The scope is trusted only with explicit question AND answer markers:
 * printed questions and answers to another question must not supply evidence.
 */
function questionAnswerForEvidence(transcription: string, questionId: string): string | null {
  const headings = [...transcription.matchAll(/(?:^|\r?\n)\s*Question\s+(\d+)\b[^\r\n]*(?:\r?\n|$)/gi)];
  const index = headings.findIndex((heading) => heading[1] === questionId);
  if (index < 0) return null;
  const heading = headings[index]!;
  const start = heading.index! + heading[0].length;
  const end = headings[index + 1]?.index ?? transcription.length;
  const section = transcription.slice(start, end);
  const answer = studentAnswerForEvidence(section);
  return answer !== section && answer.length > 0 ? answer : null;
}

function findCitation(transcription: string, evidence: string): { excerpt: string; at: number } | null {
  const clean = normalizeEvidenceText(evidence);
  const source = normalizeEvidenceText(transcription);
  if (!clean || !source || clean.length < 8 || /(preuve non disponible|preuve a verifier|aucun passage probant|attendu non demontre|presence signalee)/.test(clean)) return null;
  const whole = source.indexOf(clean);
  if (whole >= 0) return { excerpt: clean, at: whole };
  // Explicit ellipses can omit intervening words, but each meaningful fragment
  // must occur in order; merely sharing a couple of keywords is not a quote.
  const fragments = evidence.split(/\.{2,}|…/g).map(normalizeEvidenceText)
    .filter((fragment) => fragment.length >= 8);
  if (fragments.length < 1 || fragments.length > 5) return null;
  let position = 0;
  let first = -1;
  for (const fragment of fragments) {
    const found = source.indexOf(fragment, position);
    if (found < 0) return null;
    if (first < 0) first = found;
    position = found + fragment.length;
  }
  return first < 0 ? null : { excerpt: clean, at: first };
}

function parentConcept(criterion: RubricCriterion): string[] {
  // Parent headings like "Respiration : besoins" identify the subject of a
  // relationship. Headings without this explicit split are not treated as
  // compulsory subjects.
  const parent = criterion.title.split(':');
  if (parent.length < 2) return [];
  return keywords(parent[0] ?? '');
}

function evidenceConcernsExpectation(
  transcription: string,
  evidence: string,
  at: number,
  criterion: RubricCriterion,
  subcriterion: RubricSubcriterion,
  verifiedQuestionScope = false,
): boolean {
  const citation = normalizeEvidenceText(evidence);
  const contextKeywords = new Set(parentConcept(criterion));
  const terms = expectationKeywords(criterion, subcriterion);
  const relevantKeywords = [...new Set([...terms.heading, ...terms.description, ...terms.alternatives])];
  const citationTokens = citation.split(' ').map(evidenceRoot);
  if (relevantKeywords.length && !relevantKeywords.some((word) => citationTokens.includes(evidenceRoot(word)))) return false;
  // A question number validated against the teacher's contract supplies scope:
  // the student's answer need not repeat the phenomenon already in its question.
  // Unscoped copies still require textual subject context, preserving the
  // existing protection against cross-question keyword leakage.
  if (contextKeywords.size && !verifiedQuestionScope) {
    const normalizedSource = normalizeEvidenceText(transcription);
    const localContext = normalizedSource.slice(Math.max(0, at - 480), at + Math.min(140, citation.length));
    if (![...contextKeywords].some((word) => hasRoot(localContext.split(' '), evidenceRoot(word)))) return false;
  }
  // Explicit contradiction or polarity reversal needs a teacher review.
  // This heuristic is deliberately conservative; it never awards/removes points.
  if (/(\bne\b.{0,80}\bpas\b|\bn\s+a\s+pas\b|\bjamais\b|\bau\s+lieu\s+(?:de|d)\b)/.test(citation)) return false;
  return true;
}

/**
 * Native choice models cannot produce quotations. Locate a candidate sentence
 * only using the teacher's own title/description and literal student text. A
 * candidate is not automatically an accepted scientific proof: callers MUST
 * run the same traceability/semantic-cue audit on it.
 */
export function findStudentExcerptForExpectation(
  transcription: string, criterion: RubricCriterion, subcriterion: RubricSubcriterion,
): string {
  const contextKeywords = new Set(parentConcept(criterion).map(evidenceRoot));
  const terms = expectationKeywords(criterion, subcriterion);
  const headingKeywords = terms.heading;
  const descriptionKeywords = [...new Set([...terms.description, ...terms.alternatives])];
  const source = studentAnswerForEvidence(transcription);
  const sentences = source.split(/\n+|(?<=[.!?])\s+/g).map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8 && sentence.length <= 400);
  let best = '';
  let bestScore = 0;
  for (const sentence of sentences) {
    const tokens = new Set(normalizeEvidenceText(sentence).split(' ').map(evidenceRoot));
    const headingHits = headingKeywords.filter((word) => tokens.has(evidenceRoot(word))).length;
    const descriptionHits = descriptionKeywords.filter((word) => tokens.has(evidenceRoot(word))).length;
    if (!headingHits && !descriptionHits) continue;
    const subjectHits = [...contextKeywords].filter((word) => tokens.has(word)).length;
    const score = 3 * headingHits + descriptionHits + 4 * subjectHits;
    if (score > bestScore) { bestScore = score; best = sentence; }
  }
  return best;
}

/** "located" only means a plausible quote was found, not scientific validity. */
export function checkStudentEvidence(
  transcription: string, evidence: string, criterion: RubricCriterion, subcriterion: RubricSubcriterion,
  verifiedQuestionScope = false,
): GradingEvidenceCheck {
  return inspectPositiveEvidence(studentAnswerForEvidence(transcription), evidence, criterion, subcriterion, verifiedQuestionScope);
}

function inspectPositiveEvidence(
  transcription: string, evidence: string, criterion: RubricCriterion,
  subcriterion: RubricSubcriterion, verifiedQuestionScope = false,
): GradingEvidenceCheck {
  const match = findCitation(transcription, evidence);
  if (!match) return 'needs-review';
  if (!evidenceConcernsExpectation(transcription, evidence, match.at, criterion, subcriterion, verifiedQuestionScope)) return 'needs-review';
  return 'located';
}

/** Applies *negative-only* evidence checks to positive scores. The score is kept
 * as a visible provisional suggestion; evidence that is untraceable or unrelated
 * blocks automatic acceptance and identifies the exact teacher-defined item.
 */
export function auditGradingEvidence(
  proposal: GradingProposal, rubric: Rubric, transcription: string,
): GradingProposal {
  if (!transcription.trim()) return proposal;
  const studentText = studentAnswerForEvidence(transcription);
  const questions = [...proposal.questionsForTeacher];
  const criteria = proposal.criteria.map((item) => {
    const teacherCriterion = rubric.criteria.find((candidate) => candidate.id === item.criterionId);
    if (!teacherCriterion || teacherCriterion.analysisMode === 'scientific-diagram') return item;
    const defined = getRubricSubcriteria(teacherCriterion);
    if (!defined.length || !item.subcriteria) return item;
    const evidenceQuestions: string[] = [];
    const questionAnswer = teacherCriterion.correctionContract?.question?.id
      ? questionAnswerForEvidence(transcription, teacherCriterion.correctionContract.question.id)
      : null;
    const evidenceSource = questionAnswer ?? studentText;
    const verifiedQuestionScope = questionAnswer !== null;
    const subcriteria = item.subcriteria.map((sub) => {
      const expected = defined.find((entry) => entry.id === sub.subcriterionId);
      if (!expected || sub.points <= 0 || sub.assessmentStatus === 'not-evaluated') return sub;
      const evidenceStatus = inspectPositiveEvidence(evidenceSource, sub.evidence, teacherCriterion, expected, verifiedQuestionScope);
      if (evidenceStatus === 'located') return { ...sub, evidenceStatus };
      const question = 'Vérifiez la preuve de « ' + teacherCriterion.title + ' / ' + expected.title
        + ' » : citation absente, non littérale ou ne démontrant pas clairement l’attendu.';
      evidenceQuestions.push(question);
      return { ...sub, evidenceStatus, assessmentStatus: 'not-evaluated' as const, questionForTeacher: question };
    });
    if (!evidenceQuestions.length) return { ...item, subcriteria };
    questions.push(...evidenceQuestions);
    return {
      ...item, subcriteria, assessmentStatus: 'not-evaluated' as const,
      confidence: 'low' as const,
      questionForTeacher: [item.questionForTeacher, ...evidenceQuestions].filter(Boolean).join(' '),
    };
  });
  return {
    ...proposal, criteria, questionsForTeacher: [...new Set(questions)],
    ...(criteria.some((criterion) => criterion.assessmentStatus === 'not-evaluated') ? { scoreIncomplete: true } : {}),
  };
}
