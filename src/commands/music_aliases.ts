import type { Command } from "./types.ts";
import { run as runDownmusic } from "./downmusic.ts";
import { hasHelp } from "../cli/args.ts";

export async function runNetease(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel neast <target-type> <id-or-keywords> [options]

Compatibility wrapper for:
  denovel downmusic netease <target-type> <id-or-keywords> [options]`);
    return;
  }
  await runDownmusic(["netease", ...argv]);
}

export async function runKugou(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel kugou <target-type> <id> [options]

Compatibility wrapper for:
  denovel downmusic kugou <target-type> <id> [options]`);
    return;
  }
  await runDownmusic(["kugou", ...argv]);
}

export const neastCommand: Command = {
  name: "neast",
  description: "Netease music compatibility wrapper",
  run: runNetease,
};

export const kugouCommand: Command = {
  name: "kugou",
  description: "Kugou music compatibility wrapper",
  run: runKugou,
};
