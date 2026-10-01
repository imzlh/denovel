import { ensureDir } from "jsr:@std/fs/ensure-dir";
import { join } from "jsr:@std/path";
import type { RuntimeContext } from "../core/context.ts";
import { fetchWithContext } from "../core/fetch.ts";
import { exists } from "../core/fs.ts";

const API = {
  list:
    "https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc&uc_param_str=&pdir_fid={{fid}}&_page=1&_size=2000&_fetch_total=1&_fetch_sub_dirs=0&_sort=file_type:asc,updated_at:desc",
  download: "https://drive-pc.quark.cn/1/clouddrive/file/download?pr=ucpro&fr=pc&uc_param_str=",
  name: "https://pan.quark.cn/account/info?fr=pc&platform=pc",
};

interface QuarkFile {
  fid: string;
  file_name: string;
  dir: boolean;
  file: boolean;
  download_url?: string;
}

export async function checkQuarkLogin(ctx: RuntimeContext): Promise<string | undefined> {
  const data = await fetchWithContext(ctx, API.name).then((res) => res.json());
  return data.data?.nickname;
}

export async function downloadQuarkDirectory(
  ctx: RuntimeContext,
  dirId: string,
  outputDir: string,
): Promise<{ files: number }> {
  await ensureDir(outputDir);
  let count = 0;
  const files = await listQuarkFiles(ctx, dirId);
  count += await downloadQuarkFiles(ctx, files.filter((file) => file.file), outputDir);
  for (const file of files.filter((item) => item.dir)) {
    count += (await downloadQuarkDirectory(ctx, file.fid, join(outputDir, file.file_name))).files;
  }
  return { files: count };
}

async function listQuarkFiles(ctx: RuntimeContext, dirId: string): Promise<QuarkFile[]> {
  const data = await fetchWithContext(ctx, API.list.replace("{{fid}}", dirId)).then((res) => res.json());
  if (data.code !== 0) throw new Error(`Quark list failed: ${data.message}`);
  return data.data.list as QuarkFile[];
}

async function downloadQuarkFiles(ctx: RuntimeContext, files: QuarkFile[], outputDir: string): Promise<number> {
  if (files.length === 0) return 0;
  const data = await fetchWithContext(ctx, API.download, {
    method: "POST",
    body: JSON.stringify({ fids: files.map((file) => file.fid) }),
    headers: { "Content-Type": "application/json" },
  }).then((res) => res.json());
  if (data.code !== 0) throw new Error(`Quark download failed: ${data.message}`);

  let count = 0;
  const tasks: Promise<void>[] = [];
  for (const file of data.data as QuarkFile[]) {
    if (!file.file || !file.download_url) continue;
    const output = join(outputDir, file.file_name);
    if (await exists(output)) continue;
    tasks.push(fetchWithContext(ctx, file.download_url)
      .then((res) => {
        if (!res.ok || !res.body) throw new Error(`Download failed: ${file.file_name}`);
        return Deno.writeFile(output, res.body);
      })
      .then(() => {
        count++;
      }));
    if (tasks.length >= 8) {
      await Promise.all(tasks);
      tasks.length = 0;
    }
  }
  await Promise.all(tasks);
  return count;
}
