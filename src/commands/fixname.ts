import { CommandError } from "../../lib/core/errors.ts";
import { fixTxtNames } from "../../lib/text/extras.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel fixname [--min-similarity <n>] <directory>

Renames txt files using the title found in file content.`);
    return;
  }
  const args = parse(argv);
  if (!args.dir) throw new CommandError("fixname requires <directory>", 2);
  const result = await fixTxtNames(args.dir, args.minSimilarity);
  console.log(`Scanned ${result.scanned}, renamed ${result.renamed}, skipped ${result.skipped}.`);
}

function parse(argv: string[]): { dir?: string; minSimilarity?: number } {
  const args: { dir?: string; minSimilarity?: number } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--min-similarity") {
      args.minSimilarity = Number.parseFloat(argv[++i]);
    } else if (arg.startsWith("-")) {
      throw new CommandError(`Unknown fixname option: ${arg}`, 2);
    } else if (!args.dir) {
      args.dir = arg;
    } else {
      throw new CommandError(`Unexpected fixname argument: ${arg}`, 2);
    }
  }
  return args;
}

export const command = {
  name: "fixname",
  description: "Fix txt filenames from content titles",
  run,
};
