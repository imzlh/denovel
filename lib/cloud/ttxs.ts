import { ensureDir } from "jsr:@std/fs/ensure-dir";
import { basename, join } from "jsr:@std/path";
import type { RuntimeContext } from "../core/context.ts";
import { fetchWithContext } from "../core/fetch.ts";
import { removeIllegalPath } from "../core/fs.ts";

const BASE_URL = "http://aaa.ttxiaoshuo.top/";

export interface TtxsFileItem {
  canDownload: boolean;
  modifyTime: number;
  name: string;
  path: string;
  size: number;
  type: "file" | "folder";
}

export interface TtxsShareResult {
  id: string;
  token: string;
  files: TtxsFileItem[];
}

export async function getTtxsShareFiles(ctx: RuntimeContext, id: string): Promise<TtxsShareResult> {
  await fetchWithContext(ctx, BASE_URL, { ignoreStatus: true });
  const ref = { token: "" };
  const files = await getShareFiles(ctx, id, ref);
  return { id, token: ref.token, files };
}

export async function scanTtxsRange(
  ctx: RuntimeContext,
  start: number,
  end: number,
  maxConsecutiveFails = 5,
): Promise<TtxsShareResult[]> {
  const results: TtxsShareResult[] = [];
  let consecutiveFails = 0;
  for (let current = start; current <= end && consecutiveFails < maxConsecutiveFails; current++) {
    try {
      const result = await getTtxsShareFiles(ctx, `yx${current}`);
      results.push(result);
      consecutiveFails = 0;
    } catch {
      consecutiveFails++;
    }
    await sleep(Math.random() * 2 + 1);
  }
  return results;
}

export async function downloadTtxsFiles(ctx: RuntimeContext, share: TtxsShareResult, outputDir: string): Promise<number> {
  await ensureDir(outputDir);
  let count = 0;
  for (const file of share.files) {
    if (file.type !== "file" || !file.canDownload) continue;
    const link = buildLink(file, share.token, share.id);
    const response = await fetchWithContext(ctx, link, { timeoutSec: 30 });
    if (!response.ok || !response.body) throw new Error(`Download failed: ${file.name}`);
    // Share metadata is remote input; only ever create a file directly under
    // the requested output directory.
    const rawName = basename(file.name.replaceAll("\\", "/"));
    const safeName = removeIllegalPath(rawName).replaceAll(/^[.]+$/g, "_") || `file-${count + 1}`;
    await Deno.writeFile(join(outputDir, safeName), response.body);
    count++;
  }
  return count;
}

function buildLink(file: TtxsFileItem, token: string, shareId: string): string {
  return `${BASE_URL}?explorer/share/fileDownload` +
    `&path=${encodeURIComponent(file.path)}` +
    `&accessToken=${token}` +
    `&download=1&_etag=${file.modifyTime}-${file.size}` +
    `&shareID=${shareId}`;
}

async function getShareFiles(ctx: RuntimeContext, id: string, ref: { token: string }): Promise<TtxsFileItem[]> {
  const options = await fetchWithContext(ctx, `${BASE_URL}?user/view/options&v=1743828817&full=1&shareID=${id}`)
    .then((res) => res.json());
  if (options.code !== true) throw new Error(String(options.data));
  const accessToken = options.data?.kod?.accessToken;
  const viewToken = options.data?.kod?.viewToken;
  if (!accessToken || !viewToken) throw new Error("Invalid share link");
  ref.token = accessToken;

  const csrf = await ctx.cookies.getCookie("aaa.ttxiaoshuo.top", "CSRF_TOKEN");
  const getForm = new FormData();
  getForm.append("CSRF_TOKEN", csrf ?? "");
  getForm.append("API_ROUTE", "explorer/share/get");
  const share = await fetchWithContext(ctx, `${BASE_URL}?explorer/share/get&shareID=${id}`, { body: getForm })
    .then((res) => res.json());
  if (share.code !== true) throw new Error(String(share.data));
  const path = share.data?.sourceInfo?.path;
  if (!path) throw new Error("Invalid share path");

  const listForm = new FormData();
  listForm.append("API_ROUTE", "explorer/share/pathList");
  listForm.append("fromType", "tree");
  listForm.append("path", path);
  listForm.append("CSRF_TOKEN", csrf ?? "");
  const list = await fetchWithContext(ctx, `${BASE_URL}?explorer/share/pathList&shareID=${id}`, { body: listForm })
    .then((res) => res.json());
  if (!list.data?.fileList) throw new Error("Invalid share file list");
  return list.data.fileList as TtxsFileItem[];
}

function sleep(sec: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, sec * 1000));
}
