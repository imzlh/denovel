import { CommandError } from "../../lib/core/errors.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel cbz2img <file-or-directory>

Converts cbz archives to long jpg images.`);
    return;
  }
  const target = argv[0];
  if (!target) throw new CommandError("cbz2img requires <file-or-directory>", 2);
  const { convertCbzPath } = await import("../../lib/image/cbz.ts");
  const outputs = await convertCbzPath(target);
  for (const output of outputs) console.log(output);
  console.log(`Generated ${outputs.length} image files.`);
}

export const command = {
  name: "cbz2img",
  description: "Convert cbz archives to long images",
  run,
};
