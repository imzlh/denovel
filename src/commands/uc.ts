import { createRuntimeContext } from "../../lib/core/context.ts";
import { CommandError } from "../../lib/core/errors.ts";
import { checkUcLogin, downloadUcShares } from "../../lib/cloud/uc.ts";
import { hasHelp } from "../cli/args.ts";

const XLSX_MODULE = "jsr:@mirror/xlsx";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel uc [options] <share-url>...

Options:
  --xlsx <file>           Read share links from first sheet hyperlinks
  -o, --outdir <dir>      Output directory (default ./ucdown)
  -d, --data-dir <dir>    v2 data directory
  --cookie <cookie>       Store and use uc.cn cookie`);
    return;
  }
  const args = parse(argv);
  const links = [...args.links, ...(args.xlsxFiles.length ? await readLinksFromXlsx(args.xlsxFiles) : [])];
  if (links.length === 0) throw new CommandError("uc requires share URLs or --xlsx", 2);
  const ctx = await createRuntimeContext({ dataDir: args.dataDir, outputDir: args.outdir ?? "./ucdown" });
  try {
    if (args.cookie) await ctx.cookies.setRawCookie("uc.cn", args.cookie);
    const nickname = await checkUcLogin(ctx);
    if (!nickname) throw new CommandError("UC login failed; pass --cookie", 1);
    console.log(`Logged in as ${nickname}`);
    const count = await downloadUcShares(ctx, links, args.outdir ?? "./ucdown");
    console.log(`Downloaded ${count} files.`);
  } finally {
    ctx.state.close();
  }
}

function parse(argv: string[]): { links: string[]; xlsxFiles: string[]; outdir?: string; dataDir?: string; cookie?: string } {
  const args: { links: string[]; xlsxFiles: string[]; outdir?: string; dataDir?: string; cookie?: string } = {
    links: [],
    xlsxFiles: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--xlsx") args.xlsxFiles.push(argv[++i]);
    else if (arg === "-o" || arg === "--outdir") args.outdir = argv[++i];
    else if (arg === "-d" || arg === "--data-dir") args.dataDir = argv[++i];
    else if (arg === "--cookie") args.cookie = argv[++i];
    else if (arg.startsWith("-")) throw new CommandError(`Unknown uc option: ${arg}`, 2);
    else args.links.push(arg);
  }
  return args;
}

async function readLinksFromXlsx(files: string[]): Promise<string[]> {
  const { readFile } = await import(XLSX_MODULE) as {
    readFile(path: string): { Sheets: Record<string, Record<string, { l?: { Target: string } }>>; SheetNames: string[] };
  };
  const links: string[] = [];
  for (const file of files) {
    const xlsx = readFile(file);
    const sheet = xlsx.Sheets[xlsx.SheetNames[0]];
    for (const addr in sheet) {
      const target = sheet[addr].l?.Target;
      if (target) links.push(target.replace("drive.uc.cn", "fast.uc.cn"));
    }
  }
  return links;
}

export const command = {
  name: "uc",
  aliases: ["ddxs"],
  description: "Download UC cloud share files",
  run,
};
