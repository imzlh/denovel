import { reorderComicCbz } from "../../lib/text/extras.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel reordercomic [directory]

Renames cbz files from <n>_<id><title>.cbz to <id>_<title>.cbz.`);
    return;
  }
  const count = await reorderComicCbz(argv[0] ?? ".");
  console.log(`Renamed ${count} cbz files.`);
}

export const command = {
  name: "reordercomic",
  description: "Reorder comic cbz filenames",
  run,
};
