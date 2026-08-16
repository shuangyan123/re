/**
 * Case locale is a benchmark input, not a developer-interface preference.
 * The validator accepts well-formed BCP-47-like tags so adding another locale
 * does not require changing the core contract again.
 */
export const TUTOR_CASE_LOCALES = ["zh-CN", "en"] as const;
export const DEFAULT_TUTOR_CASE_LOCALE = "en" as const;

export type TutorCaseLocale = string;

const localePattern = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;

export function isTutorCaseLocale(value: unknown): value is TutorCaseLocale {
  return (
    typeof value === "string" &&
    value.length <= 35 &&
    localePattern.test(value)
  );
}

/** Returns undefined for a legacy omitted field and null for an invalid one. */
export function readTutorCaseLocale(
  value: unknown,
): TutorCaseLocale | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  return isTutorCaseLocale(value) ? value : null;
}

/** Legacy cases were authored in English before locale became explicit. */
export function resolveTutorCaseLocale(
  value: TutorCaseLocale | undefined,
): TutorCaseLocale {
  return value ?? DEFAULT_TUTOR_CASE_LOCALE;
}

export function isKnownTutorCaseLocale(
  value: TutorCaseLocale,
): value is (typeof TUTOR_CASE_LOCALES)[number] {
  return (TUTOR_CASE_LOCALES as readonly string[]).includes(value);
}
