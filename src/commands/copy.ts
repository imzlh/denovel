import { CommandError } from "../../lib/core/errors.ts";
import { copyFiles, parseSize } from "../../lib/text/copy.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel copy [options] <src-dir> <dest-dir>

Options:
  -k, --keywords <words>      Comma-separated filename keywords
  -z, --size <size>           Max total size, e.g. 10m
  -m, --single-min-size <n>   Min file size, e.g. 1k
  -c, --count <count>         Max copied file count
  -r, --random                Random file order
  --sort-name <asc|desc>      Sort by filename
  --sort-time <asc|desc>      Sort by mtime`);
    return;
  }
  const args = parse(argv);
  if (!args.src || !args.dest) throw new CommandError("copy requires <src-dir> <dest-dir>", 2);
  const result = await copyFiles(args.src, args.dest, {
    keywords: args.keywords,
    maxTotalSize: args.size ? parseSize(args.size) : undefined,
    minFileSize: args.singleMinSize ? parseSize(args.singleMinSize) : undefined,
    maxFileCount: args.count ? Number.parseInt(args.count, 10) : undefined,
    random: args.random,
    sortName: args.sortName,
    sortTime: args.sortTime,
  });
  console.log(`Copied ${result.copied} files (${result.totalSize} bytes).`);
}

interface Args {
  src?: string;
  dest?: string;
  keywords?: string[];
  size?: string;
  singleMinSize?: string;
  count?: string;
  random?: boolean;
  sortName?: "asc" | "desc";
  sortTime?: "asc" | "desc";
}

function parse(argv: string[]): Args {
  const args: Args = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-k":
      case "--keywords":
        args.keywords = argv[++i]?.split(",").filter(Boolean);
        break;
      case "-z":
      case "--size":
        args.size = argv[++i];
        break;
      case "-m":
      case "--single-min-size":
        args.singleMinSize = argv[++i];
        break;
      case "-c":
      case "--count":
        args.count = argv[++i];
        break;
      case "-r":
      case "--random":
        args.random = true;
        break;
      case "--sort-name":
        args.sortName = parseSort(argv[++i], "sort-name");
        break;
      case "--sort-time":
        args.sortTime = parseSort(argv[++i], "sort-time");
        break;
      default:
        if (arg.startsWith("-")) throw new CommandError(`Unknown copy option: ${arg}`, 2);
        positionals.push(arg);
    }
  }
  [args.src, args.dest] = positionals;
  return args;
}

function parseSort(value: string | undefined, name: string): "asc" | "desc" {
  if (value === "asc" || value === "desc") return value;
  throw new CommandError(`${name} must be asc or desc`, 2);
}

export const command = {
  name: "copy",
  description: "Copy files with filters",
  run,
};
