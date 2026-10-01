import { CommandError } from "../../lib/core/errors.ts";
import { splitTxtFilesIntoFolders } from "../../lib/text/file_ops.ts";
import { hasHelp, parsePositiveInt } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel part <directory> [files-per-folder]

Splits txt files in a directory into numbered child folders.`);
    return;
  }
  const sourceDir = argv[0];
  if (!sourceDir) throw new CommandError("part requires <directory>", 2);
  const filesPerFolder = parsePositiveInt(argv[1], "files-per-folder") ?? 60;
  const result = await splitTxtFilesIntoFolders(sourceDir, filesPerFolder);
  console.log(`Moved ${result.files} txt files into ${result.folders} folders.`);
}

export const command = {
  name: "part",
  description: "Split txt chapters into folders",
  run,
};
