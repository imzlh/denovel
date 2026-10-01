import { basename, join } from "jsr:@std/path";
import type { RuntimeContext } from "../core/context.ts";

const API = "https://index.tsyuri.com/book/searchByPage?curr=1&limit=200000000";
const UPDATE_API = "https://index.tsyuri.com/book/searchByPage?curr={{page}}&limit=10&sort=create_time";

export interface TsNovelInfo {
  id: string;
  catId?: string;
  picUrl?: string;
  bookName: string;
  authorName: string;
  bookDesc?: string;
  wordCount?: string;
  crawlSourceName?: string;
  tag?: string;
  newTag?: string;
  lastIndexUpdateTime: string;
  purity?: string;
  status?: string;
}

export async function buildTsNovelDb(ctx: RuntimeContext): Promise<number> {
  const res = await fetch(API).then((item) => item.json());
  if (res.code !== "200") throw new Error("Failed to fetch tsnovel list");
  const list = res.data.list as TsNovelInfo[];
  await updateRecords(ctx, list);
  await ctx.state.kv.set(["tsnovel", "meta", "last_update"], Date.now());
  return list.length;
}

export async function updateTsNovelDb(ctx: RuntimeContext): Promise<TsNovelInfo[]> {
  const lastUpdate = (await ctx.state.kv.get<number>(["tsnovel", "meta", "last_update"])).value ?? 0;
  const newRecords: TsNovelInfo[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(UPDATE_API.replace("{{page}}", page.toString())).then((item) => item.json());
    if (res.code !== "200") throw new Error("Failed to fetch tsnovel update page");
    const list = res.data.list as TsNovelInfo[];
    if (list.length === 0) break;
    const stopIndex = list.findIndex((novel) => new Date(novel.lastIndexUpdateTime).getTime() <= lastUpdate);
    if (stopIndex !== -1) list.splice(stopIndex);
    await updateRecords(ctx, list);
    newRecords.push(...list);
    page++;
    if (stopIndex !== -1) break;
  }
  await ctx.state.kv.set(["tsnovel", "meta", "last_update"], Date.now());
  return newRecords;
}

export async function findTsNovel(ctx: RuntimeContext, name: string): Promise<TsNovelInfo | undefined> {
  const id = (await ctx.state.kv.get<string>(["tsnovel", "by_name", name])).value;
  if (!id) return undefined;
  return (await ctx.state.kv.get<TsNovelInfo>(["tsnovel", "info", id])).value ?? undefined;
}

export async function scanTsNovelFiles(ctx: RuntimeContext, dir: string, linkDir?: string): Promise<TsNovelInfo[]> {
  const found: TsNovelInfo[] = [];
  if (linkDir) await Deno.mkdir(linkDir, { recursive: true });
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".txt")) continue;
    const name = basename(entry.name, ".txt");
    const info = await findTsNovel(ctx, name);
    if (!info) continue;
    found.push(info);
    if (linkDir) {
      const source = join(dir, entry.name);
      const target = join(linkDir, entry.name);
      try {
        await Deno.link(source, target);
      } catch (error) {
        if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
      }
    }
  }
  return found;
}

async function updateRecords(ctx: RuntimeContext, list: TsNovelInfo[]): Promise<void> {
  for (const novel of list) {
    const atomic = ctx.state.kv.atomic();
    atomic.set(["tsnovel", "by_name", novel.bookName], novel.id);
    atomic.set(["tsnovel", "by_author", novel.authorName, novel.id], true);
    for (const tag of (novel.tag ?? "").split(",").map((item) => item.trim()).filter(Boolean)) {
      atomic.set(["tsnovel", "tag", tag, novel.id], true);
    }
    atomic.set(["tsnovel", "info", novel.id], compact({ ...novel }));
    await atomic.commit();
  }
}

function compact<T extends Record<string, unknown>>(input: T): T {
  for (const key in input) {
    if (input[key] === undefined || input[key] === null || input[key] === "") delete input[key];
  }
  return input;
}
