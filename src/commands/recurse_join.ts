import { CommandError } from "../../lib/core/errors.ts";
import { flattenTxtFiles } from "../../lib/text/extras.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel recurse-join [directory]

Moves recursive txt files into the top-level directory, keeping larger existing files.`);
    return;
  }
  const dir = argv[0] ?? ".";
  const result = await flattenTxtFiles(dir);
  console.log(`Moved ${result.moved}, skipped ${result.skipped}.`);
}

export const command = {
  name: "recurse-join",
  aliases: ["recurseJoin"],
  description: "Flatten recursive txt files",
  run,
};
