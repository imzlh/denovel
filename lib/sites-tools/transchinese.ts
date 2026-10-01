import { ensureDir } from "jsr:@std/fs/ensure-dir";
import { dirname, join } from "jsr:@std/path";
import type { RuntimeContext } from "../core/context.ts";
import { fetchWithContext } from "../core/fetch.ts";
import { exists, removeIllegalPath } from "../core/fs.ts";
import { getDocumentWithContext } from "../core/html.ts";

export interface TransChineseOptions {
  outputDir: string;
  convertTxtToEpub?: boolean;
}

export async function downloadTransChinese(
  ctx: RuntimeContext,
  indexUrl: string,
  options: TransChineseOptions,
): Promise<number> {
  await ensureDir(options.outputDir);
  return await downloadIndex(ctx, new URL(indexUrl), options);
}

async function downloadIndex(ctx: RuntimeContext, indexUrl: URL, options: TransChineseOptions): Promise<number> {
  let count = 0;
  for await (const [title, url] of getIndex(ctx, indexUrl)) {
    const epubPath = join(options.outputDir, `${removeIllegalPath(title)}.epub`);
    const txtPath = join(options.outputDir, `${removeIllegalPath(title)}.txt`);
    if (await exists(epubPath) || await exists(txtPath)) continue;
    try {
      const [name, bytes] = await getNovelByUrl(ctx, url);
      const output = join(options.outputDir, name);
      await ensureDir(dirname(output));
      if (options.convertTxtToEpub && output.endsWith(".txt")) {
        const { txtToEpub } = await import("../epub/txt.ts");
        await txtToEpub(new TextDecoder().decode(bytes), output, output.replace(/\.txt$/i, ".epub"));
      } else {
        await Deno.writeFile(output, bytes);
      }
      count++;
    } catch {
      count += await downloadIndex(ctx, url, options);
    }
  }
  return count;
}

async function getNovelByUrl(ctx: RuntimeContext, url: URL): Promise<[string, Uint8Array]> {
  const doc = await getDocumentWithContext(ctx, url);
  const link = doc.querySelector("body > div.md-container > main > div > div.md-content > article > p:nth-child(2) > a");
  const title = link?.textContent;
  const href = link?.getAttribute("href");
  if (!title || !href) throw new Error(`Not a novel page: ${url.href}`);
  const response = await fetchWithContext(ctx, new URL(href, url));
  return [removeIllegalPath(title), await response.bytes()];
}

async function* getIndex(ctx: RuntimeContext, url: URL): AsyncGenerator<[string, URL]> {
  const doc = await getDocumentWithContext(ctx, url);
  for (const item of doc.querySelectorAll("body > div.md-container > main > div > div.md-content > article > table > tbody > tr > td:nth-child(1) > a")) {
    const title = item.textContent;
    let href = item.getAttribute("href");
    if (!title || !href) continue;
    if (!href.endsWith("/")) href += "/";
    yield [title, new URL(href, url)];
  }
}
