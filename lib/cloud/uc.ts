import { ensureDir } from "jsr:@std/fs/ensure-dir";
import { join } from "jsr:@std/path";
import type { RuntimeContext } from "../core/context.ts";
import { fetchWithContext } from "../core/fetch.ts";

interface DownloadInfo {
  fids: string[];
  fids_token: string[];
  pwd_id: string;
  stoken: string;
}

interface UcFileInfo {
  fid: string;
  file_name: string;
  share_fid_token: string;
  file: boolean;
}

export async function checkUcLogin(ctx: RuntimeContext): Promise<string | undefined> {
  const state = await fetchWithContext(ctx, "https://fast.uc.cn/api/info?fr=pc&pr=UCBrowser", {
    method: "POST",
    body: JSON.stringify({ st: "" }),
    headers: { "Content-Type": "application/json", "x-biz-retry": "0" },
  }).then((res) => res.json());
  if (state.success && state.data?.nickname) return state.data.nickname;
  return undefined;
}

export async function downloadUcShares(ctx: RuntimeContext, links: string[], outputDir: string): Promise<number> {
  await ensureDir(outputDir);
  let count = 0;
  await fetchWithContext(ctx, "https://pc-api.uc.cn/1/clouddrive/member?entry=ft&fr=pc&pr=UCBrowser&fetch_subscribe=true&_ch=home", {
    ignoreStatus: true,
  });
  for (const link of links) {
    const id = extractUcShareId(new URL(link));
    const stoken = await getToken(ctx, id);
    const files = (await listDir(ctx, id, stoken)).filter((file) => file.file);
    const downloads = getLinks(ctx, {
      fids: files.map((file) => file.fid),
      fids_token: files.map((file) => file.share_fid_token),
      pwd_id: id,
      stoken,
    });
    for await (const item of downloads) {
      await download(ctx, item.url, join(outputDir, item.name));
      count++;
    }
  }
  return count;
}

export function extractUcShareId(url: URL): string {
  const id = url.pathname.match(/\/s\/([a-zA-Z0-9]+)\/?$/i);
  if (!id) throw new Error(`Invalid UC share URL: ${url.href}`);
  return id[1];
}

async function getToken(ctx: RuntimeContext, id: string): Promise<string> {
  const res = await fetchWithContext(ctx, "https://pc-api.uc.cn/1/clouddrive/share/sharepage/token?entry=ft&fr=pc&pr=UCBrowser", {
    method: "POST",
    body: JSON.stringify({ pwd_id: id, passcode: "", share_for_transfer: true }),
    headers: { "Content-Type": "application/json", "x-biz-retry": "0" },
  }).then((item) => item.json());
  if (res.status !== 200) throw new Error(`UC token failed: ${res.message}`);
  return res.data.stoken;
}

async function listDir(ctx: RuntimeContext, id: string, stoken: string): Promise<UcFileInfo[]> {
  const url = new URL("https://pc-api.uc.cn/1/clouddrive/transfer_share/detail");
  for (const [key, value] of Object.entries({
    entry: "ft",
    pwd_id: id,
    pdir_fid: "0",
    fetch_file_list: "1",
    passcode: "",
    _page: "1",
    _size: "50",
    _fetch_total: "1",
    _fetch_task: "1",
    _fetch_share: "1",
    _sort: "file_type:asc,file_name:asc",
    stoken,
    fr: "pc",
    pr: "UCBrowser",
  })) {
    url.searchParams.append(key, value);
  }
  const res = await fetchWithContext(ctx, url, { headers: { "x-biz-retry": "0" } }).then((item) => item.json());
  if (res.status !== 200) throw new Error(`UC list failed: ${res.message}`);
  return res.data.list as UcFileInfo[];
}

async function* getLinks(ctx: RuntimeContext, info: DownloadInfo): AsyncGenerator<{ url: URL; name: string }> {
  const res = await fetchWithContext(ctx, "https://pc-api.uc.cn/1/clouddrive/file/download?entry=ft&fr=pc&pr=UCBrowser", {
    body: JSON.stringify(info),
    headers: { "Content-Type": "application/json", "x-biz-retry": "0" },
    method: "POST",
  }).then((item) => item.json());
  if (res.status !== 200) throw new Error(`UC download link failed: ${res.message}`);
  for (const file of res.data) {
    yield { url: new URL(file.download_url, "https://fast.uc.cn"), name: file.file_name };
  }
}

async function download(ctx: RuntimeContext, url: URL, dist: string): Promise<void> {
  const response = await fetchWithContext(ctx, url);
  if (!response.body) throw new Error(`UC download failed: empty response ${url.href}`);
  await Deno.writeFile(dist, response.body);
}
