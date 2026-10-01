import { CommandError } from "../../lib/core/errors.ts";
import { moveTxtFiles } from "../../lib/text/file_ops.ts";
import { hasHelp, parsePositiveInt } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel move <source-dir> <target-dir> [threshold-kb]

Moves txt files into a target directory. Existing target files within threshold are skipped or copied according to size.`);
    return;
  }
  const [sourceDir, targetDir] = argv;
  if (!sourceDir || !targetDir) throw new CommandError("move requires <source-dir> <target-dir>", 2);
  const thresholdKb = parsePositiveInt(argv[2], "threshold-kb") ?? 100;
  const result = await moveTxtFiles({
    sourceDir,
    targetDir,
    sizeThresholdBytes: thresholdKb * 1024,
  });
  console.log(`Moved ${result.moved}, copied ${result.copied}, skipped ${result.skipped}, failed ${result.failed}.`);
}

export const command = {
  name: "move",
  description: "Move txt files with size-threshold conflict handling",
  run,
};
