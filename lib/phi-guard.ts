// lib/phi-guard.ts — S1 PHI guard (regex layer only).
//
// Regex-based detection of Protected Health Information patterns in free-text.
// Layer: cheap-first, fail-fast. Each regex match appends a reason string.
// NO LLM classifier in S1 — this is the hard-stop guard. An LLM classifier
// is a P1 enhancement for ambiguous cases.
//
// All patterns are designed to have LOW false-negative rate at the cost of
// some false positives. Blocking a benign message is recoverable; shipping
// PHI to Groq is not.

export interface PhiDetection {
  hasPHI: boolean;
  reasons: string[];
}

// --- Field-name PHI guard ----------------------------------------------------
//
// Rejects structured-input field NAMES that signal patient-identifiable data
// (e.g. `patient_name`, `dob`, `mrn`, `patientPhone`). This is a name-level
// hard stop, complementary to the free-text value scanner below. Lifted from
// the decision-input validation layer so the shared Zod schema can enforce it.
export const PHI_FIELD_NAME_PATTERN =
  /(^|[_\-\s])(?:name|dob|birthdate|mrn|ssn|phone|email|address|diagnosis|diagnoses)($|[_\-\s])|(?:patient|client)[_\-\s]*(?:name|dob|birthdate|mrn|id|phone|email|address)|(?:patient|client)(?:Name|Dob|Birthdate|Mrn|Id|Phone|Email|Address)/;

/**
 * True when a structured-input field name is PHI-shaped and must be rejected.
 * Name-level guard — does not inspect the value. Recoverable false positives
 * are acceptable; a false negative leaks PHI into downstream AI calls.
 */
export function detectPhiFieldName(key: string): boolean {
  return typeof key === "string" && PHI_FIELD_NAME_PATTERN.test(key);
}

// --- Individual pattern definitions ------------------------------------------

/** HIPAA DOB pattern: MM/DD/YYYY, MM-DD-YYYY, MM.DD.YYYY */
const DOB_PATTERN =
  /\b(0?[1-9]|1[0-2])[\/.\-](0?[1-9]|[12]\d|3[01])[\/.\-](19|20)\d{2}\b/g;

/** SSN: 123-45-6789 */
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;

/**
 * MRN / long numeric ID: 6+ consecutive digits NOT preceded/followed by
 * a 4-digit year context (to avoid matching 2024-style standalone years
 * or ZIP codes embedded in addresses — address is caught by its own pattern).
 *
 * We use a negative lookbehind for a hyphen/slash that would indicate a date
 * fragment, and skip pure 4-digit year runs with the extra check below.
 */
const LONG_NUMERIC_PATTERN = /\b\d{6,}\b/g;

/** Phone: (555) 123-4567 | 555-123-4567 | 555.123.4567 | 5551234567 */
const PHONE_PATTERN =
  /\b\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/g;

/**
 * Email: simple RFC-5322 subset sufficient to catch typical PHI emails.
 * Could be benign (user is asking about email marketing), but we flag it
 * as a reason for review; the route can decide how to handle it.
 */
const EMAIL_PATTERN = /\b[\w.+\-]+@[\w\-]+\.[\w.\-]+\b/g;

/**
 * Name with title prefix (HIPAA "patient identifier").
 * Pattern: Dr./Mr./Mrs./Ms./Patient followed by two capitalised words.
 * e.g. "Dr. Sarah Jones", "Patient John Smith"
 */
const NAME_TITLE_PATTERN =
  /\b(Dr\.|Mr\.|Mrs\.|Ms\.|Patient)\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;

/**
 * Street address shape: number + word(s) + street type abbreviation.
 * e.g. "123 Main Street", "42 Oak Ave"
 */
const ADDRESS_PATTERN =
  /\b\d+\s+\w+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Highway|Hwy)\b/gi;

// --- Pure 4-digit year check -------------------------------------------------
// LONG_NUMERIC_PATTERN also fires on standalone 4-digit years like "2024" — but
// those are only 4 digits so they won't match \d{6,}. Safe as-is.

// --- ZIP code exclusion ------------------------------------------------------
// 5-digit ZIPs are caught by \d{6,} only if they run together with more digits.
// A bare ZIP like "90210" is 5 digits and does NOT match \d{6,}. Safe as-is.

// --- Helpers -----------------------------------------------------------------

function runPattern(
  text: string,
  pattern: RegExp,
  label: string,
  reasons: string[],
): void {
  // Reset lastIndex — always operate on a fresh copy of the global RegExp.
  const re = new RegExp(pattern.source, pattern.flags);
  if (re.test(text)) {
    reasons.push(label);
  }
}

// --- Public API --------------------------------------------------------------

/**
 * Scan `input` for PHI patterns. Returns immediately on the first match in
 * each layer (fail-fast per layer). Aggregates all matching layers into reasons[].
 *
 * Callers should treat `hasPHI: true` as a hard block; do not forward to LLM.
 */
export function detectPHI(input: string): PhiDetection {
  if (!input || typeof input !== "string") {
    return { hasPHI: false, reasons: [] };
  }

  const reasons: string[] = [];

  runPattern(input, DOB_PATTERN, "date-of-birth pattern detected", reasons);
  runPattern(input, SSN_PATTERN, "SSN pattern detected", reasons);
  runPattern(input, LONG_NUMERIC_PATTERN, "long numeric ID (≥6 digits) detected — possible MRN", reasons);
  runPattern(input, PHONE_PATTERN, "phone number pattern detected", reasons);
  runPattern(input, EMAIL_PATTERN, "email address detected", reasons);
  runPattern(input, NAME_TITLE_PATTERN, "name with title prefix detected (possible patient identifier)", reasons);
  runPattern(input, ADDRESS_PATTERN, "street address pattern detected", reasons);

  return {
    hasPHI: reasons.length > 0,
    reasons,
  };
}
