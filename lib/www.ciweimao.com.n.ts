// deno-lint-ignore-file no-var no-explicit-any no-inner-declarations
// @ts-ignore npm package
import CryptoJS from "npm:crypto-js";
import { fetch2, getDocument, NoRetryError, setRawCookie, defaultGetInfo, getSiteCookie } from "../main.ts";

export default (async function* (url: URL | string) {
    // jQuery.base64
    var _PADCHAR = "="
        , _ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        , _VERSION = "1.0";
    function _getbyte64(s: string, i: number) {
        var idx = _ALPHA.indexOf(s.charAt(i));
        if (idx === -1) {
            throw "Cannot decode base64"
        }
        return idx
    }
    function _decode(s: string) {
        var pads = 0, i, b10, imax = s.length, x = [];
        s = String(s);
        if (imax === 0) {
            return s
        }
        if (imax % 4 !== 0) {
            throw "Cannot decode base64"
        }
        if (s.charAt(imax - 1) === _PADCHAR) {
            pads = 1;
            if (s.charAt(imax - 2) === _PADCHAR) {
                pads = 2
            }
            imax -= 4
        }
        for (i = 0; i < imax; i += 4) {
            b10 = (_getbyte64(s, i) << 18) | (_getbyte64(s, i + 1) << 12) | (_getbyte64(s, i + 2) << 6) | _getbyte64(s, i + 3);
            x.push(String.fromCharCode(b10 >> 16, (b10 >> 8) & 255, b10 & 255))
        }
        switch (pads) {
            case 1:
                b10 = (_getbyte64(s, i) << 18) | (_getbyte64(s, i + 1) << 12) | (_getbyte64(s, i + 2) << 6);
                x.push(String.fromCharCode(b10 >> 16, (b10 >> 8) & 255));
                break;
            case 2:
                b10 = (_getbyte64(s, i) << 18) | (_getbyte64(s, i + 1) << 12);
                x.push(String.fromCharCode(b10 >> 16));
                break
        }
        return x.join("")
    }
    function _getbyte(s: string, i: number) {
        var x = s.charCodeAt(i);
        if (x > 255) {
            throw "INVALID_CHARACTER_ERR: DOM Exception 5"
        }
        return x
    }
    function _encode(s: string) {
        if (arguments.length !== 1) {
            throw "SyntaxError: exactly one argument required"
        }
        s = String(s);
        var i, b10, x = [], imax = s.length - s.length % 3;
        if (s.length === 0) {
            return s
        }
        for (i = 0; i < imax; i += 3) {
            b10 = (_getbyte(s, i) << 16) | (_getbyte(s, i + 1) << 8) | _getbyte(s, i + 2);
            x.push(_ALPHA.charAt(b10 >> 18));
            x.push(_ALPHA.charAt((b10 >> 12) & 63));
            x.push(_ALPHA.charAt((b10 >> 6) & 63));
            x.push(_ALPHA.charAt(b10 & 63))
        }
        switch (s.length - imax) {
            case 1:
                b10 = _getbyte(s, i) << 16;
                x.push(_ALPHA.charAt(b10 >> 18) + _ALPHA.charAt((b10 >> 12) & 63) + _PADCHAR + _PADCHAR);
                break;
            case 2:
                b10 = (_getbyte(s, i) << 16) | (_getbyte(s, i + 1) << 8);
                x.push(_ALPHA.charAt(b10 >> 18) + _ALPHA.charAt((b10 >> 12) & 63) + _ALPHA.charAt((b10 >> 6) & 63) + _PADCHAR);
                break
        }
        return x.join("")
    }

    function decrypt(g: { content: string; keys: string[]; accessKey: string }) {
        var l = {
            content: "",
            keys: [],
            accessKey: ""
        };
        var s = { ...l, ...g };
        var n: any = s.content;
        var r = s.keys;
        var t = s.keys.length;
        var q = s.accessKey;
        var o = q.split("");
        var m = o.length;
        var k = [];
        k.push(r[(o[m - 1].charCodeAt(0)) % t]);
        k.push(r[(o[0].charCodeAt(0)) % t]);
        for (let i = 0; i < k.length; i++) {
            n = _decode(n);
            var p = k[i];
            var j = _encode(n.substring(0, 16));
            var f = _encode(n.substring(16));
            var h = CryptoJS.format.OpenSSL.parse(f);
            n = CryptoJS.AES.decrypt(h, CryptoJS.enc.Base64.parse(p), {
                iv: CryptoJS.enc.Base64.parse(j),
                format: CryptoJS.format.OpenSSL
            });
            if (i < k.length - 1) {
                n = n.toString(CryptoJS.enc.Base64);
                n = _decode(n)
            }
        }
        return n.toString(CryptoJS.enc.Utf8)
    }

    const API_CHAPINFO = 'https://www.ciweimao.com/chapter/get_book_chapter_detail_info';
    const API_SESSION = 'https://www.ciweimao.com/chapter/ajax_get_session_code';
    async function getSession(chapid: string): Promise<string> {
        const fe = await fetch2(API_SESSION, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://www.ciweimao.com',
                'Referer': 'https://www.ciweimao.com/chapter/' + chapid
            },
            body: `chapter_id=${chapid}`,
            referrer: 'https://www.ciweimao.com/chapter/' + chapid,
        });
        const resjson = await fe.json();
        if (resjson.code != 100000 || fe.status !== 200)
            throw new Error('Failed to get session ID' + resjson.rad);
        return resjson.chapter_access_key;
    }
    async function getChapInfo(cid: string, sessionID: string) {
        const fe = await fetch2(API_CHAPINFO, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Origin': 'https://www.ciweimao.com'
            },
            body: `chapter_id=${cid}&chapter_access_key=${sessionID}`,
            referrer: 'https://www.ciweimao.com/chapter/' + cid
        });
        const resjson = await fe.json();
        if (resjson.code != 100000 || fe.status !== 200)
            throw new NoRetryError('Failed to get chapter info' + resjson.tip);
        return decrypt({
            content: resjson.chapter_content,
            keys: resjson.encryt_keys,
            accessKey: sessionID
        });
    }

    async function getChap(url: string) {
        const cid = url.match(/\/chapter\/(\d+)/)?.[1];
        const rpv = parseInt(getSiteCookie('ciweimao.com', 'readPage_visits') ?? '0');
        setRawCookie('ciweimao.com', 'readPage_visits=' + (rpv + 1));
        await fetch2(url);  // get cookie
        if (!cid)
            throw new Error('Invalid chapter URL');
        const sessionID = await getSession(cid);
        return await getChapInfo(cid, sessionID);
    }

    url = url instanceof URL ? url.href : url;
    if (!url.includes('/chapter-list/'))
        throw new Error('\n请输入章节列表链接，如https://www.ciweimao.com/chapter-list/100431696/book_detail');
    const dom = await getDocument(url);

    // 解析DOM
    for (const aTag of dom.querySelectorAll('body > div.container > div > div.book-detail > div.ly-main > div > div.bd > div > div > ul > li > a[href]'))
        if (aTag.innerText && aTag.getAttribute('href')?.includes('/chapter/')) {
            const chapname = aTag.innerText.trim();
            const chapurl = new URL(aTag.getAttribute('href')!.trim(), url);
            let content = await getChap(chapurl.href);
            content = content.replace(/<span[^>]*>([^<]*)<\/span>/g, '');

            yield {
                title: chapname,
                content
            };
        }
} satisfies Callback)

export const getInfo = (enter: URL) => defaultGetInfo(enter, {
    mainPageTitle: 'body > div.container > div > div.book-detail > div.ly-main > div.book-hd.border-box-shadow > div.book-info > h1',
    mainPageFirstChapter: 'body > div.container > div > div.book-detail > div.ly-main > div.book-hd.border-box-shadow > div.book-info > div > a.btn.btn-lg.btn-danger',
    mainPageSummary: 'body > div.container > div > div.book-detail > div.ly-main > div.book-hd.border-box-shadow > div.book-bd.act-tab > div:nth-child(2) > div > div.book-intro-cnt',
    mainPageCover: 'body > div.container > div > div.book-detail > div.ly-main > div.book-hd.border-box-shadow > div.cover.ly-fl > img',
    // https://www.ciweimao.com/book/100223421
    mainPageLike: /https?:\/\/(?:www|wap)\.ciweimao\.com\/book\/(\d+)/
});