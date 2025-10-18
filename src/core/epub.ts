
import { render } from "ejs";
import { encodeXML, escapeText as escape } from "entities";
import { imageSize } from "image-size";
import mime from "mime";
import type { Element } from "npm:@types/hast";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import { Plugin, unified } from "unified";
import { visit } from "unist/visit";
import { basename } from "@std/path";
import { create } from "zip";

import { fromHTML, yieldProxy } from './utils.ts';

// 模板文件内容 - 使用 import with type 'text'
import contentEJS from '../templates/epub3/content.opf.ejs' with { type: 'text' };
import coverEJS from '../templates/epub3/cover.xhtml.ejs' with { type: 'text' };
import tocEJS from '../templates/epub3/toc.xhtml.ejs' with { type: 'text' };
import templateCSS from '../templates/template.css' with { type: 'text' };
import contentXHTMLEJS from '../templates/content.xhtml.ejs' with { type: 'text' };
import tocNCXJS from '../templates/toc.ncx.ejs' with { type: 'text' };
import content2EJS from '../templates/epub2/content.opf.ejs' with { type: 'text' };
import cover2EJS from '../templates/epub2/cover.xhtml.ejs' with { type: 'text' };
import toc2EJS from '../templates/epub2/toc.xhtml.ejs' with { type: 'text' };
import { PRESERVE_EL, WRAP_EL } from "./dom.ts";
import { DownloadLog, Status } from "./novel.ts";
import fetch2 from "./http.ts";

// deno-lint-ignore no-control-regex
const rep = /[\x00-\x1F\x7F-\x9F\u200B-\u200F\uFEFF]/g;
const MAX_CHARS_PER_CHAPTER = 1e4 *5; // 5w字阈值
const MIN_CHARS_PER_CHAPTER = 80;   // 80字最少

const regexp = [
    /[\r\n]+(?:正文\s*)?第\s*[零一二三四五六七八九十百千万亿0-9]+卷\s*[：:]*\s*第\s*[零一二三四五六七八九十百千万亿0-9]+[章节回话集幕]([^\r\n]*)[\r\n]+/gi,
    /[\r\n]+(?:正文\s*)?第\s*[零一二三四五六七八九十百千万亿0-9]+[章节回话集幕]([^\r\n]*)[\r\n]+/gi,
    /[\r\n]+(?:正文\s*)?(?:Vol\.?\s*[0-9IVXLC]+\s*[：:]*\s*)?(?:Chapter|Chapt|Ch|卷)\s*[0-9IVXLC]+([^\r\n]*)[\r\n]+/gi,
    /[\r\n]+(?:正文\s*)?(?:第\s*[零一二三四五六七八九十百千万亿0-9]+卷\s*[：:]*\s*)?(?:序章|前言|楔子|尾声|后记|番外)([^\r\n]*)[\r\n]+/gi,
    /[\r\n]+(?:正文\s*)?(?:第\s*[零一二三四五六七八九十百千万亿0-9]+卷\s*[：:]*\s*)?[零一二三四五六七八九十百千万亿0-9]+(?:\s*、\s*|\s+)([^\r\n]+)[\r\n]+/gi,
    
    /[\r\n]+\s*(?:(?:chapter|part|ep|stage)\.?\s*)\d+\s*[、. ：:~，·～．『]\s*(.*)\s*』?[\r\n]+/gi,
    /[\r\n]+\s*No[、.．]\d+\s*(.+)\s*[\r\n]+/gi,
    /[\r\n]+\s*(?:正文\s*)?\d+＜(.+)＞\s*[\r\n]+/gi,

    /[\r\n]+(?:正文\s*)?(?:第\s*[零一二三四五六七八九十百千万亿0-9]+卷\s*[：:]*\s*)?第\s*[零一二三四五六七八九十百千万亿0-9]+[～~\-－][零一二三四五六七八九十百千万亿0-9]+[章节回话集幕][^\r\n]*[\r\n]+/gi,
    /[\r\n]+\s*(?:正文\s*)?\[?\d+\]?\s*[、. ：:~，．·～]\s*(.+)\s*[\r\n]+/gi,
    /[\r\n]+\s*[\-零一二三四五六七八九十百千万亿0-9序]+[、. ：:~，·．～-]\s*(.+)\s*[\r\n]+/gi,
    /[\r\n]+\s*(?:(?:chapter|part|ep|no)\.?\s*)[零一二三四五六七八九十百千万亿序0-9]+\s*(.+?)\s*[\r\n]+/gi,
    /[\r\n]+\s*[＃§]\s*\d+\s*(.+?)\s*[\r\n]+/gi,
    /[\r\n]+.{0,20}\s*[：:]\s*\d+\s+(.+)\s*[\r\n]+/gi,
    /[\r\n]+(.+)[\r\n]+([=\-─])\2{5,}[\r\n]+/gi,

    /[\r\n]+\s*第\s*[\-零一二三四五六七八九十百千万亿0-9]+卷\s*(?:.+)\s+(.+)\s*[\r\n]+/gi,
    /[\r\n](?:\s+|[\s\S]{1,20})第\s*[\-零一二三四五六七八九十百千万亿0-9]+\s*[章节回话集幕]\s*(.+)\s+/gi,
    /[\r\n]+\s*[\-零一二三四五六七八九十百千万亿序0-9]+\s+(.+)\s*[\r\n]+/gi,
    /[\r\n]\d+(.+)[\r\n]/g,
    /[\r\n]+.{1,10}\s*\d+[、. ：:~，．·～]\s*(.+?)\s*[\r\n]+/gi,
];

// 「宫城，拿这个的下一集给我。」
// 【谢啦。】
type SpecialTag = {
    [key: string]: string[];
};

const specialTag: SpecialTag = {
    'dialogue': ['「', '」'],
    'quote': ['【', '『', '】', '』'],
    'comments': ['(', ')']
};

// 类型定义
export interface EpubContentOptions {
    title: string;
    data: string;
    url?: string;
    author?: Array<string> | string;
    filename?: string;
    excludeFromToc?: boolean;
    beforeToc?: boolean;
}

export interface EpubOptions {
    title: string;
    description: string;
    cover?: string;
    useFirstImageAsCover?: boolean;
    downloadAudioVideoFiles?: boolean;
    publisher?: string;
    author?: Array<string> | string;
    tocTitle?: string;
    appendChapterTitles?: boolean;
    hideToC?: boolean;
    date?: string;
    lang?: string;
    css?: string;
    fonts?: Array<string>;
    content: Array<EpubContentOptions>;
    customOpfTemplatePath?: string;
    customNcxTocTemplatePath?: string;
    customHtmlTocTemplatePath?: string;
    customHtmlCoverTemplatePath?: string;
    version?: number;
    userAgent?: string;
    verbose?: boolean;
    allowedAttributes?: string[];
    allowedXhtml11Tags?: string[];
    networkHandler?: typeof fetch2;
    logHandler?: (type: "info" | "warn" | "error", message: string) => void;
}

interface EpubContent {
    id: string;
    href: string;
    title: string;
    data: string;
    url: string | null;
    author: Array<string>;
    filePath: string;
    templateContent: string;
    excludeFromToc: boolean;
    beforeToc: boolean;
    isCover: boolean;
}

interface EpubMedia {
    id: string;
    url: string;
    mediaType: string;
    extension: string;
    isCoverImage?: boolean;
}

interface FileEntry {
    path: string;
    content: Uint8Array<ArrayBuffer>;
}

type UnPromise<T> = T extends Promise<infer U> ? U : T;

// 默认配置
export const defaultAllowedAttributes = [
    "content", "alt", "id", "title", "src", "href", "about", "accesskey",
    "aria-activedescendant", "aria-atomic", "aria-autocomplete", "aria-busy",
    "aria-checked", "aria-controls", "aria-describedat", "aria-describedby",
    "aria-disabled", "aria-dropeffect", "aria-expanded", "aria-flowto",
    "aria-grabbed", "aria-haspopup", "aria-hidden", "aria-invalid",
    "aria-label", "aria-labelledby", "aria-level", "aria-live",
    "aria-multiline", "aria-multiselectable", "aria-orientation", "aria-owns",
    "aria-posinset", "aria-pressed", "aria-readonly", "aria-relevant",
    "aria-required", "aria-selected", "aria-setsize", "aria-sort",
    "aria-valuemax", "aria-valuemin", "aria-valuenow", "aria-valuetext",
    "className", "contenteditable", "contextmenu", "controls", "datatype",
    "dir", "draggable", "dropzone", "hidden", "hreflang", "inlist",
    "itemid", "itemref", "itemscope", "itemtype", "lang", "media",
    "ns1:type", "ns2:alphabet", "ns2:ph", "prefix", "property", "rel",
    "resource", "rev", "role", "spellcheck", "style", "tabindex",
    "target", "type", "typeof", "vocab", "xml:base", "xml:lang",
    "xml:space", "colspan", "rowspan", "epub:type", "epub:prefix"
];

export const defaultAllowedXhtml11Tags = [
    "div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
    "dl", "dt", "dd", "address", "hr", "pre", "blockquote", "center",
    "ins", "del", "a", "span", "bdo", "br", "em", "strong", "dfn",
    "code", "samp", "kbd", "bar", "cite", "abbr", "acronym", "q",
    "sub", "sup", "tt", "i", "b", "big", "small", "u", "s", "strike",
    "basefont", "font", "object", "param", "img", "table", "caption",
    "colgroup", "col", "thead", "tfoot", "tbody", "tr", "th", "td",
    "embed", "applet", "iframe", "map", "noscript", "ns:svg", "script", "var"
];

// 工具函数
function getExtensionFromDataUrl(dataUrl: string): string | null {
    const res = dataUrl.match(/^data:[a-z]+\/([a-z]+);/);
    return res ? res[1] : null;
}

// async function genSlug(str: string) {
//     // to ascii
//     const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
//     // 减少到8位
//     return Array.from(new Uint8Array(buf)).map(b => b.toString(16)).join('').slice(0, 8);
// }

function validateElement(
    contentIndex: number,
    node: Element,
    version: number,
    allowedAttributes: string[],
    allowedXhtml11Tags: string[],
    verbose: boolean,
    logHandler: (type: "info" | "warn" | "error", message: string) => void
): void {
    const attrs = node.properties!;
    
    if (["img", "br", "hr"].includes(node.tagName)) {
        if (node.tagName === "img") {
            node.properties!.alt = node.properties?.alt || "image-placeholder";
        }
    }

    for (const k of Object.keys(attrs)) {
        if (allowedAttributes.includes(k)) {
            if (k === "type" && attrs[k] === "script") {
                delete node.properties![k];
            } else if (k === "controls" && attrs[k] === true) {
                node.properties![k] = "Controls";
            }
        } else {
            delete node.properties![k];
        }
    }

    if (version === 2) {
        if (!allowedXhtml11Tags.includes(node.tagName)) {
            if (verbose) {
                logHandler('warn', `(content[${contentIndex}]) ${node.tagName} 标签不被 ePUB2 支持，将被替换为 <div>.`);
            }
            node.tagName = "div";
        }
    }
}

function processMediaTag(
    contentIndex: number,
    node: Element,
    mediaArray: Array<EpubMedia>,
    subfolder: string,
    _downloadAudioVideoFiles: boolean,  // reserved
    logHandler: (type: "info" | "warn" | "error", message: string) => void
): void {
    let url = node.properties!.src as string | null | undefined;
    if (url === undefined || url === null) return;

    if (url.length > 1000) {
        url = url.substring(0, url.indexOf(":"));
        if (url.length > 1000) return;
    }

    let extension, id;
    const media = mediaArray.find((element) => element.url === url);
    
    if (media) {
        id = media.id;
        extension = media.extension;
    } else {
        id = crypto.randomUUID();
        const mediaType = mime.getType(url.replace(/\?.*/, ""));
        
        if (mediaType === null) {
            logHandler('warn', `(i=[${contentIndex}]) (subfolder=${subfolder}) 此资源无法自动识别类型 : ${url}`);
        }
        
        extension = mediaType ? mime.getExtension(mediaType) : 'png';
        
        if (extension === null) {
            extension = getExtensionFromDataUrl(url);
            if (!extension) {
                logHandler('error', `(content[${contentIndex}]) (subfolder=${subfolder}) 此资源无法自动识别类型 : ${url}`);
                return;
            }
        }
        
        mediaArray.push({ id, url, mediaType: mediaType as string, extension });
    }
    
    node.properties!.src = `${subfolder}/${id}.${extension}`;
}

async function downloadMedia(
    media: EpubMedia,
    userAgent: string,
    networkHandler: typeof fetch2,
    logHandler: (type: "info" | "warn" | "error", message: string) => void
): Promise<Uint8Array<ArrayBuffer> | null> {
    if (media.url.indexOf("file://") === 0) {
        try {
            const auxpath = media.url.substring(7);
            return await Deno.readFile(auxpath);
        } catch {
            logHandler('error', `无法处理文件(格式错误?) : ${media.url}`);
            return null;
        }
    }

    if (media.url.indexOf("http") === 0 || media.url.indexOf("//") === 0) {
        try {
            const response = await networkHandler(new URL(media.url), {
                headers: { "User-Agent": userAgent },
            });
            
            if (!response.ok) {
                throw new Error("下载内嵌资源失败(HTTP " + response.status + ")");
            }
            
            const arrayBuffer = await response.arrayBuffer();
            logHandler('info', '成功下载：' + media.url);
            return new Uint8Array(arrayBuffer);
        } catch (err) {
            logHandler('error', `无法处理文件(格式错误?) : ${media.url}, ${err}`);
            return null;
        }
    }
    
    return null;
}

async function processCover(
    cover: string | null,
    userAgent: string,
    networkHandler: typeof fetch2,
    logHandler: (type: "info" | "warn" | "error", message: string) => void,
    verbose: boolean
): Promise<{ content: Uint8Array | null, dimensions: { width: number, height: number } | null, mediaType: string | null, extension: string | null }> {
    if (cover === null) {
        return { content: null, dimensions: null, mediaType: null, extension: null };
    }

    // fix: ?x=xx url
    const mediaType = mime.getType(cover.split('?')[0]) ?? "image/jpeg";
    const extension = mediaType ? mime.getExtension(mediaType) : ".jpg";

    let content: Uint8Array;

    if (cover.startsWith('//')) cover = 'http:' + cover;
    if (cover.slice(0, 4) === "http") {
        try {
            const response = await networkHandler(new URL(cover), {
                headers: { "User-Agent": userAgent },
            });
            
            if (!response.ok) {
                throw new Error("下载封面失败( HTTP " + response.status + " )");
            }
            
            const arrayBuffer = await response.arrayBuffer();
            content = new Uint8Array(arrayBuffer);
            logHandler('info', '成功下载封面：' + cover);
        } catch (err) {
            logHandler('error', `封面处理失败 : ${cover}, ${err}`);
            return { content: null, dimensions: null, mediaType, extension };
        }
    } else {
        content = await Deno.readFile(cover);
    }

    if (verbose) {
        logHandler('info', "成功下载封面图片!");
    }

    // 获取图片尺寸
    const result = imageSize(content);
    
    if (!result || !result.width || !result.height) {
        throw new Error(`Failed to retrieve cover image dimensions`);
    }

    const dimensions = { width: result.width, height: result.height };

    if (verbose) {
        logHandler('info', `封面尺寸: ${dimensions.width} x ${dimensions.height}`);
    }

    return { content, dimensions, mediaType, extension };
}

// 主要的导出函数
export async function generateEpub(options: EpubOptions, outputPath: string): Promise<void> {
    // 设置默认值
    const uuid = crypto.randomUUID();
    const title = options.title;
    const description = options.description;
    let cover = options.cover ?? null;
    const useFirstImageAsCover = options.useFirstImageAsCover ?? false;
    const publisher = options.publisher ?? "anonymous";
    const author = options.author
        ? typeof options.author === "string"
            ? [options.author]
            : options.author
        : ["anonymous"];
    const tocTitle = options.tocTitle ?? "目录";
    const appendChapterTitles = options.appendChapterTitles ?? true;
    const showToC = options.hideToC !== true;
    const date = options.date ?? new Date().toISOString();
    const lang = options.lang ?? "en";
    const css = options.css ?? templateCSS;
    const fonts = options.fonts ?? [];
    const version = options.version ?? 3;
    const downloadAudioVideoFiles = version !== 2 ? (options.downloadAudioVideoFiles ?? false) : false;
    const userAgent = options.userAgent ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.105 Safari/537.36";
    const verbose = options.verbose ?? false;
    const allowedAttributes = options.allowedAttributes ?? defaultAllowedAttributes;
    const allowedXhtml11Tags = options.allowedXhtml11Tags ?? defaultAllowedXhtml11Tags;
    const networkHandler = options.networkHandler ?? fetch;
    const logHandler = options.logHandler ?? console.log;

    // 存储所有文件的内存映射
    const files: Map<string, Uint8Array<ArrayBuffer>> = new Map();
    const images: Array<EpubMedia> = [];
    const audioVideo: Array<EpubMedia> = [];
    const content: Array<EpubContent> = [];

    // 处理封面
    let coverInfo: UnPromise<ReturnType<typeof processCover>> | undefined = undefined;
    try{
        coverInfo = await processCover(cover, userAgent, networkHandler, logHandler, verbose);
        // assert(coverInfo.extension && coverInfo.mediaType, "封面处理失败");
    }catch(e){
        logHandler('error', `封面处理失败 : ${cover}, ${e instanceof Error ? e.message : String(e)}`);
        coverInfo = undefined;
        cover = null;
    }
    
    // HTML处理函数
    const loadHtml = (contentData: string, plugins: Plugin[]) =>
        unified()
            .use(rehypeParse, { fragment: true })
            .use(plugins)
            .use(rehypeStringify, { allowDangerousHtml: true, voids: [], collapseBooleanAttributes: false })
            .processSync(contentData)
            .toString();

    // 插入封面内容
    if (cover && coverInfo?.content) {
        const templateContent = version === 3 ? coverEJS : cover2EJS;
        content.push({
            id: `item_${content.length}`,
            href: "cover.xhtml",
            title: "cover",
            data: "",
            url: null,
            author: [],
            filePath: "OEBPS/cover.xhtml",
            templateContent,
            excludeFromToc: true,
            beforeToc: true,
            isCover: true,
        });
    }

    // 处理内容
    const contentOffset = content.length;
    for (let i = 0; i < options.content.length; i++) {
        const contentItem = options.content[i];
        const index = contentOffset + i;
        const indexStr = index.toString().padStart(3, '0');

        // 生成文件名
        let href, filePath;
        if (contentItem.filename === undefined) {
            href = `${indexStr}.xhtml`;
            filePath = `OEBPS/${indexStr}.xhtml`;
        } else {
            href = contentItem.filename.match(/\.xhtml$/) ? contentItem.filename : `${contentItem.filename}.xhtml`;
            filePath = contentItem.filename.match(/\.xhtml$/) 
                ? `OEBPS/${contentItem.filename}` 
                : `OEBPS/${contentItem.filename}.xhtml`;
        }

        const id = `item_${indexStr}`;

        // 处理HTML内容
        const html = loadHtml(contentItem.data, [
            () => tree => {
                visit(tree, "element", (node: Element) => {
                    validateElement(index, node, version, allowedAttributes, allowedXhtml11Tags, verbose, logHandler);
                });
            },
            () => tree => {
                visit(tree, "element", (node: Element) => {
                    if (["img", "input"].includes(node.tagName)) {
                        processMediaTag(index, node, images, "images", downloadAudioVideoFiles, logHandler);
                    } else if (downloadAudioVideoFiles && ["audio", "video"].includes(node.tagName)) {
                        processMediaTag(index, node, audioVideo, "audiovideo", downloadAudioVideoFiles, logHandler);
                    }
                });
            },
        ]);

        content.push({
            id,
            href,
            title: escape(contentItem.title),
            // title: contentItem.title,
            data: html,
            url: contentItem.url ?? null,
            author: contentItem.author ? (typeof contentItem.author === "string" ? [contentItem.author] : contentItem.author) : [],
            filePath,
            templateContent: contentXHTMLEJS,
            excludeFromToc: contentItem.excludeFromToc === true,
            beforeToc: contentItem.beforeToc === true,
            isCover: false,
        });
    }

    // 设置封面元数据
    let coverMetaContent: string | null = null;
    if (cover && coverInfo?.content) {
        coverMetaContent = "image_cover";
    } else if (useFirstImageAsCover && images.length > 0) {
        coverMetaContent = "image_0";
        images[0].isCoverImage = true;
    }

    // 获取内容开始链接
    const firstContentInToc = content.find((el) => !el.excludeFromToc);
    if (firstContentInToc === undefined) {
        throw new Error("没有找到内容，请确保输入内容不为空!");
    }
    const startOfContentHref = firstContentInToc.href;

    if (verbose) {
        logHandler('info', "下载epub内资源 ...");
    }

    // 下载所有媒体文件
    for (const media of images) try{
        const mediaContent = await downloadMedia(media, userAgent, networkHandler, logHandler);
        if (mediaContent) {
            files.set(`OEBPS/images/${media.id}.${media.extension}`, mediaContent);
        }
    }catch(e){
        logHandler('error', `下载图片失败 : ${media.url}, ${e instanceof Error ? e.message : String(e)}`)
    }

    for (const media of audioVideo) try{
        const mediaContent = await downloadMedia(media, userAgent, networkHandler, logHandler);
        if (mediaContent) {
            files.set(`OEBPS/audiovideo/${media.id}.${media.extension}`, mediaContent);
        }
    }catch(e){
        logHandler('error', `下载多媒体文件失败 : ${media.url}, ${e instanceof Error ? e.message : String(e)}`)
    }

    // 添加封面文件
    if (cover && coverInfo?.content && coverInfo?.extension) {
        files.set(`OEBPS/cover.${coverInfo.extension}`, coverInfo.content as Uint8Array<ArrayBuffer>);
    }

    if (verbose) {
        logHandler('info', "生成模板文件.....");
    }

    // 生成文档头部
    const docHeader = version === 2
        ? `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${lang}">
`
        : `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}">
`;

    // 添加CSS文件
    files.set("OEBPS/style.css", new TextEncoder().encode(css));

    // 添加字体文件
    for (const font of fonts) try{
        const fontContent = await Deno.readFile(font);
        const filename = basename(font);
        files.set(`OEBPS/fonts/${filename}`, fontContent);
    }catch(e){
        logHandler('error', `下载字体文件失败 : ${font}, ${e instanceof Error ? e.message : String(e)}`)
    }

    // 渲染内容文件
    const templateData = {
        uuid,
        title,
        description,
        publisher,
        author,
        tocTitle,
        appendChapterTitles,
        showToC,
        date,
        lang,
        fonts: fonts.map(font => basename(font)),
        content,
        images,
        audioVideo,
        version,
        cover,
        coverMetaContent,
        startOfContentHref,
        coverDimensions: coverInfo?.dimensions,
        coverMediaType: coverInfo?.mediaType,
        coverExtension: coverInfo?.extension,
        encodeXML,
        // bookTitle: escape(title),
        bookTitle: title,
        docHeader
    };

    for (const contentItem of content) {
        const result = await render(
            contentItem.templateContent ?? contentXHTMLEJS,
            { ...templateData, ...contentItem },
            { 
                escape: (markup: string) => markup,
                async: true
            }
        );
        files.set(contentItem.filePath, new TextEncoder().encode(result));
    }

    // 生成META-INF文件
    files.set("META-INF/container.xml", new TextEncoder().encode(
        '<?xml version="1.0" encoding="UTF-8" ?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
    ));

    if (version === 2) {
        files.set("META-INF/com.apple.ibooks.display-options.xml", new TextEncoder().encode(
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<display_options>
  <platform name="*">
    <option name="specified-fonts">true</option>
  </platform>
</display_options>
`
        ));
    }

    // 生成OPF文件
    const opfTemplate = version === 3 ? contentEJS : content2EJS;
    const opfResult = await render(opfTemplate, templateData, { 
        escape: (markup: string) => markup,
        async: true
    });
    files.set("OEBPS/content.opf", new TextEncoder().encode(opfResult));

    // 生成NCX文件
    const ncxResult = await render(tocNCXJS, templateData, { 
        escape: (markup: string) => markup,
        async: true
    });
    files.set("OEBPS/toc.ncx", new TextEncoder().encode(ncxResult));

    // 生成HTML TOC文件
    const htmlTocTemplate = version === 3 ? tocEJS : toc2EJS;
    const htmlTocResult = await render(htmlTocTemplate, templateData, { 
        escape: (markup: string) => markup,
        async: true
    });
    files.set("OEBPS/toc.xhtml", new TextEncoder().encode(htmlTocResult));

    if (verbose) {
        logHandler('info', "生成epub文件...");
    }

    // 创建ZIP文件
    const fileEntries: FileEntry[] = [
        { path: "mimetype", content: new TextEncoder().encode("application/epub+zip") }
    ];

    for (const [path, content] of files.entries()) {
        fileEntries.push({ path, content });
    }

    // 使用zip库压缩
    const zipBuffer = await create(fileEntries.map(entry => ({
        name: entry.path,
        data: entry.content
    })));

    // 写入输出文件
    await Deno.writeFile(outputPath, new Uint8Array(zipBuffer));

    logHandler('info', '生成成功！共 ' + audioVideo.length + ' 多媒体文件和 ' + images.length + ' 图片');
    logHandler('info', '输出文件：' + outputPath);
}


function addTags(text: string, sTag = specialTag): string {
    const stack: { tag: string, char: string }[] = [];
    let result = '';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        for (const tag in sTag) {
            if (sTag[tag].includes(char)) {
                if (sTag[tag].indexOf(char) % 2 === 0) {
                    stack.push({ tag, char });
                    result += `<${tag}>${char}`;
                } else {
                    if (stack.length > 0 && stack[stack.length - 1].char === sTag[tag][sTag[tag].indexOf(char) - 1]) {
                        result += `${char}</${stack.pop()?.tag}>`;
                    } else {
                        result += char;
                    }
                }
                continue;
            }
        }

        result += char;
    }

    while (stack.length > 0) {
        result += `</${stack.pop()?.tag}>`;
    }

    return result;
}

function splitByIndent(text: string): { title: string, data: string }[] {
    const result: { title: string, data: string }[] = [];
    let lines = text.split(/\r?\n/);

    // 原函数的备用分割逻辑
    if (lines.length == 0) lines = text.split('\r');
    if (lines.length == 0) lines = text.replaceAll(/\s{2,}/, t => '\n' + t.substring(1)).split('\n');
    if (lines.length == 0) return [{ title: "前言", data: text }];

    let currentTitle: string = "";
    let currentData: string[] = [];
    let pendingTitles: string[] = [];
    let isFirstSection = true;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "") continue; // 跳过空行

        const indent = line.match(/^\s*/)?.[0].length || 0;

        if (indent === 0) {
            // 无缩进行为标题
            if (isFirstSection) {
                pendingTitles.push(trimmed);
            } else {
                pendingTitles.push(trimmed);
            }
        } else {
            // 有缩进行为内容
            if (isFirstSection && pendingTitles.length > 0) {
                currentTitle = pendingTitles.pop() || "";
                if (pendingTitles.length > 0) {
                    currentData.push(...pendingTitles);
                }
                pendingTitles = [];
                isFirstSection = false;
            }

            if (!isFirstSection && pendingTitles.length > 0) {
                if (currentTitle !== "") {
                    result.push({
                        title: currentTitle.slice(0, 50),
                        data: currentData.join('\n')
                    });
                }
                currentTitle = pendingTitles.pop() || "";
                currentData = [];
                pendingTitles = [];
            }

            currentData.push(line);
        }
    }

    // 处理最后的pendingTitles
    if (pendingTitles.length > 0) {
        if (isFirstSection) {
            currentTitle = pendingTitles.pop() || "";
            currentData = pendingTitles;
        } else {
            if (currentTitle !== "") {
                result.push({
                    title: currentTitle.slice(0, 50),
                    data: currentData.join('\n')
                });
            }
            currentTitle = pendingTitles.pop() || "";
            currentData = [];
        }
    }

    // 添加最后一个章节
    if (currentTitle !== "" || currentData.length > 0) {
        result.push({
            title: currentTitle.slice(0, 50),
            data: currentData.join('\n')
        });
    }

    return result;
}

function fromPreg(rawTxt: string, matches: Iterable<RegExpMatchArray>, merge: boolean = false) {
    const result: [string, string][] = [];
    let currentContentStart = 0;
    let pendingTitle = '';
    let pendingContent = '';

    for (const match of matches) {
        const index = match.index ?? -1;
        if (index < 0) continue;

        const title = (match[1] || '').trim();
        const contentEnd = index;

        // 总是累积内容，根据条件决定是否分割
        pendingContent += rawTxt.slice(currentContentStart, contentEnd);
        currentContentStart = index;

        if (!merge || (pendingContent.length >= MIN_CHARS_PER_CHAPTER &&
            pendingContent.length <= MAX_CHARS_PER_CHAPTER)) {
            if (pendingTitle || pendingContent) {
                result.push([pendingTitle, pendingContent]);
            }
            pendingTitle = title;
            pendingContent = '';
        } else {
            pendingContent += title; // 合并标题到内容
        }
    }

    // 处理剩余内容
    pendingContent += rawTxt.slice(currentContentStart);
    if (pendingTitle || pendingContent) {
        result.push([pendingTitle, pendingContent]);
    }

    return result.filter(([t, c]) => t || c); // 过滤空条目
}


function maxC(str: string, max: number) {
    if (str.length > max) {
        return str.slice(0, max - 3) + '...';
    }
    return str;
}

// 移除[a][/a]类tag
const removeTags = (str: string) => str.replaceAll(
    /\[\/?[a-z]+\]/g, ''
);

export function processTXTContent(text: string, jpFormat = false) {
    if(!PRESEL) PRESEL = PRESERVE_EL.concat(WRAP_EL);
    text = encodeContent(text, jpFormat);
    // [img=width,height]url[/img]
    text = text.replaceAll(/\[img\=\d+,\d+\](.+?)\[\/img\]/g, (_, it) => {
        return it ? `<img src="${it.replaceAll('一', '-')}" referrerpolicy="no-referrer" />` : ''
    });
    // [link=url]text[/link]
    text = text.replaceAll(/\[link\=((?:https?\:\/)?\/.+?)\](.*?)\[\/link\]/g, (_, href, text) => {
        // todo: handle no text link: remove or preserve ?
        return href ? `<a href="${href}" target="_blank">${text}</a>` : ''
    });
    // [comment]
    text = text.replaceAll(/\[comment\](.+?)\[\/comment\]/g, (_, it) => '<!-- ' + removeTags(it) + ' -->');
    const tagSt = [] as Array<string>;
    text = text.replaceAll(/\[(\/)?([a-z]{1,10})\]/g, (_, has_slash, tag) => {
        const popRes = has_slash ? tagSt.pop() : undefined;
        if (!PRESEL.includes(tag) || (has_slash && popRes != tag)) return _;
        if (has_slash && !popRes) throw new Error(`[${tag}] not matched: unexpected close tag`);
        if (has_slash) return `</${tag}>`;
        tagSt.push(tag);
        return `<${tag}>`;
    })
    return text;
}

let PRESEL: string[];
/**
 * TXT转换成EPUB
 * @param data 输入的文件内容
 * @param input 输入的文件名
 * @param output 输出位置
 */
export async function* toEpub(data: string, input: string, output: string, option: {
    maxPerPage?: number, merge?: boolean, jpFormat?: boolean, networkHandler?: typeof fetch2
}): AsyncGenerator<DownloadLog, boolean> {
    input = input ? input.replace(/\.txt$/i, '') : '<inmemory>';
    // fix: 前插\r\n以匹配第一章
    data = '\r\n' + data.replaceAll(/　+/g, '\r\n');  // 特殊中文空格，我们认为是换行
    if (!PRESEL) PRESEL = PRESERVE_EL.concat(WRAP_EL);

    // 检查是否是zComicLib?
    if (data.trimStart().startsWith('zComicLib/')) {
        yield {
            status: Status.ERROR,
            message: '请使用comic.ts处理zComicLib漫画缓存文件!'
        };
        return false;
    }

    // 分卷
    const chaps: Array<EpubContentOptions> = [];
    let max: number = 0;

    const options: EpubOptions = {
        title: basename(input),
        description: "Generated by 2epub",
        content: chaps,
        // verbose: true,
        downloadAudioVideoFiles: true,
        lang: "zh-CN",
        networkHandler: option.networkHandler
    };

    let matches: Array<[string, string]> = [];
    let pregmatches: RegExpExecArray[] = [];
    const per_page_max = option.maxPerPage || MAX_CHARS_PER_CHAPTER;
    for (const reg of regexp) {
        pregmatches = Array.from(data.matchAll(reg));
        max = Math.max(max, pregmatches.length);
        // console.debug(`Found ${matches.length} matches for ${reg}`);
        if (pregmatches.length * per_page_max >= data.length) {
            matches = fromPreg(data, pregmatches, option.merge);
            break;
        }
    }
    if (pregmatches.length * per_page_max < data.length) {
        const idParsed = splitByIndent(data);
        if (idParsed.length * per_page_max < data.length) {
            yield {
                status: Status.WARNING,
                message: '生成失败' + 'count: ' + max + ' length: ' + data.length + 'adv: ' + (data.length / max)
            };
            yield {
                status: Status.ERROR,
                message: '章节数过少，疑似分片错误，请确保章节数 >= 1且遵循 “第x章 ....”'
            };
            return false;
        } else {
            yield {
                status: Status.WARNING,
                message: '使用缩进分卷风险很大，请小心删除，检查内容是否有效'
            }
            chaps.push(...idParsed);
        }
    } else {
        // debug
        if (output == undefined) {
            console.log(matches.map(m => m[0]));
            return false;
        }

        let first = true;
        let beforeText = '';
        for (const c of matches) {
            let text: string;
            try{
                text = processTXTContent(c[1], option.jpFormat);
            }catch(e){
                // option.reporter(Status.WARNING, `ParseError: ` + (e as Error).message + '\n' + 'content declare tag will be preserved');
                yield {
                    status: Status.WARNING,
                    message: `解析错误: ` + (e as Error).message + '\n' + '，将原样保留章节内容'
                }
                text = c[1];
            }

            chaps.push({
                title: maxC(c[0].replaceAll(/\s+/g, ' '), 60) || (first ? '前言' : ''),
                data: text,
            });
            if (first) beforeText = c[1];
            first = false;
        }

        const match = beforeText.match(/作者[：:]\s*(.+?)\s*[\r\n]+/);
        if (match) {
            options.author = maxC(match[1], 20);
        }

        const ctxmatch = data.match(/简介[：:]\s*([\s\S]+?)(?=\r?\n{2,}|-{10,})/m);
        if (ctxmatch) {
            options.description = removeTags(ctxmatch[1].trim());
        }

        // image
        const imgmatch = beforeText.match(/(?:^|\s)封面[：:]\s*(\S+)/);
        if (imgmatch) {
            options.cover = imgmatch[1];
        } else {
            const match2 = beforeText.match(/https?:\/\/[^\s"'<>]+\.(jpe?g|png|gif|webp)/i);
            if (match2) {
                options.cover = match2[0];
            }
        }

        yield {
            status: Status.CONVERTING,
            message: `提取信息: 作者=${options.author}, 简介=${options.description}, 封面=${options.cover}, 章节数=${chaps.length}`
        }
    }

    // 生成 epub 文件
    yield {
        status: Status.CONVERTING,
        message: '生成EPUB文件: ' + output + option.jpFormat ? '(JP格式)' : '' + '...'
    };
    try{
        const proxy = yieldProxy<[type: "info" | "warn" | "error", message: string]>();
        options.logHandler = proxy.processor;
        generateEpub(options, output).finally(() => proxy.end());
        for await (const log of proxy.generator) {
            yield {
                status: log[0] === 'info'? Status.CONVERTING : log[0] === 'warn'? Status.WARNING : Status.ERROR,
                message: log[1]
            };
        }
        yield {
            status: Status.DONE,
            message: '生成成功: ' + output
        };
    }catch(e){
        yield {
            status: Status.ERROR,
            message: `生成失败: ${e instanceof Error ? e.message : String(e)}`
        };
    }
    return false;
}

export const encodeContent = (str: string, jpFormat = false) => {
    str = '<p>' + fromHTML(str)
        .replace(/\s*[\r\n]+\s*/g, '</p><p>')
        .replace(rep, '') + '</p>';
    str = str.replaceAll(/\<p\> *\<\/p\>/g, '');

    // 特殊优化 for 日/韩轻小说
    if (jpFormat) {
        str = addTags(str)
    }

    return str;
}