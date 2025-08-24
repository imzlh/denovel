import { render } from "npm:ejs";
import { encodeXML } from "npm:entities";
import { imageSize } from "npm:image-size";
import mime from "npm:mime";
import type { Element } from "npm:@types/hast";
import rehypeParse from "npm:rehype-parse";
import rehypeStringify from "npm:rehype-stringify";
import { Plugin, unified } from "npm:unified";
import { visit } from "npm:unist-util-visit";
import { basename } from "jsr:@std/path@^1.0.8";
import { create } from "jsr:@quentinadam/zip";

// 模板文件内容 - 使用 import with type 'text'
import contentEJS from './templates/epub3/content.opf.ejs' with { type: 'text' };
import coverEJS from './templates/epub3/cover.xhtml.ejs' with { type: 'text' };
import tocEJS from './templates/epub3/toc.xhtml.ejs' with { type: 'text' };
import templateCSS from './templates/template.css' with { type: 'text' };
import contentXHTMLEJS from './templates/content.xhtml.ejs' with { type: 'text' };
import tocNCXJS from './templates/toc.ncx.ejs' with { type: 'text' };
import content2EJS from './templates/epub2/content.opf.ejs' with { type: 'text' };
import cover2EJS from './templates/epub2/cover.xhtml.ejs' with { type: 'text' };
import toc2EJS from './templates/epub2/toc.xhtml.ejs' with { type: 'text' };

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
    networkHandler?: typeof fetch;
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
    content: Uint8Array;
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
    networkHandler: typeof fetch,
    logHandler: (type: "info" | "warn" | "error", message: string) => void
): Promise<Uint8Array | null> {
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
            const response = await networkHandler(media.url, {
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
    networkHandler: typeof fetch,
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
            const response = await networkHandler(cover, {
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
    const cover = options.cover ?? null;
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
    const files: Map<string, Uint8Array> = new Map();
    const images: Array<EpubMedia> = [];
    const audioVideo: Array<EpubMedia> = [];
    const content: Array<EpubContent> = [];

    // 处理封面
    let coverInfo: UnPromise<ReturnType<typeof processCover>>;
    try{
        coverInfo = await processCover(cover, userAgent, networkHandler, logHandler, verbose);
    }catch(e){
        logHandler('error', `封面处理失败 : ${cover}, ${e instanceof Error ? e.message : String(e)}`);
        throw e;
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
    if (cover && coverInfo.content) {
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
            title: contentItem.title,
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
    if (cover && coverInfo.content) {
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
    if (cover && coverInfo.content && coverInfo.extension) {
        files.set(`OEBPS/cover.${coverInfo.extension}`, coverInfo.content);
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
        coverDimensions: coverInfo.dimensions,
        coverMediaType: coverInfo.mediaType,
        coverExtension: coverInfo.extension,
        encodeXML,
        bookTitle: title,
        docHeader
    };

    for (const contentItem of content) {
        const result = await render(
            contentXHTMLEJS,
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