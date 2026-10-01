import { ensureDir } from "jsr:@std/fs/ensure-dir";
import { extname, join } from "jsr:@std/path";
import type { RuntimeContext } from "../core/context.ts";
import { fetchWithContext } from "../core/fetch.ts";
import { getDocumentWithContext } from "../core/html.ts";
import { removeIllegalPath } from "../core/fs.ts";

const BASE_URL = "http://chenakc.i234.me:5002/";
const BOOK_SEL = "body > div.container-fluid > div > div.col-sm-10 > div.discover.load-more > div > div.book";

export interface I234Book {
  cover: string;
  entry: URL;
  author: string;
  name: string;
}

export async function loginI234(ctx: RuntimeContext, username: string, password: string): Promise<void> {
  const form = new FormData();
  form.append("username", username);
  form.append("password", password);
  form.append("remember_me", "off");
  form.append("submit", "");
  const response = await fetchWithContext(ctx, new URL("/login", BASE_URL), { method: "POST", body: form });
  const text = await response.text();
  if (text.includes("用户名或密码错误")) throw new Error("Invalid username or password");
}

export async function* listI234Books(ctx: RuntimeContext, startPage = 1): AsyncGenerator<I234Book> {
  for (let page = startPage; ; page++) {
    const doc = await getDocumentWithContext(ctx, `${BASE_URL}page/${page}`);
    const books = doc.querySelectorAll(BOOK_SEL);
    if (books.length === 0) return;
    for (const book of books) {
      const img = book.querySelector("img");
      const link = book.querySelector("a");
      const title = book.querySelector(".title");
      const author = book.querySelector(".author");
      if (!img || !link || !title || !author) continue;
      yield {
        entry: new URL(link.getAttribute("href")!, BASE_URL),
        name: title.textContent,
        author: author.textContent,
        cover: img.getAttribute("src") ?? "",
      };
    }
  }
}

export async function downloadI234Books(
  ctx: RuntimeContext,
  outputDir: string,
  options: { startPage?: number; limit?: number } = {},
): Promise<number> {
  await ensureDir(outputDir);
  let count = 0;
  for await (const book of listI234Books(ctx, options.startPage ?? 1)) {
    await downloadI234Book(ctx, book, outputDir);
    count++;
    if (options.limit && count >= options.limit) break;
  }
  return count;
}

async function downloadI234Book(ctx: RuntimeContext, book: I234Book, outputDir: string): Promise<void> {
  const doc = await getDocumentWithContext(ctx, book.entry);
  const links = Array.from(doc.querySelectorAll(".button-link[href]"));
  let link = links.find((item) => item.getAttribute("href")?.includes("epub"));
  link ??= links.find((item) => item.getAttribute("href")?.includes("txt"));
  link ??= links[0];
  if (!link) throw new Error(`No download link found: ${book.name}`);
  const url = new URL(link.getAttribute("href")!, book.entry);
  const response = await fetchWithContext(ctx, url);
  if (!response.body) throw new Error(`Failed to download ${book.name}`);
  await Deno.writeFile(join(outputDir, `${removeIllegalPath(book.name)}${extname(url.pathname)}`), response.body);
}
