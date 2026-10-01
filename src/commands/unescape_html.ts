import { CommandError } from "../../lib/core/errors.ts";
import { unescapeHtmlEntities } from "../../lib/text/html_entities.ts";
import { hasHelp, withoutFlags } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel unescape-html [--no-backup] [--recursive] <path>...

Decodes HTML entities in text files. Backups are written as .bak unless --no-backup is set.`);
    return;
  }
  const noBackup = argv.includes("--no-backup") || argv.includes("-n");
  const recursive = argv.includes("--recursive") || argv.includes("-r");
  const paths = withoutFlags(argv, ["--no-backup", "-n", "--recursive", "-r"]);
  if (paths.length === 0) throw new CommandError("unescape-html requires at least one path", 2);
  const results = await unescapeHtmlEntities(paths, { noBackup, recursive });
  for (const result of results) {
    console.log(`${result.changed ? "decoded" : "unchanged"} ${result.file} (${result.entityCount})`);
  }
}

export const command = {
  name: "unescape-html",
  description: "Decode HTML entities in text files",
  run,
};
