import { renameContentTxtInDirs } from "../../lib/text/extras.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel renameindir [directory]

Renames child content.txt files into <child>.txt in the parent directory.`);
    return;
  }
  const count = await renameContentTxtInDirs(argv[0] ?? ".");
  console.log(`Renamed ${count} content.txt files.`);
}

export const command = {
  name: "renameindir",
  description: "Rename child content.txt files",
  run,
};
