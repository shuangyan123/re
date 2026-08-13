export class TutorbenchCliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TutorbenchCliUsageError";
  }
}

export function nextTutorbenchValue(
  args: readonly string[],
  index: number,
  option: string,
): string {
  const value = args[index + 1];
  if (value === undefined || value.trim().length === 0 || value.startsWith("--")) {
    throw new TutorbenchCliUsageError(`${option} requires a value.`);
  }
  return value.trim();
}

export function tutorbenchOptionValue(
  argument: string,
  option: string,
): string | undefined {
  const prefix = `${option}=`;
  if (!argument.startsWith(prefix)) {
    return undefined;
  }
  const value = argument.slice(prefix.length).trim();
  if (value.length === 0) {
    throw new TutorbenchCliUsageError(`${option} requires a value.`);
  }
  return value;
}

export function positiveTutorbenchInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new TutorbenchCliUsageError(`${option} must be a positive integer.`);
  }
  return parsed;
}
