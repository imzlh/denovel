import { ensureDir } from "jsr:@std/fs/ensure-dir";
import { basename, dirname, extname, join } from "jsr:@std/path";
import { createRuntimeContext, type RuntimeContext } from "../../lib/core/context.ts";
import { CommandError } from "../../lib/core/errors.ts";
import { exists } from "../../lib/core/fs.ts";
import { fetchWithContext } from "../../lib/core/fetch.ts";
import { Status } from "../../lib/core/status.ts";
import { hasHelp } from "../cli/args.ts";

const hostReplace: Record<string, string> = {
  "novel-cdn.kuangxiangit.com": "c1.kuangxiangit.com",
};
const DEFAULT_MAX_CHARS_PER_CHAPTER = 50_000;
const EPUB_TXT_MODULE = "../../lib/epub/txt.ts";

interface EpubTxtModule {
  matchTitlePattern(title: string): { index: number; pattern: RegExp; match: RegExpMatchArray } | undefined;
  txtToEpub(
    data: string,
    input: string,
    output: string,
    options: {
      perPageMax?: number;
      merge?: boolean;
      jpFormat?: boolean;
      reporter?: (status: Status, message: string) => void;
      networkHandler?: typeof fetch;
    },
  ): Promise<boolean>;
}

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel 2epub [options] <input-file-or-dir>

Options:
  -o, --output <path>       Output file for single input, or output directory
  -d, --delete              Delete source txt after successful conversion
  -f, --force               Overwrite existing epub
  -e, --delete-exist        Delete source txt when output epub already exists
  -c, --chapter-max <n>     Max chars per chapter (default 50000)
  -t, --test-title          Test whether a chapter title can be detected
  -m, --merge               Merge very small chapters
  -j, --jp-format           Add dialogue/quote tags for translated light novels
  --data-dir <dir>          v2 data directory for cookies/cache used by media fetches
  --timeout <sec>           Fetch timeout for embedded media`);
    return;
  }

  const args = parse(argv);
  if (args.testTitle) {
    const { matchTitlePattern } = await loadEpubTxt();
    const title = args.input ?? "";
    if (!title) throw new CommandError("2epub --test-title requires a title argument", 2);
    const result = matchTitlePattern(title);
    if (!result) throw new CommandError(`"${title}" cannot be processed correctly`, 1);
    console.log(`"${title}" can be processed by pattern ${result.index}: ${result.pattern}`);
    console.log("result:", result.match);
    return;
  }
  if (!args.input) throw new CommandError("2epub requires <input-file-or-dir>", 2);

  const stat = await Deno.stat(args.input);
  const ctx = await createRuntimeContext({
    dataDir: args.dataDir,
    timeoutSec: args.timeout ? Number.parseInt(args.timeout, 10) : undefined,
  });
  try {
    const inputs = stat.isDirectory ? await collectTxtFiles(args.input) : [args.input];
    if (inputs.length === 0) throw new CommandError("No .txt files found", 1);
    const outputBase = resolveOutputBase(args.input, stat.isDirectory, args.output);
    if (stat.isDirectory || !args.output || extname(args.output).toLowerCase() !== ".epub") {
      await ensureDir(outputBase);
    } else {
      await ensureDir(dirname(outputBase));
    }

    for (const input of inputs) {
      await convertOne(input, outputBase, stat.isDirectory, args, ctx);
    }
  } finally {
    ctx.state.close();
  }
}

async function collectTxtFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && /\.txt$/i.test(entry.name)) files.push(join(dir, entry.name));
  }
  return files.toSorted();
}

async function convertOne(
  input: string,
  outputBase: string,
  batchMode: boolean,
  args: Args,
  ctx: RuntimeContext,
): Promise<void> {
  const output = !batchMode && args.output && extname(args.output).toLowerCase() === ".epub"
    ? outputBase
    : join(outputBase, `${basename(input, extname(input))}.epub`);

  if (await exists(output)) {
    if (args.deleteExist) {
      await Deno.remove(input);
      console.log(`"${output}" already exists, deleted source "${input}"`);
      return;
    }
    if (!args.force) {
      console.log(`"${output}" already exists, skip`);
      return;
    }
  }

  const data = await Deno.readTextFile(input);
  const { txtToEpub } = await loadEpubTxt();
  const ok = await txtToEpub(data, input, output, {
    perPageMax: args.chapterMax ?? DEFAULT_MAX_CHARS_PER_CHAPTER,
    merge: args.merge,
    jpFormat: args.jpFormat,
    reporter(status, message) {
      console.log(`[${Status[status]}] ${message}`);
    },
    networkHandler: makeNetworkHandler(ctx),
  });
  if (!ok) throw new CommandError(`Failed to convert ${input}`, 1);
  if (args.delete) await Deno.remove(input);
}

async function loadEpubTxt(): Promise<EpubTxtModule> {
  return await import(EPUB_TXT_MODULE) as EpubTxtModule;
}

function makeNetworkHandler(ctx: RuntimeContext): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    if (input instanceof Request) return fetchWithContext(ctx, input, { ...init, timeoutSec: 10 });
    const url = new URL(input instanceof URL ? input.href : input, init?.referrer);
    const replacement = hostReplace[url.hostname];
    if (replacement) url.hostname = replacement;
    return fetchWithContext(ctx, url, { ...init, timeoutSec: 10 });
  }) as typeof fetch;
}

function resolveOutputBase(input: string, inputIsDirectory: boolean, output?: string): string {
  if (output) return output;
  return inputIsDirectory ? input : dirname(input);
}

interface Args {
  input?: string;
  output?: string;
  delete?: boolean;
  force?: boolean;
  deleteExist?: boolean;
  chapterMax?: number;
  testTitle?: boolean;
  merge?: boolean;
  jpFormat?: boolean;
  dataDir?: string;
  timeout?: string;
}

function parse(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-o":
      case "--output":
        args.output = requireValue(argv[++i], arg);
        break;
      case "-d":
      case "--delete":
        args.delete = true;
        break;
      case "-f":
      case "--force":
        args.force = true;
        break;
      case "-e":
      case "--delete-exist":
        args.deleteExist = true;
        break;
      case "-c":
      case "--chapter-max":
        args.chapterMax = parsePositiveInt(requireValue(argv[++i], arg), arg);
        break;
      case "-t":
      case "--test-title":
        args.testTitle = true;
        break;
      case "-m":
      case "--merge":
        args.merge = true;
        break;
      case "-j":
      case "--jp-format":
        args.jpFormat = true;
        break;
      case "--data-dir":
        args.dataDir = requireValue(argv[++i], arg);
        break;
      case "--timeout":
        args.timeout = requireValue(argv[++i], arg);
        break;
      default:
        if (arg.startsWith("-")) throw new CommandError(`Unknown 2epub option: ${arg}`, 2);
        if (args.input) throw new CommandError(`Unexpected 2epub argument: ${arg}`, 2);
        args.input = arg;
    }
  }
  return args;
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value) throw new CommandError(`${flag} requires a value`, 2);
  return value;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) throw new CommandError(`${flag} must be a positive integer`, 2);
  return parsed;
}

export const command = {
  name: "2epub",
  aliases: ["genepub"],
  description: "Convert txt files to epub",
  run,
};
