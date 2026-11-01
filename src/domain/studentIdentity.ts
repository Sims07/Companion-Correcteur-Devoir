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


/** Parses a dedicated, machine-readable Vision response without inferring missing identity fields. */
export function parseStudentIdentityResponse(raw: string): StudentIdentity | null {
  try {
    const normalized = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed: unknown = JSON.parse(normalized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    const firstName = optionalText(value.firstName);
    const lastName = optionalText(value.lastName);
    const studentNumber = optionalText(value.studentNumber);
    if (!firstName && !lastName && !studentNumber) return null;
    const confidence = value.confidence === 'high' || value.confidence === 'medium' ? value.confidence : 'low';
    return { firstName, lastName, studentNumber, confidence };
  } catch {
    return null;
  }
}
