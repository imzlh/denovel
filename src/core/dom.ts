import { DOMParser, Element } from "dom";
import fetch2, { FetchOptions } from "./http.ts";

export interface DocumentOptions extends FetchOptions {
    networkOverride?: typeof fetch2
};

export const WRAP_EL = [
        // 基础换行元素
        'br', 'hr', 'p', 'div',
        
        // 标题类（自带换行属性）
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        
        // 预格式化文本（保留原始换行）
        'pre',
        
        // 以下元素在浏览器中表现为块级，但EPUB支持可能不稳定
        'blockquote', 'figure', 'figcaption',
    ],

    PRESERVE_EL = [
        // 行内文本样式
        'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'mark', 'center',
        
        // 列表容器（实际换行行为由li控制）
        'ul', 'ol', 'dl', 'dt', 'dd',
        
        // 表格单元格
        'td', 'th',
        
        // 特殊文本
        'ruby', 'rt', 'rp', 'sub', 'sup',
        
        // 代码片段（行内）
        'code', 'kbd', 'samp', 'var',
        
        // 语义化行内元素
        'cite', 'q', 'abbr', 'dfn', 'time',

        // 特殊元素
        'a', 'video', 'audio',

        // denovel 特色标签
        'right', 'tcenter'
    ],
    SCALABLE_STYLE = [
        'font-size',
        'font-family',
        'font-weight',
        'font-style',
        'line-height',
        'color',
        'text-align',
        'letter-spacing',
        'word-spacing',
        'text-indent'
    ],
    SPECIAL_CSS = [
        // 格式: [css属性名, 条件/值, 转换后的HTML标签]
        ['font-weight', t => parseInt(t) > 500, 'strong'],  // 加粗
        ['font-style', 'italic', 'em'],                    // 斜体
        ['text-decoration', 'underline', 'u'],             // 下划线
        ['text-decoration', 'line-through', 'del'],        // 删除线
        ['vertical-align', 'super', 'sup'],                // 上标
        ['vertical-align', 'sub', 'sub'],                  // 下标
        ['display', 'block', 'div'],                       // 块级元素
        ['display', 'inline-block', 'span'],               // 行内块
        ['text-align', 'center', 'tcenter'],                // 居中文本
        ['text-align', 'right', 'right']                   // 右对齐文本
    ] as Array<[
        string, 
        string | ((value: string) => boolean), 
        string
    ]>,

    PRESERVE_ATTR_TAGS = [
        ['a', 'href'],
        ['video', 'src'],
        ['audio', 'src']
    ],

    IGNORE_TAGS = [
        'script', 'noscript', 'style',                      // CSS/JS
        'iframe', 'object', 'embed', 'applet', 'canvas',    // embed tags
        'input', 'button', 'form',                          // form tags
        'comment'                                           // denovel 注释    
    ];

const utf8decoder = new TextDecoder('utf-8'),
    parser = new DOMParser();
export default async function getDocument(_url: URL | string, options?: DocumentOptions) {
    const url = new URL(_url);
    const response = await (options?.networkOverride ?? fetch2)(url, {
        
        keepalive: true,
        timeoutSec: 30,
        redirect: 'follow',
        credentials: 'include',
        referrer: url.protocol + '://' + url.host + '/',
        referrerPolicy: 'unsafe-url',
        ...options,
        headers: {  // override headers
            'Accept-Language': "zh-CN,zh;q=0.9",
            'Accept': 'text/html,application/xhtml+xml',
            ...(options?.headers ?? {})
        },
    });
    if (!response.ok && !options?.ignoreStatus){
        console.log(await response.text());
        throw new Error(`Failed to fetch ${url}(status: ${response.status})`);
    }
    const data = new Uint8Array(await response.arrayBuffer());

    // 编码检查
    let charset = 'utf-8';
    if (response.headers.get('Content-Type')?.includes('charset')) {
        charset = response.headers.get('Content-Type')!.match(/charset=(\S+)/)![1];
    } else {
        const utf8_data = utf8decoder.decode(data);
        if (
            /<meta\s+charset="(gb.+)".+>/i.test(utf8_data) ||
            // <meta http-equiv="Content-Type" content="text/html; charset=gbk" />
            /<meta.+content-type.+content=".+charset=(gb.+)".+>/i.test(utf8_data)
        ) charset = (
            utf8_data.match(/<meta.+content-type.+content=".+charset=(gb.+)".+>/i) ||
            utf8_data.match(/<meta\s+charset="(gb.+)".+>/i)
        )![1]
    }

    const doc = parser.parseFromString(
        new TextDecoder(charset).decode(data),
        "text/html"
    );
    Object.defineProperty(doc, 'documentURI', { value: url });
    return doc;
}

export function parseInlineCSS(css: string){
    const rules = css.split(';').map(s => s.trim()).filter(s => s);
    const style: Record<string, string> = {};
    for(const rule of rules){
        const [key, value] = rule.split(':');
        style[key.trim()] = value.trim();
    }
    return style;
}

export function getCSS(el: Element, inherit_style: Record<string, string> = {}){
    const css = el.getAttribute('style');
    const style = {...inherit_style};
    if(css){
        const el_style = parseInlineCSS(css);
        for(const key in el_style){
            style[key] = el_style[key];
        }
    }
    return style;
}

export function cssToTag(css: Record<string, string>){
    for(const [cssname, cond, tag] of SPECIAL_CSS){
        const val = css[cssname];
        if(!val) continue;
        if(typeof cond == 'function' && cond(val)) return tag;
        if(val.toLowerCase() == cond) return tag;
    }
    return 'span';
}

export function processContent(
    ctx?: Element | null | undefined, parentStyle: Record<string, string> = {},
    relativeURL: URL = new URL('file:///')
) {
    let text = '';
    if(!ctx) return text;

    for(const node of ctx.childNodes){
        const nodeName = node.nodeName.toLowerCase();
        if(nodeName == 'img'){
            const el = node as Element;
            let src;
            if(el.hasAttribute('src')){
                src = el.getAttribute('src');
            }else if(el.hasAttribute('srcset')){
                src = el.getAttribute('srcset')?.split(/\s*\,\s*/)[0]
            }else for(const attr of el.attributes){
                if(attr.name.toLowerCase().includes('src')){
                    src = attr.value;
                }else if(
                    ['.webp', '.png', '.jpg', '.jpeg'].some(ext => attr.value.endsWith(ext)) ||
                    attr.value.startsWith('http')
                ) {
                    src = attr.value;
                }
            }

            if(src){
                text += `\r\n\r\n[img=${el.getAttribute('width') || 0},${el.getAttribute('height') || 0}]${el.getAttribute('src')}[/img]\r\n\r\n`;
            }else{
                console.warn('[warn] 空图片:', el.outerHTML);
            }
        }else if(nodeName == 'a'){
            const el = node as Element;
            if(el.hasAttribute('href')){
                let href = new URL(el.getAttribute('href')!, relativeURL).href;
                if(href.startsWith('/') || /^https?:\/\//.test(href)){
                    href = href.replaceAll(']', '&#93;');
                    text += `[link=${href}]${processContent(el, parentStyle, relativeURL)}[/link]`;
                }else{
                    text += processContent(el, parentStyle, relativeURL);
                }
            }else{
                text += processContent(el, parentStyle, relativeURL);
            }
        }else if(node.nodeType == node.TEXT_NODE){
            text += ' ' + node.textContent.replaceAll(/[\s^\r\n]+/g, ' ');
        }else if(node.nodeType == node.ELEMENT_NODE){
            const tag = [] as string[];
            const rtag = (node as Element).tagName.toLowerCase();

            if(IGNORE_TAGS.includes(rtag)) continue;
            if(PRESERVE_EL.includes(rtag)) tag.push(rtag);
            const style = getCSS(node as Element, parentStyle);
            const outertag = cssToTag(style);
            if(outertag!= 'span' && outertag != rtag) tag.push(outertag);

            let wrap = WRAP_EL.includes(rtag);
            for(let i = 0; i < tag.length; i ++){
                if(WRAP_EL.includes(tag[i])){
                    console.log('wrap: tag=' , tag, 'outertag=', outertag, 'wrap=', wrap);
                    tag.splice(i, 1);
                    wrap = true;
                }
            }

            const inner = processContent(node as Element, style, relativeURL);
            if(!inner.trim()){
                if(wrap) text += '\r\n';
                continue;   // skip tags
            }

            const tags2 = Array.from(new Set(tag).values());
            if(tag.length) text += tags2.map(t => `[${t}]`).join('');
            text += inner;
            if(tag.length) text += tags2.map(t => `[/${t}]`).reverse().join('');

            // 模拟display: block
            if(wrap) text += '\r\n';
            // if(text[0] != '\r' && text[0] != '\n'){
            //     text = '\r\n' + text;
            // }
        }
    }

    return text.replaceAll(/(?:\r\n){3,}/g, '\r\n\r\n');
}