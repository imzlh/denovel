import { basename } from "jsr:@std/path";
import { fromHTML, PRESERVE_EL, WRAP_EL } from "../core/html.ts";
import { Status } from "../core/status.ts";
import { generateEpub, type EpubContentOptions, type EpubOptions } from "./generate.ts";

// deno-lint-ignore no-control-regex
const invisibleChars = /[\x00-\x1F\x7F-\x9F\u200B-\u200F\uFEFF]/g;
export const DEFAULT_MAX_CHARS_PER_CHAPTER = 50_000;
const MIN_CHARS_PER_CHAPTER = 80;

const chapterPatterns = [
  /[\r\n]+(?:正文\s*)?第\s*[零一二三四五六七八九十百千万亿0-9]+卷\s*[：:]*\s*第\s*[零一二三四五六七八九十百千万亿0-9]+[章节回话集幕篇]([^\r\n]*)[\r\n]+/gi,
  /[\r\n]+(?:正文\s*)?第\s*[零一二三四五六七八九十百千万亿0-9]+[章节回话集幕篇]([^\r\n]*)[\r\n]+/gi,
  /[\r\n]+(?:正文\s*)?(?:Vol\.?\s*[0-9IVXLC]+\s*[：:]*\s*)?(?:Chapter|Chapt|Ch|卷)\s*[0-9IVXLC]+([^\r\n]*)[\r\n]+/gi,
  /[\r\n]+(?:正文\s*)?(?:第\s*[零一二三四五六七八九十百千万亿0-9]+卷\s*[：:]*\s*)?(?:序章|前言|楔子|尾声|后记|番外)([^\r\n]*)[\r\n]+/gi,
  /[\r\n]+(?:正文\s*)?(?:第\s*[零一二三四五六七八九十百千万亿0-9]+卷\s*[：:]*\s*)?[零一二三四五六七八九十百千万亿0-9]+(?:\s*、\s*|\s+)([^\r\n]+)[\r\n]+/gi,
  /[\r\n]+\s*(?:(?:chapter|part|ep|stage)\.?\s*)\d+\s*[、. ：:~，·～．『]\s*(.*)\s*』?[\r\n]+/gi,
  /[\r\n]+\s*No[、.．]\d+\s*(.+)\s*[\r\n]+/gi,
  /[\r\n]+\s*(?:正文\s*)?\d+＜(.+)＞\s*[\r\n]+/gi,
  /[\r\n]+\s*\[WEB\]\s*(.+)\s*[\r\n]+/gi,
  /[\r\n]+(?:正文\s*)?(?:第\s*[零一二三四五六七八九十百千万亿0-9]+卷\s*[：:]*\s*)?第\s*[零一二三四五六七八九十百千万亿0-9]+[～~\-－][零一二三四五六七八九十百千万亿0-9]+[章节回话集幕篇][^\r\n]*[\r\n]+/gi,
  /[\r\n]+\s*(?:正文\s*)?\[?\d+\]?\s*[、. ：:~，．·～]\s*(.+)\s*[\r\n]+/gi,
  /[\r\n]+\s*[\-零一二三四五六七八九十百千万亿0-9序]+[、. ：:~，·．～-]\s*(.+)\s*[\r\n]+/gi,
  /[\r\n]+\s*(?:(?:chapter|part|ep|no)\.?\s*)[零一二三四五六七八九十百千万亿序0-9]+\s*(.+?)\s*[\r\n]+/gi,
  /[\r\n]+\s*[＃§]\s*\d+\s*(.+?)\s*[\r\n]+/gi,
  /[\r\n]+.{0,20}\s*[：:]\s*\d+\s+(.+)\s*[\r\n]+/gi,
  /[\r\n]+(.+)[\r\n]+([=\-─])\2{5,}[\r\n]+/gi,
  /[\r\n]+\s*第\s*[\-零一二三四五六七八九十百千万亿0-9]+卷\s*(?:.+)\s+(.+)\s*[\r\n]+/gi,
  /[\r\n](?:\s+|[\s\S]{1,20})第\s*[\-零一二三四五六七八九十百千万亿0-9]+\s*[章节回话集幕篇]\s*(.+)\s+/gi,
  /[\r\n]+\s*[\-零一二三四五六七八九十百千万亿序0-9]+\s+(.+)\s*[\r\n]+/gi,
  /[\r\n]\d+(.+)[\r\n]/g,
  /[\r\n]+.{1,10}\s*\d+[、. ：:~，．·～]\s*(.+?)\s*[\r\n]+/gi,
  /[\r\n](?:\s+|[\s\S]{1,50})第\s*[\-零一二三四五六七八九十百千万亿0-9]+\s*[章节回话集幕篇]\s*(.+)\s+/gi,
];

type Reporter = (status: Status, message: string) => void;

export interface TxtToEpubOptions {
  perPageMax?: number;
  merge?: boolean;
  jpFormat?: boolean;
  reporter?: Reporter;
  networkHandler?: typeof fetch;
}

const specialTag: Record<string, string[]> = {
  dialogue: ["「", "」"],
  quote: ["【", "『", "】", "』"],
  comments: ["(", ")"],
};

function addTags(text: string): string {
  const stack: Array<{ tag: string; char: string }> = [];
  let result = "";

  for (const char of text) {
    let handled = false;
    for (const tag in specialTag) {
      const index = specialTag[tag].indexOf(char);
      if (index < 0) continue;
      handled = true;
      if (index % 2 === 0) {
        stack.push({ tag, char });
        result += `<${tag}>${char}`;
      } else if (stack.length > 0 && stack[stack.length - 1].char === specialTag[tag][index - 1]) {
        result += `${char}</${stack.pop()?.tag}>`;
      } else {
        result += char;
      }
      break;
    }
    if (!handled) result += char;
  }

  while (stack.length > 0) result += `</${stack.pop()?.tag}>`;
  return result;
}

function splitByIndent(text: string): EpubContentOptions[] {
  const result: EpubContentOptions[] = [];
  let lines = text.split(/\r?\n/);
  if (lines.length === 0) lines = text.split("\r");
  if (lines.length === 0) lines = text.replaceAll(/\s{2,}/g, (match) => "\n" + match.substring(1)).split("\n");
  if (lines.length === 0) return [{ title: "前言", data: text }];

  let currentTitle = "";
  let currentData: string[] = [];
  let pendingTitles: string[] = [];
  let isFirstSection = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;

    if (indent === 0) {
      pendingTitles.push(trimmed);
      continue;
    }

    if (isFirstSection && pendingTitles.length > 0) {
      currentTitle = pendingTitles.pop() ?? "";
      currentData.push(...pendingTitles);
      pendingTitles = [];
      isFirstSection = false;
    }

    if (!isFirstSection && pendingTitles.length > 0) {
      if (currentTitle !== "") result.push({ title: currentTitle.slice(0, 50), data: currentData.join("\n") });
      currentTitle = pendingTitles.pop() ?? "";
      currentData = [];
      pendingTitles = [];
    }

    currentData.push(line);
  }

  if (pendingTitles.length > 0) {
    if (isFirstSection) {
      currentTitle = pendingTitles.pop() ?? "";
      currentData = pendingTitles;
    } else {
      if (currentTitle !== "") result.push({ title: currentTitle.slice(0, 50), data: currentData.join("\n") });
      currentTitle = pendingTitles.pop() ?? "";
      currentData = [];
    }
  }

  if (currentTitle !== "" || currentData.length > 0) {
    result.push({ title: currentTitle.slice(0, 50), data: currentData.join("\n") });
  }
  return result;
}

function fromPattern(rawText: string, matches: Iterable<RegExpMatchArray>, merge = false): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  let currentContentStart = 0;
  let pendingTitle = "";
  let pendingContent = "";

  for (const match of matches) {
    const index = match.index ?? -1;
    if (index < 0) continue;
    const title = (match[1] || "").trim();
    const contentEnd = index;
    pendingContent += rawText.slice(currentContentStart, contentEnd);
    currentContentStart = index;

    if (!merge || (pendingContent.length >= MIN_CHARS_PER_CHAPTER && pendingContent.length <= DEFAULT_MAX_CHARS_PER_CHAPTER)) {
      if (pendingTitle || pendingContent) result.push([pendingTitle, pendingContent]);
      pendingTitle = title;
      pendingContent = "";
    } else {
      pendingContent += title;
    }
  }

  pendingContent += rawText.slice(currentContentStart);
  if (pendingTitle || pendingContent) result.push([pendingTitle, pendingContent]);
  return result.filter(([title, content]) => title || content);
}

function maxChars(input: string, max: number): string {
  return input.length > max ? input.slice(0, max - 3) + "..." : input;
}

const removeTags = (input: string) => input.replaceAll(/\[\/?[a-z]+\]/g, "");

export function encodeContent(input: string, jpFormat = false): string {
  let result = "<p>" + fromHTML(input)
    .replace(/\s*[\r\n]+\s*/g, "</p><p>")
    .replace(invisibleChars, "") + "</p>";
  result = result.replaceAll(/<p> *<\/p>/g, "");
  return jpFormat ? addTags(result) : result;
}

export function processTXTContent(input: string, jpFormat = false): string {
  const preservedTags = PRESERVE_EL.concat(WRAP_EL);
  let text = encodeContent(input, jpFormat);
  text = text.replaceAll(/\[img=\d+,\d+\](.+?)\[\/img\]/g, (_match, url) =>
    url ? `<img src="${String(url).replaceAll("一", "-")}" referrerpolicy="no-referrer" />` : ""
  );
  text = text.replaceAll(/\[link=((?:https?:\/)?\/.+?)\](.*?)\[\/link\]/g, (_match, href, linkText) =>
    href ? `<a href="${href}" target="_blank">${linkText}</a>` : ""
  );
  text = text.replaceAll(/\[comment\](.+?)\[\/comment\]/g, (_match, value) => "<!-- " + removeTags(value) + " -->");

  const tagStack: string[] = [];
  return text.replaceAll(/\[(\/)?([a-z]{1,10})\]/g, (match, hasSlash, tag) => {
    const popResult = hasSlash ? tagStack.pop() : undefined;
    if (!preservedTags.includes(tag) || (hasSlash && popResult !== tag)) return match;
    if (hasSlash && !popResult) throw new Error(`[${tag}] not matched: unexpected close tag`);
    if (hasSlash) return `</${tag}>`;
    tagStack.push(tag);
    return `<${tag}>`;
  });
}

export function matchTitlePattern(title: string): { index: number; pattern: RegExp; match: RegExpMatchArray } | undefined {
  const input = "\r\n" + title + "\r\n";
  for (let i = 0; i < chapterPatterns.length; i++) {
    const pattern = chapterPatterns[i];
    pattern.lastIndex = 0;
    const match = input.match(pattern);
    if (match) {
      pattern.lastIndex = 0;
      return { index: i + 1, pattern, match: pattern.exec(input)! };
    }
  }
  return undefined;
}

export async function txtToEpub(
  data: string,
  input: string,
  output: string,
  options: TxtToEpubOptions = {},
): Promise<boolean> {
  const reporter = options.reporter ?? ((status, message) => console.log(`[ ${Status[status]} ] ${message}`));
  const sourceName = input ? input.replace(/\.txt$/i, "") : "<inmemory>";
  data = "\r\n" + data.replaceAll(/　+/g, "\r\n");

  if (data.trimStart().startsWith("zComicLib/")) {
    reporter(Status.ERROR, "请使用 downcomic/cbz 工具处理 zComicLib 漫画缓存文件");
  }

  const chapters: EpubContentOptions[] = [];
  const epubOptions: EpubOptions = {
    title: basename(sourceName),
    description: "Generated by denovel v2",
    content: chapters,
    downloadAudioVideoFiles: true,
    lang: "zh-CN",
    logHandler: (level, message) => reporter(Status.DOWNLOADING, `[${level}] ${message}`),
    networkHandler: options.networkHandler,
  };

  let maxMatches = 0;
  let matches: Array<[string, string]> = [];
  let patternMatches: RegExpExecArray[] = [];
  const perPageMax = options.perPageMax ?? DEFAULT_MAX_CHARS_PER_CHAPTER;

  for (const pattern of chapterPatterns) {
    pattern.lastIndex = 0;
    patternMatches = Array.from(data.matchAll(pattern));
    maxMatches = Math.max(maxMatches, patternMatches.length);
    if (patternMatches.length * perPageMax >= data.length) {
      matches = fromPattern(data, patternMatches, options.merge);
      break;
    }
  }

  if (patternMatches.length * perPageMax < data.length) {
    const indentParsed = splitByIndent(data);
    if (indentParsed.length * perPageMax < data.length) {
      reporter(Status.ERROR, `章节数过少，疑似分片错误，请确保章节数 >= 1且遵循 “第x章 ....”`);
      reporter(Status.ERROR, `生成失败 count: ${maxMatches} length: ${data.length} adv: ${data.length / Math.max(maxMatches, 1)}`);
      return false;
    }
    reporter(Status.WARNING, "使用缩进分卷风险较高，请检查输出内容");
    chapters.push(...indentParsed);
  } else {
    let first = true;
    let beforeText = "";
    for (const [title, content] of matches) {
      let chapterText: string;
      try {
        chapterText = processTXTContent(content, options.jpFormat);
      } catch (error) {
        reporter(Status.WARNING, `ParseError: ${(error as Error).message}\ncontent declare tag will be preserved`);
        chapterText = content;
      }
      chapters.push({
        title: maxChars(title.replaceAll(/\s+/g, " "), 60) || (first ? "前言" : ""),
        data: chapterText,
      });
      if (first) beforeText = content;
      first = false;
    }

    const authorMatch = beforeText.match(/作者[：:]\s*(.+?)\s*[\r\n]+/);
    if (authorMatch) epubOptions.author = maxChars(authorMatch[1], 20);
    const descriptionMatch = data.match(/简介[：:]\s*([\s\S]+?)(?=\r?\n{2,}|-{10,})/m);
    if (descriptionMatch) epubOptions.description = removeTags(descriptionMatch[1].trim());
    const coverMatch = beforeText.match(/(?:^|\s)封面[：:]\s*(\S+)/);
    if (coverMatch) {
      epubOptions.cover = coverMatch[1];
    } else {
      const imageMatch = beforeText.match(/https?:\/\/[^\s"'<>]+\.(jpe?g|png|gif|webp)/i);
      if (imageMatch) epubOptions.cover = imageMatch[0];
    }
  }

  reporter(Status.CONVERTING, `生成 EPUB 文件: ${output}${options.jpFormat ? " using jp format" : ""}...`);
  await generateEpub(epubOptions, output);
  reporter(Status.DONE, `生成成功: ${output}`);
  return true;
}
