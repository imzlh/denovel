import { CommandError } from "../../lib/core/errors.ts";
import { filterNoAdsFiles } from "../../lib/text/extras.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel noads [options] <input-file-or-dir>

Options:
  -o, --output <dir>   Output directory
  -d, --delete         Rewrite input files in place`);
    return;
  }
  const args = parse(argv);
  if (!args.input) throw new CommandError("noads requires <input-file-or-dir>", 2);
  const count = await filterNoAdsFiles(args.input, args.output, args.deleteOriginal);
  console.log(`Filtered ${count} files.`);
}

function parse(argv: string[]): { input?: string; output?: string; deleteOriginal?: boolean } {
  const args: { input?: string; output?: string; deleteOriginal?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-o" || arg === "--output") args.output = argv[++i];
    else if (arg === "-d" || arg === "--delete") args.deleteOriginal = true;
    else if (arg.startsWith("-")) throw new CommandError(`Unknown noads option: ${arg}`, 2);
    else if (!args.input) args.input = arg;
    else throw new CommandError(`Unexpected noads argument: ${arg}`, 2);
  }
  return args;
}

export const command = {
  name: "noads",
  description: "Filter known novel ad text",
  run,
};
