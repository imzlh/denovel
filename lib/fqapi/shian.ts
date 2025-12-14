/**
 * 欢迎使用十安聚合
 */

import { DOMParser, Text } from "jsr:@b-fuze/deno-dom";
import { getSiteCookie, setRawCookie, NoRetryError, fetch2 } from "../../main.ts";
import { encodeBase64 } from "jsr:@std/encoding@0.217.0/base64";

let inited = false;
const ENDPOINT = 'https://qt.shian.xyz',
    ENDPOINT_DOMAIN = new URL(ENDPOINT).hostname;

let CONTENT_URL = ENDPOINT + '/reader?item_id={{$.item_id}}&key={{$.apikey}}';
async function __getApikey(): Promise<string> {
    if(!inited){
        if(!getSiteCookie(ENDPOINT_DOMAIN, "apikey")){
            const key = prompt("请输入" + ENDPOINT_DOMAIN + "的API Key:");
            if(key){
                console.log('已加载密匙。如果下载内容提示错误，请手动在配置文件cookie.json中修改');
            }else{
                console.warn('未加载密匙。将使用免密匙版本，日限制100');
                CONTENT_URL = ENDPOINT + '/no_key_reader?item_id={{$.item_id}}';
            }
        }
        inited = true;
    }

    const apikey = getSiteCookie(ENDPOINT_DOMAIN, "apikey")!;
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