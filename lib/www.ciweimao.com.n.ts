// import { md5 } from "jsr:@takker/md5";
import { getSetCookies, type Cookie } from "jsr:@std/http/cookie";
import { DOMParser, Text } from "jsr:@b-fuze/deno-dom";
// @ts-ignore npm package
import CryptoJS from "npm:crypto-js";
import { fetch2, NoRetryError, setRawCookie } from "../main.ts";

export default (function(){
    function XOR(strV: string, strPass: string) {
        const intPassLength = strPass.length;
        let re = "";
        for (let i = 0; i < strV.length; i++)
            re += String.fromCharCode(strV.charCodeAt(i) ^ strPass.charCodeAt(i % intPassLength))
        return re
    }
    
    const b64ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    const b64chs = Array.prototype.slice.call(b64ch);

    /**
     * base64编码
     * @param buf 输入
     * @returns 输出
     */
    function base64_decode(buf: string) {
        let str = '';
        let c1, c2, c3, c4;
        let i = 0;
        buf = buf.replace(/[^A-Za-z0-9\+\/\=]/g, '');

        // 确保长度是4的倍数
        while (buf.length % 4 !== 0) {
            buf += '=';
        }

        do {
            c1 = b64chs.indexOf(buf.charAt(i++));
            c2 = b64chs.indexOf(buf.charAt(i++));
            c3 = b64chs.indexOf(buf.charAt(i++));
            c4 = b64chs.indexOf(buf.charAt(i++));

            // 处理每个字节
            str += String.fromCharCode((c1 << 2) | (c2 >> 4));
            if (c3 !== 64) {
                str += String.fromCharCode(((c2 & 15) << 4) | (c3 >> 2));
                if (c4 !== 64) {
                    str += String.fromCharCode(((c3 & 3) << 6) | c4);
                }
            }
        } while (i < buf.length);

        return str;
    }

    function decrypt(g: { content: string; keys: string[]; accessKey: string }){
        var l = {
            content: "",
            keys: [],
            accessKey: ""
        };
        var s = g;
        var n = s.content;
        var r = s.keys;
        var t = s.keys.length;
        var q = s.accessKey;
        var o = q.split("");
        var m = o.length;
        var k = new Array<string>();
        k.push(r[(o[m - 1].charCodeAt(0)) % t]);
        k.push(r[(o[0].charCodeAt(0)) % t]);
        for (i = 0; i < k.length; i++) {
            n = base64_decode(n);
            var p = k[i];
            var j = btoa(n.substring(0, 16));
            var f = btoa(n.substring(16));
            var h = CryptoJS.format.OpenSSL.parse(f);
            const nb = CryptoJS.AES.decrypt(h, CryptoJS.enc.Base64.parse(p), {
                iv: CryptoJS.enc.Base64.parse(j),
                format: CryptoJS.format.OpenSSL
            });
            if (i < k.length - 1) {
                n = nb.toString(CryptoJS.enc.Base64);
                n = base64_decode(n)
            }
        }
        return n;
    }
    
    const API_CHAPINFO = 'https://www.ciweimao.com/chapter/get_book_chapter_detail_info';
    const API_SESSION = 'https://www.ciweimao.com/chapter/ajax_get_session_code';
    async function getSession(chapid: string): Promise<string>{
        const fe = await fetch2(API_SESSION, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://www.ciweimao.com/chapter/' + chapid
            },
            body: `chapter_id=${chapid}`
        });
        const resjson = await fe.json();
        if(resjson.code != 100000 || fe.status !== 200)
            throw new Error('Failed to get session ID' + resjson.rad);
        return resjson.chapter_access_key;
    }
    async function getChapInfo(cid: string, sessionID: string){
        const fe = await fetch2(API_CHAPINFO, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://www.ciweimao.com/chapter/' + cid,
                'Accept': 'application/json, text/javascript, */*; q=0.01'
            },
            body: `chapter_id=${cid}&chapter_access_key=${sessionID}`
        });
        const resjson = await fe.json();
        if(resjson. code != 100000 || fe.status !== 200)
            throw new NoRetryError('Failed to get chapter info' + resjson.tip);
        return decrypt({
            content: resjson.chapter_content,
            keys: resjson.encryt_keys,
            accessKey: sessionID
        });
    }

    let inited = false;
    // 初始化列表和Cookie
    const chaps = {} as Record<string, URL>;
    async function initial(url: string | URL){
        url = url instanceof URL ? url.href : url;
        if(!url.includes('/chapter-list/'))
            throw new Error('请输入章节列表链接，如https://www.ciweimao.com/chapter-list/100431696/book_detail');
        const fe = await fetch2(url);
        if(fe.status !== 200)
            throw new Error('Failed to fetch chapter list');

        // 解析DOM
        const dom = new DOMParser().parseFromString(await fe.text(), 'text/html');
        for(const aTag of dom.querySelectorAll('body > div.container > div > div.book-detail > div.ly-main > div > div.bd > div > div > ul > li > a[href]'))
            if(aTag.innerText && aTag.getAttribute('href')?.includes('/chapter/'))
            chaps[aTag.innerText.trim()] = new URL(aTag.getAttribute('href')!.trim(), url);
    }

    async function getChap(url: string){
        const cid = url.match(/\/chapter\/(\d+)/)?.[1];
        if(!cid)
            throw new Error('Invalid chapter URL');
        const sessionID = await getSession(cid);
        return await getChapInfo(cid, sessionID);
    }
    
    let i = 0;
    return async function __main__(url){
        setRawCookie("www.ciweimao.com", "readPage_visits=1;");
        url = url instanceof URL ? url.href : url;
        if(!inited){
            await initial(url);
            inited = true;
        }
        const title = Object.keys(chaps)[i++];
        const content = await getChap(chaps[title].href);
        return {
            title,
            content,
            next_link: 'internal://next'
        }
    }
} satisfies Callback)