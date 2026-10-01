import { CommandError } from "./lib/core/errors.ts";
import { getCommand, listCommands } from "./src/commands/mod.ts";
import { runShell } from "./src/shell.ts";

function showHelp(): void {
  console.log(`denovel v2

Usage:
  denovel <command> [...args]
  denovel help

Commands:`);
  const commands = listCommands();
  const labels = commands.map((command) =>
    command.name + (command.aliases?.length ? ` (${command.aliases.join(", ")})` : "")
  );
  const width = Math.max(14, ...labels.map((label) => label.length)) + 2;
  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    const label = labels[i];
    console.log(`  ${label.padEnd(width)} ${command.description}`);
  }
}

export async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  if (!name) {
    await runShell();
    return 0;
  }
  if (name === "help" || name === "-h" || name === "--help") {
    showHelp();
    return 0;
  }
  const command = getCommand(name);
  if (!command) {
    console.error(`Unknown command: ${name}`);
    showHelp();
    return 2;
  }
  try {
    await command.run(rest);
    return 0;
  } catch (error) {
    if (error instanceof CommandError) {
      console.error(error.message);
      return error.exitCode;
    }
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    return 1;
  }
}

if (import.meta.main) {
  Deno.exitCode = await main(Deno.args);
}
