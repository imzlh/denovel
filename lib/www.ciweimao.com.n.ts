import { md5 } from "jsr:@takker/md5";
import { getSetCookies, type Cookie } from "jsr:@std/http/cookie";
import { DOMParser, Text } from "jsr:@b-fuze/deno-dom";


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
        do {
            c1 = b64chs.indexOf(buf.charAt(i++));
            c2 = b64chs.indexOf(buf.charAt(i++));
            c3 = b64chs.indexOf(buf.charAt(i++));
            c4 = b64chs.indexOf(buf.charAt(i++));
            str += String.fromCharCode((c1 << 2) | (c2 >> 4));
            if (c3 != 64) {
                str += String.fromCharCode(((c2 & 15) << 4) | (c3 >> 2));
                if (c4 != 64)
                    str += String.fromCharCode(((c3 & 3) << 6) | c4);
            }
        } while (i < buf.length);
        return str;
    }

    async function import_openssl(encryptedData: string): Promise<string> {
        // 解析 Base64 编码的 OpenSSL 数据
        const parts = encryptedData.split(':');
        if (parts.length !== 3) {
            throw new Error("Invalid OpenSSL format. Expected format: key:iv:encryptedData");
        }
    
        const [base64Key, base64IV, base64EncryptedData] = parts;
    
        // 将 Base64 编码的密钥、IV 和密文解码为 ArrayBuffer
        const keyBuffer = base64_decode(base64Key);
        const ivBuffer = base64_decode(base64IV);
        const encryptedBuffer = base64_decode(base64EncryptedData);
    
        // 导入密钥
        const aesKey = await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-CBC" }, false, ["decrypt"]);
    
        // 解密数据
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: "AES-CBC", iv: new TextEncoder().encode(ivBuffer) },
            aesKey,
            encryptedBuffer
        );
    
        // 将解密结果转换为字符串
        return new TextDecoder().decode(decryptedBuffer);
    }
    
    async function decrypt(encryptedData: { content: string; keys: string[]; accessKey: string }): Promise<string> {
        const { content, keys, accessKey } = encryptedData;

        const keyIndex1 = accessKey[accessKey.length - 1].charCodeAt(0) % keys.length;
        const keyIndex2 = accessKey[0].charCodeAt(0) % keys.length;

        let decryptedContent = content;
        await dec(keys[keyIndex1]);
        await dec(keys[keyIndex2]);

        async function dec(key: string){
            decryptedContent = base64_decode(decryptedContent);
            const prekey = base64_decode(decryptedContent.substring(0, 16)),
                data = decryptedContent.substring(16);

            // CryptoJS.format.OpenSSL.parse
            const data2 =  await import_openssl(data);
            const aesKey = await crypto.subtle.importKey("raw", key, { name: "AES-CBC" }, false, ["decrypt"]);

            decryptedContent = new TextDecoder().decode(
                await crypto.subtle.decrypt(
                    { name: "AES-CBC", iv: new TextEncoder().encode(prekey) },
                    aesKey,
                    data2
                )
            );
        }

        return decryptedContent;
    }
    
    const API_CHAPINFO = 'https://www.ciweimao.com/chapter/get_book_chapter_detail_info';
    const API_SESSION = 'https://www.ciweimao.com/chapter/ajax_get_session_code';
    async function getSession(chapid: string): Promise<string>{
        const fe = await fetch(API_SESSION, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
                'Referer': 'https://www.ciweimao.com/chapter/' + chapid,
                'Cookie': buildCookie()
            },
            body: `chapter_id=${chapid}`
        });
        const resjson = await fe.json();
        if(resjson.code != 100000 || fe.status !== 200)
            throw new Error('Failed to get session ID' + resjson.rad);
        return resjson.chapter_access_key;
    }
    async function getChapInfo(cid: string, sessionID: string){
        const fe = await fetch(API_CHAPINFO, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
                'Referer': 'https://www.ciweimao.com/chapter/' + cid,
                'Cookie': buildCookie()
            },
            body: `chapter_id=${cid}&chapter_access_key=${sessionID}`
        });
        const resjson = await fe.json();
        if(resjson.code != 100000 || fe.status !== 200)
            throw new Error('Failed to get chapter info' + resjson.rad);
        return await decrypt({
            content: resjson.chapter_content,
            keys: resjson.encryt_keys,
            accessKey: sessionID
        });
    }

    let inited = false;
    // 初始化列表和Cookie
    let cookies: Cookie[];
    const chaps = {} as Record<string, URL>;
    const buildCookie = () => cookies.map(c => `${c.name}=${c.value}`).join('; ');
    async function initial(url: string | URL){
        url = url instanceof URL ? url.href : url;
        if(!url.includes('/chapter-list/'))
            throw new Error('Invalid chapter list URL');
        const fe = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
            }
        });
        if(fe.status !== 200)
            throw new Error('Failed to fetch chapter list');

        // 保存Cookie
        cookies = getSetCookies(fe.headers);

        // 解析DOM
        const dom = new DOMParser().parseFromString(await fe.text(), 'text/html');
        for(const aTag of dom.querySelectorAll('div.book-detail div.bd ul > li > a[href]'))
            if(aTag.innerText && aTag.getAttribute('href')?.includes('/chapter/'))
            chaps[aTag.innerText] = new URL(aTag.getAttribute('href')!, url);
    }

    async function getChap(url: string){
        const cid = url.match(/\/chapter\/(\d+)/)?.[1];
        if(!cid)
            throw new Error('Invalid chapter URL');
        const sessionID = await getSession(cid);
        return await getChapInfo(cid, sessionID);
    }
    
    let i = 0;
    return async function(url){
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