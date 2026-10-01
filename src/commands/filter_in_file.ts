import { CommandError } from "../../lib/core/errors.ts";
import { filterFilesWeighted } from "../../lib/text/extras.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel filter-in-file [options]

Options:
  -d, --dir <dir>       Directory to scan (default .)
  --files <file>        Lanzou file-list JSON
  -o, --output <file>   Output JSON (default files_weighted.json)`);
    return;
  }
  const args = parse(argv);
  if (!args.files) throw new CommandError("filter-in-file requires --files <json>", 2);
  const count = await filterFilesWeighted(args.dir ?? ".", args.files, args.output ?? "files_weighted.json");
  console.log(`Wrote ${count} weighted matches.`);
}

function parse(argv: string[]): { dir?: string; files?: string; output?: string } {
  const args: { dir?: string; files?: string; output?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-d" || arg === "--dir") args.dir = argv[++i];
    else if (arg === "--files") args.files = argv[++i];
    else if (arg === "-o" || arg === "--output") args.output = argv[++i];
    else throw new CommandError(`Unknown filter-in-file option: ${arg}`, 2);
  }
  return args;
}

export const command = {
  name: "filter-in-file",
  aliases: ["filterInFile"],
  description: "Match local files against a Lanzou files JSON",
  run,
};
