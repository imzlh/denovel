import { DOMParser, type Element, type HTMLDocument } from "jsr:@b-fuze/deno-dom";
import type { RuntimeContext } from "./context.ts";
import { fetchWithContext, type FetchOptions } from "./fetch.ts";

export function fromHTML(input: string): string {
  return input
    .replace(/&nbsp;/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replaceAll(/&#([0-9a-f]+)/gi, (_match, p1) => String.fromCharCode(Number.parseInt(p1, 16)));
}

export async function getDocumentWithContext(
  ctx: RuntimeContext,
  urlInput: URL | string,
  options: {
    abort?: AbortSignal;
    additionalHeaders?: Record<string, string>;
    ignoreStatus?: boolean;
    ignore_status?: boolean;
    measureIP?: boolean;
    networkOverride?: (url: string | URL, options?: FetchOptions) => Promise<Response>;
    referer?: string;
    charset?: string;
  } = {},
): Promise<HTMLDocument> {
  const url = new URL(urlInput);
  const fetchOptions: FetchOptions = {
    headers: {
      "Accept-Language": "zh-CN,zh;q=0.9",
      Accept: "text/html,application/xhtml+xml",
      ...(options.additionalHeaders ?? {}),
    },
    keepalive: true,
    timeoutSec: ctx.timeoutSec,
    redirect: "follow",
    credentials: "include",
    referrer: options.referer ?? `${url.protocol}//${url.host}/`,
    referrerPolicy: "unsafe-url",
    signal: options.abort,
    ignoreStatus: options.ignoreStatus ?? options.ignore_status,
  };
  const response = await (options.networkOverride
    ? options.networkOverride(url, fetchOptions)
    : fetchWithContext(ctx, url, fetchOptions));

  if (!response.ok && !(options.ignoreStatus ?? options.ignore_status)) {
    throw new Error(`Failed to fetch ${url.href}(status: ${response.status})`);
  }

  const data = new Uint8Array(await response.arrayBuffer());
  const charset = detectCharset(data, response.headers.get("Content-Type"), options.charset);
  const doc = new DOMParser().parseFromString(new TextDecoder(charset).decode(data), "text/html");
  Object.defineProperty(doc, "documentURI", { value: url });
  return doc;
}

function detectCharset(data: Uint8Array, contentType: string | null, fallback = "utf-8"): string {
  const headerCharset = contentType?.match(/charset=([^;\s]+)/i)?.[1];
  if (headerCharset) return headerCharset;
  const utf8 = new TextDecoder("utf-8").decode(data);
  return utf8.match(/<meta\s+charset=["']?([^"'\s>]+)/i)?.[1] ??
    utf8.match(/<meta.+content-type.+content=["'].+charset=([^"'\s>]+)/i)?.[1] ??
    fallback;
}

export const WRAP_EL = [
  "br",
  "hr",
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "pre",
  "blockquote",
  "figure",
  "figcaption",
];

export const PRESERVE_EL = [
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "del",
  "ins",
  "mark",
  "center",
  "ul",
  "ol",
  "dl",
  "dt",
  "dd",
  "td",
  "th",
  "ruby",
  "rt",
  "rp",
  "sub",
  "sup",
  "code",
  "kbd",
  "samp",
  "var",
  "cite",
  "q",
  "abbr",
  "dfn",
  "time",
  "a",
  "video",
  "audio",
  "right",
  "tcenter",
];

const SPECIAL_CSS: Array<[string, string | ((value: string) => boolean), string]> = [
  ["font-weight", (value) => Number.parseInt(value, 10) > 500, "strong"],
  ["font-style", "italic", "em"],
  ["text-decoration", "underline", "u"],
  ["text-decoration", "line-through", "del"],
  ["vertical-align", "super", "sup"],
  ["vertical-align", "sub", "sub"],
  ["display", "block", "div"],
  ["display", "inline-block", "span"],
  ["text-align", "center", "tcenter"],
  ["text-align", "right", "right"],
];

const IGNORE_TAGS = new Set([
  "script",
  "noscript",
  "style",
  "iframe",
  "object",
  "embed",
  "applet",
  "canvas",
  "input",
  "button",
  "form",
  "comment",
]);

export function processContent(
  ctx?: Element | null,
  parentStyle: Record<string, string> = {},
  relativeURL: URL = new URL("file:///"),
): string {
  let text = "";
  if (!ctx) return text;

  for (const node of ctx.childNodes) {
    const nodeName = node.nodeName.toLowerCase();
    if (nodeName === "img") {
      const el = node as Element;
      const src = findImageSource(el);
      if (src) text += `\r\n\r\n[img=${el.getAttribute("width") || 0},${el.getAttribute("height") || 0}]${src}[/img]\r\n\r\n`;
    } else if (nodeName === "a") {
      const el = node as Element;
      const hrefRaw = el.getAttribute("href");
      if (hrefRaw) {
        const href = new URL(hrefRaw, relativeURL).href.replaceAll("]", "&#93;");
        text += `[link=${href}]${processContent(el, parentStyle, relativeURL)}[/link]`;
      } else {
        text += processContent(el, parentStyle, relativeURL);
      }
    } else if (node.nodeType === node.TEXT_NODE) {
      text += ` ${node.textContent.replaceAll(/[\s^\r\n]+/g, " ")}`;
    } else if (node.nodeType === node.ELEMENT_NODE) {
      const el = node as Element;
      const rtag = el.tagName.toLowerCase();
      if (IGNORE_TAGS.has(rtag)) continue;
      const tags: string[] = [];
      if (PRESERVE_EL.includes(rtag)) tags.push(rtag);
      const style = getCSS(el, parentStyle);
      const outerTag = cssToTag(style);
      if (outerTag !== "span" && outerTag !== rtag) tags.push(outerTag);
      let wrap = WRAP_EL.includes(rtag);
      for (let i = 0; i < tags.length; i++) {
        if (WRAP_EL.includes(tags[i])) {
          tags.splice(i, 1);
          wrap = true;
        }
      }
      const inner = processContent(el, style, relativeURL);
      if (!inner.trim()) {
        if (wrap) text += "\r\n";
        continue;
      }
      const uniqueTags = Array.from(new Set(tags));
      text += uniqueTags.map((tag) => `[${tag}]`).join("");
      text += inner;
      text += uniqueTags.map((tag) => `[/${tag}]`).reverse().join("");
      if (wrap) text += "\r\n";
    }
  }
  return text.replaceAll(/(?:\r\n){3,}/g, "\r\n\r\n");
}

function findImageSource(el: Element): string | undefined {
  if (el.hasAttribute("src")) return el.getAttribute("src") ?? undefined;
  if (el.hasAttribute("srcset")) return el.getAttribute("srcset")?.split(/\s*,\s*/)[0];
  for (const attr of el.attributes) {
    const value = attr.value;
    if (attr.name.toLowerCase().includes("src")) return value;
    if ([".webp", ".png", ".jpg", ".jpeg"].some((ext) => value.endsWith(ext)) || value.startsWith("http")) return value;
  }
  return undefined;
}

function getCSS(el: Element, inheritStyle: Record<string, string> = {}): Record<string, string> {
  const style = { ...inheritStyle };
  const css = el.getAttribute("style");
  if (!css) return style;
  for (const rule of css.split(";").map((item) => item.trim()).filter(Boolean)) {
    const [key, value] = rule.split(":");
    if (key && value) style[key.trim()] = value.trim();
  }
  return style;
}

function cssToTag(css: Record<string, string>): string {
  for (const [name, cond, tag] of SPECIAL_CSS) {
    const value = css[name];
    if (!value) continue;
    if (typeof cond === "function" && cond(value)) return tag;
    if (typeof cond === "string" && value.toLowerCase() === cond) return tag;
  }
  return "span";
}
