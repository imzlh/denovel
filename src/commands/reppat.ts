import { CommandError } from "../../lib/core/errors.ts";
import { renameByPattern } from "../../lib/text/extras.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel reppat [options] <pattern> <replace>

Options:
  -d, --dir <dir>       Directory (default .)
  -e, --ext <ext>       Only process extension, e.g. txt
  --flags <flags>       RegExp flags
  --trash <dir>         Trash directory for near-duplicate conflicts`);
    return;
  }
  const args = parse(argv);
  if (!args.pattern || args.replace === undefined) throw new CommandError("reppat requires <pattern> <replace>", 2);
  const result = await renameByPattern({
    dir: args.dir ?? ".",
    pattern: new RegExp(args.pattern, args.flags),
    replace: args.replace,
    ext: args.ext,
    trashDir: args.trash,
  });
  console.log(`Renamed ${result.renamed}, trashed ${result.trashed}, skipped ${result.skipped}.`);
}

function parse(argv: string[]): {
  dir?: string;
  ext?: string;
  flags?: string;
  trash?: string;
  pattern?: string;
  replace?: string;
} {
  const args: ReturnType<typeof parse> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-d" || arg === "--dir") args.dir = argv[++i];
    else if (arg === "-e" || arg === "--ext") args.ext = argv[++i];
    else if (arg === "--flags") args.flags = argv[++i];
    else if (arg === "--trash") args.trash = argv[++i];
    else if (arg.startsWith("-")) throw new CommandError(`Unknown reppat option: ${arg}`, 2);
    else positional.push(arg);
  }
  [args.pattern, args.replace] = positional;
  if (positional.length > 2) throw new CommandError(`Unexpected reppat argument: ${positional[2]}`, 2);
  return args;
}

export const command = {
  name: "reppat",
  description: "Rename files with a regex pattern",
  run,
};
