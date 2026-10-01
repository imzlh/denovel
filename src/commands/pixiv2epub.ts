import { CommandError } from "../../lib/core/errors.ts";
import { hasHelp } from "../cli/args.ts";

const PIXIV_MODULE = "../../lib/epub/pixiv.ts";

interface PixivModule {
  pixivToEpub(options: {
    inputDir: string;
    output?: string;
    author?: string;
    cover?: string;
    force?: boolean;
  }): Promise<{ output: string; novels: number }>;
}

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel pixiv2epub [options] <input-dir>

Options:
  -o, --output <file>   Output epub file
  -a, --author <name>   Author name
  -c, --cover <file>    Cover image
  -f, --force           Overwrite existing output`);
    return;
  }
  const args = parse(argv);
  if (!args.inputDir) throw new CommandError("pixiv2epub requires <input-dir>", 2);
  const { pixivToEpub } = await import(PIXIV_MODULE) as PixivModule;
  const result = await pixivToEpub({ ...args, inputDir: args.inputDir });
  console.log(`Converted ${result.novels} Pixiv novels -> ${result.output}`);
}

function parse(argv: string[]): { inputDir?: string; output?: string; author?: string; cover?: string; force?: boolean } {
  const args: { inputDir?: string; output?: string; author?: string; cover?: string; force?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-o" || arg === "--output") args.output = argv[++i];
    else if (arg === "-a" || arg === "--author") args.author = argv[++i];
    else if (arg === "-c" || arg === "--cover") args.cover = argv[++i];
    else if (arg === "-f" || arg === "--force") args.force = true;
    else if (arg.startsWith("-")) throw new CommandError(`Unknown pixiv2epub option: ${arg}`, 2);
    else if (!args.inputDir) args.inputDir = arg;
    else throw new CommandError(`Unexpected pixiv2epub argument: ${arg}`, 2);
  }
  return args;
}

export const command = {
  name: "pixiv2epub",
  aliases: ["pixiv"],
  description: "Convert Pixiv novel dumps to epub",
  run,
};
