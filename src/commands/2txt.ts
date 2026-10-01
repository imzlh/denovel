import { ensureDir } from "jsr:@std/fs/ensure-dir";
import { basename, dirname, extname, join } from "jsr:@std/path";
import { CommandError } from "../../lib/core/errors.ts";
import { exists } from "../../lib/core/fs.ts";
import { hasHelp } from "../cli/args.ts";

const DEFAULT_MAX_CHARS_PER_CHAPTER = 50_000;
const EPUB_EXTRACT_MODULE = "../../lib/epub/extract.ts";
const EPUB_TXT_MODULE = "../../lib/epub/txt.ts";

interface EpubExtractModule {
  documentToTxt(
    source: string,
    outdir: string,
    options: { addTitle?: boolean; removeHtmlTitle?: boolean; extractImages?: boolean },
  ): Promise<string>;
}

interface EpubTxtModule {
  txtToEpub(data: string, input: string, output: string, options: { perPageMax?: number }): Promise<boolean>;
}

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel 2txt [options] <input-file-or-dir>

Options:
  -o, --output <path>       Output directory, .txt file, or .epub file with --to-epub
  -n, --name <name>         Output base name
  -e, --to-epub             Regenerate epub after extracting text
  -i, --no-images           Do not extract embedded EPUB images
  -d, --delete              Delete source after conversion
  -k, --keep-txt            Keep intermediate text directory after --to-epub
  -f, --force               Continue batch conversion after errors
  -c, --chapter-max <n>     Max chars per generated epub chapter
  -t, --add-title           Add EPUB chapter title to text
  -r, --remove-html-title   Remove h1-h6 from EPUB body before extraction`);
    return;
  }

  const args = parse(argv);
  if (args.toEpub && args.delete) {
    throw new CommandError("Cannot use --to-epub and --delete together", 2);
  }
  if (!args.input) throw new CommandError("2txt requires <input-file-or-dir>", 2);

  const stat = await Deno.stat(args.input);
  if (stat.isFile) {
    await processSingleFile(args.input, args);
  } else if (stat.isDirectory) {
    await processDirectory(args.input, args);
  } else {
    throw new CommandError(`Unsupported path type: ${args.input}`, 2);
  }
}

async function processDirectory(dir: string, args: Args): Promise<void> {
  for await (const entry of Deno.readDir(dir)) {
    const fullPath = join(dir, entry.name);
    try {
      if (entry.isFile && supportedInput(entry.name)) {
        await processSingleFile(fullPath, args);
      } else if (entry.isDirectory && args.toEpub) {
        await processContentTxtDirectory(fullPath, args);
      }
    } catch (error) {
      console.error(`Failed to process ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
      if (!args.force) throw error;
    }
  }
}

async function processSingleFile(inputPath: string, args: Args): Promise<void> {
  if (!supportedInput(inputPath)) throw new CommandError(`Unsupported input format: ${inputPath}`, 2);
  const config = await createConfig(inputPath, args);
  const { documentToTxt } = await loadEpubExtract();
  const text = await documentToTxt(inputPath, config.workDir, {
    addTitle: args.addTitle ?? false,
    removeHtmlTitle: args.removeHtmlTitle ?? true,
    extractImages: args.noImages !== true,
  });

  if (config.finalTxtPath && config.finalTxtPath !== join(config.workDir, "content.txt")) {
    await ensureDir(dirname(config.finalTxtPath));
    await Deno.rename(join(config.workDir, "content.txt"), config.finalTxtPath);
  }

  if (args.toEpub) {
    await writeEpub(text, inputPath, config, args);
    if (!args.keepTxt) await Deno.remove(config.workDir, { recursive: true });
  }
  if (args.delete) await Deno.remove(inputPath);
  console.log(`Converted ${inputPath}`);
}

async function processContentTxtDirectory(dir: string, args: Args): Promise<void> {
  const contentPath = join(dir, "content.txt");
  if (!await exists(contentPath)) return;
  const text = await Deno.readTextFile(contentPath);
  const baseName = args.name || basename(dir);
  const epubPath = resolveEpubOutput(contentPath, baseName, args);
  const { txtToEpub } = await loadEpubTxt();
  const ok = await txtToEpub(text, contentPath, epubPath, {
    perPageMax: args.chapterMax ?? DEFAULT_MAX_CHARS_PER_CHAPTER,
  });
  if (!ok) throw new Error(`Failed to generate ${epubPath}`);
  if (args.delete) await Deno.remove(contentPath);
  if (!args.keepTxt) await Deno.remove(dir, { recursive: true });
}

async function writeEpub(text: string, inputPath: string, config: ConvertConfig, args: Args): Promise<void> {
  const epubPath = resolveEpubOutput(inputPath, config.baseName, args);
  if (await exists(epubPath) && !args.force) {
    console.log(`"${epubPath}" already exists, skip epub generation`);
    return;
  }
  const { txtToEpub } = await loadEpubTxt();
  const ok = await txtToEpub(text, inputPath, epubPath, {
    perPageMax: args.chapterMax ?? DEFAULT_MAX_CHARS_PER_CHAPTER,
  });
  if (!ok) throw new Error(`Failed to generate ${epubPath}`);
}

interface ConvertConfig {
  workDir: string;
  baseName: string;
  finalTxtPath?: string;
}

async function createConfig(filePath: string, args: Args): Promise<ConvertConfig> {
  const baseName = args.name || basename(filePath, extname(filePath));
  if (args.output && extname(args.output).toLowerCase() === ".txt" && !args.toEpub) {
    const workDir = dirname(args.output);
    await ensureDir(workDir);
    return { workDir, baseName, finalTxtPath: args.output };
  }
  const outputRoot = args.output && extname(args.output) === "" ? args.output : dirname(filePath);
  const workDir = join(outputRoot, baseName);
  await ensureDir(workDir);
  return { workDir, baseName };
}

function resolveEpubOutput(inputPath: string, baseName: string, args: Args): string {
  if (args.output && extname(args.output).toLowerCase() === ".epub") return args.output;
  const outputRoot = args.output && extname(args.output) === "" ? args.output : dirname(inputPath);
  return join(outputRoot, `${baseName}.epub`);
}

function supportedInput(path: string): boolean {
  return [".epub", ".pdf", ".docx"].includes(extname(path).toLowerCase());
}

async function loadEpubExtract(): Promise<EpubExtractModule> {
  return await import(EPUB_EXTRACT_MODULE) as EpubExtractModule;
}

async function loadEpubTxt(): Promise<EpubTxtModule> {
  return await import(EPUB_TXT_MODULE) as EpubTxtModule;
}

interface Args {
  input?: string;
  output?: string;
  name?: string;
  delete?: boolean;
  force?: boolean;
  toEpub?: boolean;
  noImages?: boolean;
  keepTxt?: boolean;
  addTitle?: boolean;
  removeHtmlTitle?: boolean;
  chapterMax?: number;
}

function parse(argv: string[]): Args {
  const args: Args = { removeHtmlTitle: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-o":
      case "--output":
        args.output = requireValue(argv[++i], arg);
        break;
      case "-n":
      case "--name":
        args.name = requireValue(argv[++i], arg);
        break;
      case "-e":
      case "--to-epub":
        args.toEpub = true;
        break;
      case "-i":
      case "--no-images":
        args.noImages = true;
        break;
      case "-d":
      case "--delete":
        args.delete = true;
        break;
      case "-k":
      case "--keep-txt":
        args.keepTxt = true;
        break;
      case "-f":
      case "--force":
        args.force = true;
        break;
      case "-c":
      case "--chapter-max":
        args.chapterMax = parsePositiveInt(requireValue(argv[++i], arg), arg);
        break;
      case "-t":
      case "--add-title":
        args.addTitle = true;
        break;
      case "-r":
      case "--remove-html-title":
        args.removeHtmlTitle = true;
        break;
      default:
        if (arg.startsWith("-")) throw new CommandError(`Unknown 2txt option: ${arg}`, 2);
        if (args.input) throw new CommandError(`Unexpected 2txt argument: ${arg}`, 2);
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
  name: "2txt",
  description: "Convert epub/doc/pdf files to txt",
  run,
};
