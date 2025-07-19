import archiver from "npm:archiver";
import { remove as diacritics } from "npm:diacritics";
import { renderFile } from "npm:ejs";
import { encodeXML } from "npm:entities";
import { Element } from "npm:hast";
import { imageSize } from "npm:image-size";
import mime from "npm:mime";
import rehypeParse from "npm:rehype-parse";
import rehypeStringify from "npm:rehype-stringify";
import { Plugin, unified } from "npm:unified";
import { visit } from "npm:unist-util-visit";
import uslug from "npm:uslug";
import { promisify } from "npm:util";
import { createWriteStream } from "node:fs";
import { existsSync, fetch2 } from "./main.ts";
import { exists } from "./main.ts";
import { basename, dirname, resolve } from "jsr:@std/path@^1.0.8";

function getExtensionFromDataUrl(dataUrl: string) {
    // data:image/jpeg;base64,...
    const res = dataUrl.match(/^data:[a-z]+\/([a-z]+);/);
    if(!res) return null;
    return res[1];
}

// Allowed HTML attributes & tags
export const defaultAllowedAttributes = [
    "content",
    "alt",
    "id",
    "title",
    "src",
    "href",
    "about",
    "accesskey",
    "aria-activedescendant",
    "aria-atomic",
    "aria-autocomplete",
    "aria-busy",
    "aria-checked",
    "aria-controls",
    "aria-describedat",
    "aria-describedby",
    "aria-disabled",
    "aria-dropeffect",
    "aria-expanded",
    "aria-flowto",
    "aria-grabbed",
    "aria-haspopup",
    "aria-hidden",
    "aria-invalid",
    "aria-label",
    "aria-labelledby",
    "aria-level",
    "aria-live",
    "aria-multiline",
    "aria-multiselectable",
    "aria-orientation",
    "aria-owns",
    "aria-posinset",
    "aria-pressed",
    "aria-readonly",
    "aria-relevant",
    "aria-required",
    "aria-selected",
    "aria-setsize",
    "aria-sort",
    "aria-valuemax",
    "aria-valuemin",
    "aria-valuenow",
    "aria-valuetext",
    "className",
    "content",
    "contenteditable",
    "contextmenu",
    "controls",
    "datatype",
    "dir",
    "draggable",
    "dropzone",
    "hidden",
    "hreflang",
    "id",
    "inlist",
    "itemid",
    "itemref",
    "itemscope",
    "itemtype",
    "lang",
    "media",
    "ns1:type",
    "ns2:alphabet",
    "ns2:ph",
    "onabort",
    "onblur",
    "oncanplay",
    "oncanplaythrough",
    "onchange",
    "onclick",
    "oncontextmenu",
    "ondblclick",
    "ondrag",
    "ondragend",
    "ondragenter",
    "ondragleave",
    "ondragover",
    "ondragstart",
    "ondrop",
    "ondurationchange",
    "onemptied",
    "onended",
    "onerror",
    "onfocus",
    "oninput",
    "oninvalid",
    "onkeydown",
    "onkeypress",
    "onkeyup",
    "onload",
    "onloadeddata",
    "onloadedmetadata",
    "onloadstart",
    "onmousedown",
    "onmousemove",
    "onmouseout",
    "onmouseover",
    "onmouseup",
    "onmousewheel",
    "onpause",
    "onplay",
    "onplaying",
    "onprogress",
    "onratechange",
    "onreadystatechange",
    "onreset",
    "onscroll",
    "onseeked",
    "onseeking",
    "onselect",
    "onshow",
    "onstalled",
    "onsubmit",
    "onsuspend",
    "ontimeupdate",
    "onvolumechange",
    "onwaiting",
    "prefix",
    "property",
    "rel",
    "resource",
    "rev",
    "role",
    "spellcheck",
    "style",
    "tabindex",
    "target",
    "title",
    "type",
    "typeof",
    "vocab",
    "xml:base",
    "xml:lang",
    "xml:space",
    "colspan",
    "rowspan",
    "epub:type",
    "epub:prefix",
];
export const defaultAllowedXhtml11Tags = [
    "div",
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "dl",
    "dt",
    "dd",
    "address",
    "hr",
    "pre",
    "blockquote",
    "center",
    "ins",
    "del",
    "a",
    "span",
    "bdo",
    "br",
    "em",
    "strong",
    "dfn",
    "code",
    "samp",
    "kbd",
    "bar",
    "cite",
    "abbr",
    "acronym",
    "q",
    "sub",
    "sup",
    "tt",
    "i",
    "b",
    "big",
    "small",
    "u",
    "s",
    "strike",
    "basefont",
    "font",
    "object",
    "param",
    "img",
    "table",
    "caption",
    "colgroup",
    "col",
    "thead",
    "tfoot",
    "tbody",
    "tr",
    "th",
    "td",
    "embed",
    "applet",
    "iframe",
    "img",
    "map",
    "noscript",
    "ns:svg",
    "object",
    "script",
    "table",
    "tt",
    "var",
];

// UUID generation
function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}

// Current directory
const __dirname = import.meta.dirname!;

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
    tempDir?: string;
    allowedAttributes?: string[];
    allowedXhtml11Tags?: string[];
    networkHandler?: typeof fetch2;
}

interface EpubContent {
    id: string;
    href: string;
    title: string;
    data: string;
    url: string | null;
    author: Array<string>;
    filePath: string;
    templatePath: string;
    excludeFromToc: boolean;
    beforeToc: boolean;
    isCover: boolean;
}

interface EpubMedia {
    id: string;
    url: string;
    dir: string;
    mediaType: string;
    extension: string;
    isCoverImage?: boolean;
}

export class EPub {
    uuid: string;
    title: string;
    description: string;
    cover: string | null;
    useFirstImageAsCover: boolean;
    downloadAudioVideoFiles: boolean;
    coverMediaType: string | null;
    coverExtension: string | null;
    coverDimensions = {
        width: 0,
        height: 0,
    };
    publisher: string;
    author: Array<string>;
    tocTitle: string;
    appendChapterTitles: boolean;
    showToC: boolean;
    date: string;
    lang: string;
    css: string | null;
    fonts: Array<string>;
    content: Array<EpubContent>;
    images: Array<EpubMedia>;
    audioVideo: Array<EpubMedia>;
    customOpfTemplatePath: string | null;
    customNcxTocTemplatePath: string | null;
    customHtmlCoverTemplatePath: string | null;
    customHtmlTocTemplatePath: string | null;
    version: number;
    userAgent: string;
    verbose: boolean;
    tempDir: string;
    tempEpubDir: string;
    output: string;
    allowedAttributes: string[];
    allowedXhtml11Tags: string[];
    coverMetaContent: string | null;
    startOfContentHref: string;
    networkHandler: typeof fetch2;

    constructor(options: EpubOptions, output: string) {
        // File ID
        this.uuid = uuid();

        // Required options
        this.title = options.title;
        this.description = options.description;
        this.output = output;

        // Options with defaults
        this.cover = options.cover ?? null;
        this.useFirstImageAsCover = options.useFirstImageAsCover ?? false;
        this.publisher = options.publisher ?? "anonymous";
        this.author = options.author
            ? typeof options.author === "string"
                ? [options.author]
                : options.author
            : ["anonymous"];
        if (this.author.length === 0) {
            this.author = ["anonymous"];
        }
        this.tocTitle = options.tocTitle ?? "目录";
        this.appendChapterTitles = options.appendChapterTitles ?? true;
        this.showToC = options.hideToC !== true;
        this.date = options.date ?? new Date().toISOString();
        this.lang = options.lang ?? "en";
        this.css = options.css ?? null;
        this.fonts = options.fonts ?? [];
        this.customOpfTemplatePath = options.customOpfTemplatePath ?? null;
        this.customNcxTocTemplatePath = options.customNcxTocTemplatePath ?? null;
        this.customHtmlTocTemplatePath = options.customHtmlTocTemplatePath ?? null;
        this.customHtmlCoverTemplatePath = options.customHtmlCoverTemplatePath ?? null;
        this.version = options.version ?? 3;
        this.downloadAudioVideoFiles = this.version !== 2 ? (options.downloadAudioVideoFiles ?? false) : false; // Disable audio/video downloads for EPUB 2
        this.userAgent =
            options.userAgent ??
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.105 Safari/537.36";
        this.verbose = options.verbose ?? false;
        this.allowedAttributes = options.allowedAttributes ?? defaultAllowedAttributes;
        this.allowedXhtml11Tags = options.allowedXhtml11Tags ?? defaultAllowedXhtml11Tags;

        // Temporary folder for work
        this.tempDir = options.tempDir ?? resolve(__dirname, "./tempDir/");
        this.tempEpubDir = resolve(this.tempDir, this.uuid);
        this.networkHandler = options.networkHandler ?? fetch2;

        // Check the cover image
        if (this.cover !== null) {
            this.coverMediaType = mime.getType(this.cover);
            if (this.coverMediaType === null) {
                throw new Error(`The cover image can't be processed : ${this.cover}`);
            }
            this.coverExtension = mime.getExtension(this.coverMediaType);
            if (this.coverExtension === null) {
                throw new Error(`The cover image can't be processed : ${this.cover}`);
            }
        } else {
            this.coverMediaType = null;
            this.coverExtension = null;
        }

        const loadHtml = (content: string, plugins: Plugin[]) =>
            unified()
                .use(rehypeParse, { fragment: true })
                .use(plugins)
                // Voids: [] is required for epub generation, and causes little/no harm for non-epub usage
                .use(rehypeStringify, { allowDangerousHtml: true, voids: [], collapseBooleanAttributes: false })
                .processSync(content)
                .toString();

        this.images = [];
        this.audioVideo = [];
        this.content = [];

        // Insert cover in content
        if (this.cover) {
            const templatePath =
                this.customHtmlCoverTemplatePath || resolve(__dirname, `./templates/epub${this.version}/cover.xhtml.ejs`);
            try {
                Deno.statSync(templatePath);
            }catch{
                throw new Error("Could not resolve path to cover template HTML.");
            }

            this.content.push({
                id: `item_${this.content.length}`,
                href: "cover.xhtml",
                title: "cover",
                data: "",
                url: null,
                author: [],
                filePath: resolve(this.tempEpubDir, `./OEBPS/cover.xhtml`),
                templatePath,
                excludeFromToc: true,
                beforeToc: true,
                isCover: true,
            });
        }

        // Parse contents & save media
        const contentTemplatePath = resolve(__dirname, "./templates/content.xhtml.ejs");
        const contentOffset = this.content.length;
        this.content.push(
            ...options.content.map<EpubContent>((content, i) => {
                const index = contentOffset + i;

                // Get the content URL & path
                let href, filePath;
                if (content.filename === undefined) {
                    const titleSlug = uslug(diacritics(content.title || "no title"));
                    href = `${index}_${titleSlug}.xhtml`;
                    filePath = resolve(this.tempEpubDir, `./OEBPS/${index}_${titleSlug}.xhtml`);
                } else {
                    href = content.filename.match(/\.xhtml$/) ? content.filename : `${content.filename}.xhtml`;
                    if (content.filename.match(/\.xhtml$/)) {
                        filePath = resolve(this.tempEpubDir, `./OEBPS/${content.filename}`);
                    } else {
                        filePath = resolve(this.tempEpubDir, `./OEBPS/${content.filename}.xhtml`);
                    }
                }

                // Content ID & directory
                const id = `item_${index}`;
                const dir = dirname(filePath);

                // Parse the content
                const html = loadHtml(content.data, [
                    () => (tree) => {
                        visit(tree, "element", (node: Element) => {
                            this.validateElement(index, node);
                        });
                    },
                    () => (tree) => {
                        visit(tree, "element", (node: Element) => {
                            if (["img", "input"].includes(node.tagName)) {
                                this.processMediaTag(index, dir, node, this.images, "images");
                            } else if (this.downloadAudioVideoFiles && ["audio", "video"].includes(node.tagName)) {
                                this.processMediaTag(index, dir, node, this.audioVideo, "audiovideo");
                            }
                        });
                    },
                ]);

                // Return the EpubContent
                return {
                    id,
                    href,
                    title: content.title,
                    data: html,
                    url: content.url ?? null,
                    author: content.author ? (typeof content.author === "string" ? [content.author] : content.author) : [],
                    filePath,
                    templatePath: contentTemplatePath,
                    excludeFromToc: content.excludeFromToc === true, // Default to false
                    beforeToc: content.beforeToc === true, // Default to false
                    isCover: false,
                };
            })
        );

        // Prepare the cover meta
        if (this.cover) {
            this.coverMetaContent = "image_cover";
        } else {
            // Check if we can use the first image as a cover
            if (this.useFirstImageAsCover && this.images.length > 0) {
                this.coverMetaContent = "image_0";
                this.images[0].isCoverImage = true; // Flag the image as a cover
            } else {
                this.coverMetaContent = null;
            }
        }

        // Get the link to the start of content
        const firstContentInToc = this.content.find((el) => !el.excludeFromToc);
        if (firstContentInToc === undefined) {
            throw new Error("At least one element have to be included in the ToC!");
        }
        this.startOfContentHref = firstContentInToc.href;
    }

    private validateElement(contentIndex: number, node: Element): void {
        const attrs = node.properties!;
        if (["img", "br", "hr"].includes(node.tagName)) {
            if (node.tagName === "img") {
                node.properties!.alt = node.properties?.alt || "image-placeholder";
            }
        }

        for (const k of Object.keys(attrs)) {
            if (this.allowedAttributes.includes(k)) {
                if (k === "type") {
                    if (attrs[k] !== "script") {
                        delete node.properties![k];
                    }
                } else if (k === "controls") {
                    if (attrs[k] === true) {
                        node.properties![k] = "Controls";
                    }
                }
            } else {
                delete node.properties![k];
            }
        }

        if (this.version === 2) {
            if (!this.allowedXhtml11Tags.includes(node.tagName)) {
                if (this.verbose) {
                    console.log(
                        `[Warning] (content[${contentIndex}]) ${node.tagName} tag isn't allowed on EPUB 2/XHTML 1.1 DTD.`
                    );
                }
                node.tagName = "div";
            }
        }
    }

    private processMediaTag(
        contentIndex: number,
        dir: string,
        node: Element,
        mediaArray: Array<EpubMedia>,
        subfolder: string
    ): void {
        let url = node.properties!.src as string | null | undefined;
        if (url === undefined || url === null) {
            return;
        }

        if(url.length > 1000) url = url.substring(0, url.indexOf(":"));
        if(url.length > 1000) return;

        let extension, id;
        const media = mediaArray.find((element) => element.url === url);
        if (media) {
            id = media.id;
            extension = media.extension;
        } else {
            id = uuid();
            const mediaType = mime.getType(url.replace(/\?.*/, ""));
            if (mediaType === null) {
                console.warn(
                   `[Media Warn] (content[${contentIndex}]) (subfolder=${subfolder}) The media can't be processed : ${url}`
                );
            }
            // 适配novelpia file结尾文件
            extension = mediaType ? mime.getExtension(mediaType) : 'png';
            if (extension === null) {
                extension = getExtensionFromDataUrl(url);
                if (!extension) {
                    console.error(
                        `[Media Error] (content[${contentIndex}]) (subfolder=${subfolder}) The media can't be processed : ${url}`
                    );
                }
                return;
            }
            mediaArray.push({ id, url, dir, mediaType, extension });
        }
        node.properties!.src = `${subfolder}/${id}.${extension}`;
    }

    async render(): Promise<{ result: string }> {
        // Create directories
        if (!await exists(this.tempDir)) {
            await Deno.mkdir(this.tempDir, { recursive: true });
        }
        await Deno.mkdir(this.tempEpubDir, { recursive: true });
        await Deno.mkdir(resolve(this.tempEpubDir, "./OEBPS"), { recursive: true });

        if (this.verbose) {
            console.log("Downloading Media...");
        }
        await this.downloadAllMedia();

        if (this.verbose) {
            console.log("Making Cover...");
        }
        await this.makeCover();

        if (this.verbose) {
            console.log("Generating Template Files.....");
        }
        await this.generateTemplateFiles();

        if (this.verbose) {
            console.log("Generating Epub Files...");
        }
        await this.generate();

        if (this.verbose) {
            console.log("Done.");
        }
        return { result: "ok" };
    }

    private async generateTemplateFiles() {
        // Create the document's Header
        const docHeader =
            this.version === 2
                ? `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${this.lang}">
`
                : `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${this.lang}">
`;

        // Copy the CSS style
        if (!this.css) {
            this.css = await Deno.readTextFile(resolve(__dirname, "./templates/template.css"));
        }
        await Deno.writeTextFile(resolve(this.tempEpubDir, "./OEBPS/style.css"), this.css);

        // Copy fonts
        if (this.fonts.length) {
            await Deno.mkdir(resolve(this.tempEpubDir, "./OEBPS/fonts"), { recursive: true });
            this.fonts = this.fonts.map((font) => {
                if (!existsSync(font)) {
                    throw new Error(`Custom font not found at ${font}.`);
                }
                const filename = basename(font);
                Deno.copyFileSync(font, resolve(this.tempEpubDir, `./OEBPS/fonts/${filename}`));
                return filename;
            });
        }

        // Write content files
        for (const content of this.content) {
            const result = await renderFile(
                content.templatePath,
                {
                    ...this,
                    ...content,
                    bookTitle: this.title,
                    encodeXML,
                    docHeader,
                },
                {
                    escape: (markup: string) => markup,
                }
            );
            await Deno.writeTextFile(content.filePath, result);
        }

        // write meta-inf/container.xml
        await Deno.mkdir(`${this.tempEpubDir}/META-INF`, { recursive: true });
        await Deno.writeTextFile(
            `${this.tempEpubDir}/META-INF/container.xml`,
            '<?xml version="1.0" encoding="UTF-8" ?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
        );

        if (this.version === 2) {
            // write meta-inf/com.apple.ibooks.display-options.xml [from pedrosanta:xhtml#6]
            await Deno.writeTextFile(
                `${this.tempEpubDir}/META-INF/com.apple.ibooks.display-options.xml`,
                `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<display_options>
  <platform name="*">
    <option name="specified-fonts">true</option>
  </platform>
</display_options>
`
            );
        }

        const opfPath =
            this.customOpfTemplatePath || resolve(__dirname, `./templates/epub${this.version}/content.opf.ejs`);
        if (!await exists(opfPath)) {
            throw new Error("Custom file to OPF template not found.");
        }
        await Deno.writeTextFile(resolve(this.tempEpubDir, "./OEBPS/content.opf"), await renderFile(opfPath, this));

        const ncxTocPath = this.customNcxTocTemplatePath || resolve(__dirname, "./templates/toc.ncx.ejs");
        if (!await exists(ncxTocPath)) {
            throw new Error("Custom file the NCX toc template not found.");
        }
        await Deno.writeTextFile(resolve(this.tempEpubDir, "./OEBPS/toc.ncx"), await renderFile(ncxTocPath, this));

        const htmlTocPath =
            this.customHtmlTocTemplatePath || resolve(__dirname, `./templates/epub${this.version}/toc.xhtml.ejs`);
        if (!await exists(htmlTocPath)) {
            throw new Error("Custom file to HTML toc template not found.");
        }
        await Deno.writeTextFile(resolve(this.tempEpubDir, "./OEBPS/toc.xhtml"), await renderFile(htmlTocPath, this));
    }

    private async makeCover(): Promise<void> {
        if (this.cover === null) {
            return;
        }

        const destPath = resolve(this.tempEpubDir, `./OEBPS/cover.${this.coverExtension}`);

        if (this.cover.slice(0, 4) === "http" || this.cover.slice(0, 2) === "//") {
            try {
                const httpRequest = await this.networkHandler(this.cover, {
                    headers: { "User-Agent": this.userAgent },
                });
                if(!httpRequest.ok || !httpRequest.body)
                    throw new Error("Failed to fetch cover image(status code: " + httpRequest.status + ")");
                await Deno.writeFile(destPath, httpRequest.body);
                console.log('成功下载封面：', this.cover);
            } catch (err) {
                if (true) {
                    console.error(`The cover image can't be processed : ${this.cover}, ${err}`);
                }
                try{
                    await Deno.remove(destPath);
                }catch{}
                return;
            }
        } else {
            await Deno.copyFile(this.cover, destPath);
        }

        if (this.verbose) {
            console.log("[Success] cover image downloaded successfully!");
        }

        const sizeOf = promisify(imageSize);

        // Retrieve image dimensions
        const result = await sizeOf(destPath);
        if (!result || !result.width || !result.height) {
            throw new Error(`Failed to retrieve cover image dimensions for "${destPath}"`);
        }

        this.coverDimensions.width = result.width;
        this.coverDimensions.height = result.height;

        if (this.verbose) {
            console.log(`cover image dimensions: ${this.coverDimensions.width} x ${this.coverDimensions.height}`);
        }
    }

    private async downloadMedia(media: EpubMedia, subfolder: string): Promise<void> {
        const filename = resolve(this.tempEpubDir, `./OEBPS/${subfolder}/${media.id}.${media.extension}`);

        if (media.url.indexOf("file://") === 0) try{
            const auxpath = media.url.substring(7);
            await Deno.copyFile(auxpath, filename);
            return;
        }catch{
            return console.error(`无法处理文件(格式错误?) : ${media.url}`);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (media.url.indexOf("http") === 0 || media.url.indexOf("//") === 0) {
            try {
                const httpRequest = await this.networkHandler(media.url, {
                    headers: { "User-Agent": this.userAgent },
                });
                if(!httpRequest.ok || !httpRequest.body)
                    throw new Error("下载内嵌资源失败(HTTP  " + httpRequest.status + ")");
                await Deno.writeFile(filename, httpRequest.body);
                console.log('成功下载：', media.url);
            } catch (err) {
                if (true) {
                    console.error(`无法处理文件(格式错误?) : ${media.url}, ${err}`);
                }
                return;
            }
        }
    }

    private async downloadAllMedia(): Promise<void> {
        if (this.images.length > 0) {
            await Deno.mkdir(resolve(this.tempEpubDir, "./OEBPS/images"), { recursive: true });
            for (let index = 0; index < this.images.length; index++) {
                await this.downloadMedia(this.images[index], "images");
            }
        }
        if (this.audioVideo.length > 0) {
            await Deno.mkdir(resolve(this.tempEpubDir, "./OEBPS/audiovideo"), { recursive: true });
            for (let index = 0; index < this.audioVideo.length; index++) {
                await this.downloadMedia(this.audioVideo[index], "audiovideo");
            }
        }
    }

    private generate(): Promise<void> {
        // Thanks to Paul Bradley
        // http://www.bradleymedia.org/gzip-markdown-epub/ (404 as of 28.07.2016)
        // Web Archive URL:
        // http://web.archive.org/web/20150521053611/http://www.bradleymedia.org/gzip-markdown-epub
        // or Gist:
        // https://gist.github.com/cyrilis/8d48eef37fbc108869ac32eb3ef97bca

        const cwd = this.tempEpubDir;

        return new Promise((resolve, reject) => {
            const archive = archiver("zip", { zlib: { level: 9 } });
            const output = createWriteStream(this.output);
            if (this.verbose) {
                console.log("Zipping temp dir to", this.output);
            }
            archive.append("application/epub+zip", { store: true, name: "mimetype" });
            archive.directory(`${cwd}/META-INF`, "META-INF");
            archive.directory(`${cwd}/OEBPS`, "OEBPS");
            archive.pipe(output);
            archive.on("end", () => {
                output.end(() => {
                    if (this.verbose) {
                        console.log("Done zipping, clearing temp dir...");
                    }
                    Deno.removeSync(cwd, { recursive: true });
                    resolve();
                });
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            archive.on("error", (err: any) => reject(err));
            archive.finalize();
            console.log('All done with', this.audioVideo.length, 'audio/video files and', this.images.length, 'images.')
        });
    }
}