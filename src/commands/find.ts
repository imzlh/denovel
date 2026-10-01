import { join } from "jsr:@std/path";
import { CommandError } from "../../lib/core/errors.ts";
import { findKeywordInTxtFiles, linkMatches } from "../../lib/text/file_ops.ts";
import { hasHelp, parsePositiveInt } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel find <keyword> [min-appearances] [directory]

Finds txt files containing a keyword at least N times and hard-links them into ./matched.`);
    return;
  }
  const keyword = argv[0];
  if (!keyword) throw new CommandError("find requires <keyword>", 2);
  const minAppearances = parsePositiveInt(argv[1], "min-appearances") ?? 10;
  const dir = argv[2] ?? Deno.cwd();
  const matches = await findKeywordInTxtFiles(dir, keyword, minAppearances);
  await linkMatches(dir, matches);
  for (const match of matches) {
    console.log(`${join(dir, match.file)} (${match.appearances})`);
  }
  console.log(`Found ${matches.length} files.`);
}

export const command = {
  name: "find",
  aliases: ["findkeyword"],
  description: "Find files by keyword",
  run,
};
