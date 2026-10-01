import { CommandError } from "../../lib/core/errors.ts";

export function hasHelp(argv: string[]): boolean {
  return argv.includes("-h") || argv.includes("--help");
}

export function parsePositiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new CommandError(`${name} must be a positive integer`, 2);
  }
  return parsed;
}

export function withoutFlags(argv: string[], flags: string[]): string[] {
  const flagSet = new Set(flags);
  return argv.filter((arg) => !flagSet.has(arg));
}
