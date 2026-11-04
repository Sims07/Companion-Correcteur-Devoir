import { parseModelJson } from './modelJson.ts';

export type StudentIdentityConfidence = 'high' | 'medium' | 'low';

export interface StudentIdentity {
  firstName: string | null;
  lastName: string | null;
  studentNumber: string | null;
  confidence: StudentIdentityConfidence;
}

export interface StudentIdentityExtraction {
  transcription: string;
  identity: StudentIdentity | null;
}

const identityMarker = /^\s*STUDENT_IDENTITY\s*:\s*(\{.*\})\s*$/i;

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized && !/^(null|unknown|inconnu|non renseigné|n\/a)$/i.test(normalized) ? normalized : null;
}

/** Removes machine-readable Vision metadata from the student transcription. */
export function extractStudentIdentity(raw: string): StudentIdentityExtraction {
  const lines = raw.replace(/\r/g, '').split('\n');
  let identity: StudentIdentity | null = null;
  const transcriptionLines = lines.filter((line) => {
    const match = line.match(identityMarker);
    if (!match) return true;
    try {
      const parsed: unknown = JSON.parse(match[1]);
      if (!parsed || typeof parsed !== 'object') return false;
      const value = parsed as Record<string, unknown>;
      const firstName = optionalText(value.firstName);
      const lastName = optionalText(value.lastName);
      const studentNumber = optionalText(value.studentNumber);
      const confidence = value.confidence === 'high' || value.confidence === 'medium' ? value.confidence : 'low';
      if (firstName || lastName || studentNumber) identity = { firstName, lastName, studentNumber, confidence };
    } catch {
      // Malformed metadata is ignored and never reaches the grading prompt.
    }
    return false;
  });
  return { transcription: transcriptionLines.join('\n').trim(), identity };
}

export function formatStudentIdentityLabel(identity: StudentIdentity): string | null {
  const name = [identity.lastName, identity.firstName].filter(Boolean).join(' ').trim();
  return name || identity.studentNumber;
}

/**
 * Automatically names an imported copy once its identity is readable, while
 * preserving labels intentionally entered by a teacher.
 *
 * PDF page renderers append "· page N" to the source filename, so the initial
 * queue label and first image's fileName are not always identical.
 */
export function resolveIdentifiedCopyLabel(
  currentLabel: string,
  identity: StudentIdentity,
  firstPageFileName?: string,
): string {
  const proposed = formatStudentIdentityLabel(identity);
  if (!proposed || identity.confidence === 'low') return currentLabel;

  const label = currentLabel.trim();
  const importedFileName = firstPageFileName?.trim().replace(/\s*·\s*page\s+\d+$/i, '') ?? '';
  const isProvisional =
    label === '' ||
    /^copie\s*\d+$/i.test(label) ||
    /^copie\s+en\s+cours$/i.test(label) ||
    label === firstPageFileName?.trim() ||
    (importedFileName !== '' && label === importedFileName) ||
    /\.(?:pdf|png|jpe?g|webp|heic|tiff?)$/i.test(label);
  return isProvisional ? proposed : currentLabel;
}


/** Parses a dedicated, machine-readable Vision response without inferring missing identity fields. */
export function parseStudentIdentityResponse(raw: string): StudentIdentity | null {
  try {
    const parsed = parseModelJson(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    const firstName = optionalText(value.firstName ?? value.prenom);
    const lastName = optionalText(value.lastName ?? value.nom);
    const studentNumber = optionalText(value.studentNumber ?? value.numeroEtudiant ?? value.numero_etudiant);
    if (!firstName && !lastName && !studentNumber) return null;
    const rawConfidence = value.confidence ?? value.confiance;
    const confidence = rawConfidence === 'high' || rawConfidence === 'élevée' ? 'high'
      : rawConfidence === 'medium' || rawConfidence === 'moyenne' ? 'medium' : 'low';
    return { firstName, lastName, studentNumber, confidence };
  } catch { return null; }
}
