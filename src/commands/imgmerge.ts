import { CommandError } from "../../lib/core/errors.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel imgmerge <directory> [output-root]

Merges images in directories into long png images.`);
    return;
  }
  const root = argv[0];
  if (!root) throw new CommandError("imgmerge requires <directory>", 2);
  const { mergeImageDirectories } = await import("../../lib/image/directory_merge.ts");
  const outputs = await mergeImageDirectories(root, argv[1] ?? "dist");
  for (const output of outputs) console.log(output);
  console.log(`Generated ${outputs.length} image files.`);
}

export const command = {
  name: "imgmerge",
  description: "Merge image directories into long png images",
  run,
};
