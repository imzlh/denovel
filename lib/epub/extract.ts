import { ensureDir } from "jsr:@std/fs/ensure-dir";
import { basename, dirname, join } from "jsr:@std/path";
import * as zip from "jsr:@quentinadam/zip";
import { DOMParser } from "jsr:@b-fuze/deno-dom";
import { parse as parseXml, type OrphanTagNode, type RegularTagNode, type XmlNode } from "jsr:@melvdouc/xml-parser";
import { processContent } from "../core/html.ts";

class ElementArray<T extends XmlNode> extends Array<T> {
  static fromXml(xml: string): ElementArray<XmlNode> {
    return new ElementArray(...parseXml(xml));
  }

  static getText(node: XmlNode): string {
    switch (node.kind) {
      case "TEXT_NODE":
        return node.value;
      case "REGULAR_TAG_NODE":
        return node.children.map(ElementArray.getText).join("");
      default:
        return "";
    }
  }

  static override from(nodes: XmlNode[]): ElementArray<XmlNode> {
    return new ElementArray(...nodes.filter((node) => node.kind === "REGULAR_TAG_NODE" || node.kind === "ORPHAN_TAG_NODE"));
  }

  get children(): ElementArray<XmlNode> {
    return new ElementArray(...this.flatMap((node) => node.kind === "REGULAR_TAG_NODE" ? node.children : []));
  }

  selectNode(name: string, attrs?: Record<string, RegExp | string | undefined>, deep = false): ElementArray<RegularTagNode | OrphanTagNode> {
    const nodes = new ElementArray<RegularTagNode | OrphanTagNode>();
    const expectedName = name.toLowerCase();
    for (const node of this) {
      if (node.kind !== "REGULAR_TAG_NODE" && node.kind !== "ORPHAN_TAG_NODE") continue;
      if (node.tagName.toLowerCase() === expectedName && attributesMatch(node, attrs)) {
        nodes.push(node);
      } else if (deep && node.kind === "REGULAR_TAG_NODE") {
        nodes.push(...ElementArray.from(node.children).selectNode(name, attrs, deep));
      }
    }
    return nodes;
  }

  selectSubNode(name: string, attrs?: Record<string, RegExp | string | undefined>, deep = false): ElementArray<RegularTagNode | OrphanTagNode> {
    return this.children.selectNode(name, attrs, deep);
  }

  get textContent(): string {
    return this.map(ElementArray.getText).join("");
  }
}

function attributesMatch(node: RegularTagNode | OrphanTagNode, attrs?: Record<string, RegExp | string | undefined>): boolean {
  if (!attrs) return true;
  for (const [key, value] of Object.entries(attrs)) {
    if (!node.attributes || !(key in node.attributes)) return false;
    if (value === undefined) continue;
    const actual = node.attributes[key];
    if (typeof value === "string" ? actual !== value : !value.test(actual)) return false;
  }
  return true;
}

export interface ExtractOptions {
  addTitle?: boolean;
  removeHtmlTitle?: boolean;
  extractImages?: boolean;
}

export async function epubToTxt(
  source: Uint8Array<ArrayBuffer>,
  outdir: string,
  options: ExtractOptions = {},
): Promise<string> {
  const addTitle = options.addTitle ?? true;
  const removeHtmlTitle = options.removeHtmlTitle ?? true;
  const extractImages = options.extractImages ?? true;
  await ensureDir(outdir);

  const files = await zip.extract(source);
  const mimetype = files.find((file) => file.name === "mimetype")?.data;
  const containerXml = files.find((file) => file.name === "META-INF/container.xml")?.data;
  if (!mimetype || !containerXml || new TextDecoder().decode(mimetype) !== "application/epub+zip") {
    throw new Error("Invalid EPUB file: mimetype or container.xml not found or not valid");
  }

  const container = ElementArray.fromXml(new TextDecoder().decode(containerXml));
  const rootfileEl = container.selectNode("container").selectSubNode("rootfiles").selectSubNode("rootfile", { "full-path": undefined })[0];
  const rootfilePath = rootfileEl?.attributes?.["full-path"];
  if (!rootfilePath) throw new Error("Invalid EPUB file: rootfile not found or not valid");

  const rootfile = files.find((file) => file.name === rootfilePath);
  if (!rootfile) throw new Error("Invalid EPUB file: rootfile not found");
  const rootDir = dirname(rootfilePath);
  const getFile = (path: string) => files.find((file) => file.name === zipJoin(rootDir, path));

  const opf = ElementArray.fromXml(new TextDecoder().decode(rootfile.data));
  const version = Number.parseFloat(opf.selectNode("package", { version: undefined })?.[0]?.attributes?.version || "0");
  if (!Number.isFinite(version) || version < 2) throw new Error(`Unsupported EPUB version: ${version}`);

  const idMap: Record<string, string> = {};
  for (const item of opf.selectNode("package").selectSubNode("manifest").selectSubNode("item")) {
    const id = item.attributes?.id;
    const href = item.attributes?.href;
    if (!id || !href) continue;
    if (id in idMap) throw new Error(`Duplicate ID in manifest: ${id}`);
    idMap[id] = href;
  }

  const chapters: string[] = [];
  for (const itemref of opf.selectNode("package").selectSubNode("spine").selectSubNode("itemref", { idref: undefined })) {
    const idref = itemref.attributes?.idref;
    if (!idref) continue;
    const filePath = idMap[idref];
    if (!filePath || filePath.includes("toc")) continue;
    const chapter = getFile(filePath);
    if (!chapter) throw new Error(`Chapter file not found: ${filePath}`);
    chapters.push(new TextDecoder().decode(chapter.data));
  }

  let text = "";
  for (let i = 0; i < chapters.length; i++) {
    const document = new DOMParser().parseFromString(chapters[i], "text/html");
    if (removeHtmlTitle) {
      for (const heading of Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))) {
        if (heading.textContent.trim() !== "") heading.remove();
      }
    }

    if (extractImages) {
      for (const img of Array.from(document.querySelectorAll("img[src]"))) {
        const src = img.getAttribute("src");
        if (!src) continue;
        const imgData = getFile(src);
        if (!imgData) continue;
        await ensureDir(join(outdir, dirname(src)));
        await Deno.writeFile(join(outdir, src), imgData.data);
        img.setAttribute("src", "file://" + join(outdir, src));
      }
    }

    const title = document.querySelector("head > title")?.textContent.trim();
    if (title === "目录") continue;
    const contentText = processContent(document.body).trim();
    if (!title || !addTitle || contentText.split(/\r\n/).slice(0, 2).some((line) => line.includes(title))) {
      text += "\r\n" + contentText + "\r\n\r\n";
    } else {
      text += `第${i}章 ${title}\r\n${contentText}\r\n\r\n`;
    }
  }

  await Deno.writeTextFile(join(outdir, "content.txt"), text);
  return text;
}

export async function documentToTxt(source: string, outdir: string, options: ExtractOptions = {}): Promise<string> {
  const extension = basename(source).split(".").pop()?.toLowerCase();
  if (extension === "epub") return epubToTxt(await Deno.readFile(source), outdir, options);

  const parser = await import("jsr:@baiq/document-parser");
  let document: { pages: Array<{ paragraphs: string[] }> };
  if (extension === "pdf") {
    document = await parser.extractPDFContent(source, outdir);
  } else if (extension === "docx") {
    document = await parser.extractDOCXContent(source, outdir);
  } else {
    throw new Error(`Unsupported file format: ${extension ?? "unknown"}`);
  }

  if (!document.pages.length) throw new Error("Document is empty");
  const text = document.pages.map((page) => page.paragraphs.join("\r\n")).join("\r\n\r\n") + "\r\n\r\n";
  await ensureDir(outdir);
  await Deno.writeTextFile(join(outdir, "content.txt"), text);
  return text;
}

function zipJoin(base: string, path: string): string {
  const prefix = base === "." ? "" : base.replace(/\/+$/g, "") + "/";
  const parts: string[] = [];
  for (const part of (prefix + path).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}
