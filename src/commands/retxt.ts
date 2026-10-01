import { CommandError } from "../../lib/core/errors.ts";
import { rewriteHtmlAsTxt } from "../../lib/text/extras.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel retxt <html-file>

Rewrites a saved HTML file into denovel text markup in place.`);
    return;
  }
  const file = argv[0];
  if (!file) throw new CommandError("retxt requires <html-file>", 2);
  const result = await rewriteHtmlAsTxt(file);
  console.log(`Rewrote ${result.file} (${result.bytes} chars).`);
}

export const command = {
  name: "retxt",
  description: "Rewrite saved HTML as denovel text",
  run,
};
