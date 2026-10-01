import { CommandError } from "../../lib/core/errors.ts";
import { extractLinksFromFile, runBbdownLinks } from "../../lib/text/extras.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel bilibili [--quality <label>] (--file <file> | <url>...)

Downloads Bilibili URLs via BBDown.`);
    return;
  }
  const args = parse(argv);
  const links = args.file ? await extractLinksFromFile(args.file) : args.links;
  if (links.length === 0) throw new CommandError("bilibili requires URLs or --file", 2);
  const count = await runBbdownLinks(links, args.quality ?? "720P 高清");
  console.log(`Downloaded ${count} links.`);
}

function parse(argv: string[]): { file?: string; quality?: string; links: string[] } {
  const args: { file?: string; quality?: string; links: string[] } = { links: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file" || arg === "-f") args.file = argv[++i];
    else if (arg === "--quality" || arg === "-q") args.quality = argv[++i];
    else if (arg.startsWith("-")) throw new CommandError(`Unknown bilibili option: ${arg}`, 2);
    else args.links.push(arg);
  }
  return args;
}

export const command = {
  name: "bilibili",
  aliases: ["bbdown"],
  description: "Download Bilibili links with BBDown",
  run,
};
