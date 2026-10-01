/**
 * 欢迎使用十安聚合
 */

import { fetch2, getSiteCredential, NoRetryError } from "../../core/mod.ts";

let inited = false;
const ENDPOINT = 'https://qt.shian.xyz',
    ENDPOINT_DOMAIN = new URL(ENDPOINT).hostname;

let CONTENT_URL = ENDPOINT + '/reader?item_id={{$.item_id}}&key={{$.apikey}}';
async function __getApikey(): Promise<string | undefined> {
    const apikey = await getSiteCredential(ENDPOINT_DOMAIN, "apikey");
    if(!inited){
        if(!apikey){
            console.warn('未加载十安 API Key。将使用免密匙版本，日限制100');
            CONTENT_URL = ENDPOINT + '/no_key_reader?item_id={{$.item_id}}';
        }
        inited = true;
    }

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
