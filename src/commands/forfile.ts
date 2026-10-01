import { CommandError } from "../../lib/core/errors.ts";
import { runForFiles } from "../../lib/text/extras.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel forfile <glob> <command> [args...]

Runs a command for each matching file. Use %f for full path and %b for basename.`);
    return;
  }
  const [pattern, command, ...args] = argv;
  if (!pattern || !command) throw new CommandError("forfile requires <glob> <command>", 2);
  const count = await runForFiles({ pattern, command, args });
  console.log(`Processed ${count} files.`);
}

export const command = {
  name: "forfile",
  description: "Run a command for each matched file",
  run,
};
