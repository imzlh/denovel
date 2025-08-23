/**
 * 基于番茄API的阅读书源
 * 免费用户每天可阅读200章节（不可下书），赞助后可下书
 */

import { DOMParser, Text } from "jsr:@b-fuze/deno-dom";
import { getSiteCookie, setRawCookie, NoRetryError, fetch2 } from "../../main.ts";
import { encodeBase64 } from "jsr:@std/encoding@0.217.0/base64";

/**
 * {
  "code": 0,
  "message": "SUCCESS",
  "data": {
    "code": 0,
    "content": ...
 */
/**
 * {
  "success": false,
  "message": "无效的API密钥"
}
 */
let inited = false;
const ENDPOINT = 'https://my.xo0x.cn/',
    ENDPOINT_DOMAIN = new URL(ENDPOINT).hostname.split('.').slice(-2).join('.'),
    CONTENT_URL = ENDPOINT + '/content.php?item_id={{$.item_id}}&key={{$.apikey}}';
async function __getApikey(): Promise<string> {
    if(!inited){
        if(!getSiteCookie(ENDPOINT_DOMAIN, "apikey")){
            const key = prompt("请输入" + ENDPOINT_DOMAIN + "的API Key:");
            if(key){
                setRawCookie(ENDPOINT_DOMAIN, "apikey=" + key);

                // try
                const url = ENDPOINT + "cx.php",
                    doc = await fetch2(url, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded"
                        },
                        body: "key=" + key
                    }).then(res => res.text())
                        .then(text => new DOMParser().parseFromString(text, "text/html")),
                    errel = doc.querySelector('body > div > div > div.card-body > div.error-message');
                if(errel){
                    throw new Error('登陆失败：' + errel.innerText.trim());
                }
                console.log("登陆成功", doc.querySelector('body > div > div > div.card-body > div.result-card')?.innerText.replaceAll(/[\s^\r\n]+/g, ' '));
            }else{
                throw new Error(ENDPOINT_DOMAIN + " API Key未设置，请前往 " + ENDPOINT + "/key.php 注册并获取API Key");
            }
        }
        inited = true;
    }

    const apikey = encodeBase64(getSiteCookie(ENDPOINT_DOMAIN, "apikey")!);
    return apikey;
}

export async function download(item_id: string): Promise<string> {
    const apikey = await __getApikey();
    const REALAPI = CONTENT_URL.replace('{{$.apikey}}', apikey!);
    const url = REALAPI.replace('{{$.item_id}}', item_id);
    return fetch2(url).then(res => res.json()).then(data => {
        if(data.success === false) throw new NoRetryError(data.message);
        return data.data[0].content
    });
}

export async function downloadAll(item_id: string[]) {
    const apikey = await __getApikey();
    const REALAPI = CONTENT_URL.replace('{{$.apikey}}', apikey!);
    const url = REALAPI.replace('{{$.item_id}}', item_id.join(','));
    return fetch2(url).then(res => res.json()).then(data => {
        if(data.success != true) throw new NoRetryError(data.data.content);
        return Object.fromEntries((data.data as Array<{ item_id: string, content: string }>)
            .map((it, i) => [item_id[i], it.content]));
    });
}