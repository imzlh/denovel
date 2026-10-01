import { ensureDir } from "jsr:@std/fs";
import { basename, dirname, join } from "jsr:@std/path";
import { CommandError } from "../../lib/core/errors.ts";
import { tryReadTextFile } from "../../lib/text/encoding.ts";
import { traditionalToSimplified } from "../../lib/text/t2cn.ts";
import { hasHelp } from "../cli/args.ts";

interface Args {
  input?: string;
  output?: string;
  deleteOriginal: boolean;
}

function parse(argv: string[]): Args {
  const args: Args = { deleteOriginal: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-d" || arg === "--delete") args.deleteOriginal = true;
    else if (arg === "-o" || arg === "--output") args.output = argv[++i];
    else if (!args.input) args.input = arg;
    else throw new CommandError(`Unexpected t2cn argument: ${arg}`, 2);
  }
  return args;
}

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel t2cn [--delete] [-o <output>] <input>

Converts traditional Chinese text files to simplified Chinese.`);
    return;
  }

  const args = parse(argv);
  if (!args.input) throw new CommandError("t2cn requires <input>", 2);
  const inputStat = await Deno.stat(args.input);
  const output = args.output ?? args.input;
  const files: string[] = [];
  let outputDir = output;

  if (inputStat.isDirectory) {
    await ensureDir(outputDir);
    for await (const entry of Deno.readDir(args.input)) {
      if (entry.isFile && entry.name.endsWith(".txt")) files.push(join(args.input, entry.name));
    }
  } else {
    files.push(args.input);
    outputDir = dirname(output);
    await ensureDir(outputDir);
  }

  let converted = 0;
  for (const file of files) {
    if (file.endsWith(".2.txt")) continue;
    const target = args.deleteOriginal ? file : join(outputDir, `${basename(file)}.2.txt`);
    await Deno.writeTextFile(target, traditionalToSimplified(tryReadTextFile(file)));
    converted++;
  }
  console.log(`Converted ${converted} files.`);
}

export const command = {
  name: "t2cn",
  description: "Convert traditional Chinese text to simplified Chinese",
  run,
};
