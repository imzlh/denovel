import { CommandError } from "../../lib/core/errors.ts";
import { normalizeNovelFiles } from "../../lib/text/extras.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel normalize <directory>

Deduplicates downloaded txt/epub novel files by normalized title, keeping the largest file.`);
    return;
  }
  const dir = argv[0];
  if (!dir) throw new CommandError("normalize requires <directory>", 2);
  const result = await normalizeNovelFiles(dir);
  for (const item of result.removed) console.log(`removed ${item}`);
  for (const item of result.renamed) console.log(`renamed ${item.from} -> ${item.to}`);
  console.log(`Removed ${result.removed.length}, renamed ${result.renamed.length}, ignored ${result.ignored.length}.`);
}

export const command = {
  name: "normalize",
  description: "Normalize duplicated novel filenames",
  run,
};
