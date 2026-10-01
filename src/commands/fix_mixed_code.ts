import { fixMixedCodeFiles } from "../../lib/text/extras.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel fix-mixed-code [directory]

Removes the malformed leading cover marker block from affected text files.`);
    return;
  }
  const count = await fixMixedCodeFiles(argv[0] ?? ".");
  console.log(`Fixed ${count} files.`);
}

export const command = {
  name: "fix-mixed-code",
  aliases: ["fixMixedCode"],
  description: "Fix malformed mixed-code txt headers",
  run,
};
