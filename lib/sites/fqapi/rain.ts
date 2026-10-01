/**
 * 基于番茄API的阅读书源
 * 免费用户每天可阅读200章节（不可下书），赞助后可下书
 */

import { fetch2, NoRetryError, requireSiteCredential } from "../../core/mod.ts";

const API = 'http://v3.rain.ink/fanqie/?apikey={{$.apikey}}&type=4&itemid={{$.item_id}}';

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
export async function download(item_id: string): Promise<string> {
    if(!inited){
        console.log('不建议使用这个源，只有其他源无法使用时做备选方案');
        inited = true;
    }

    const apikey = await requireSiteCredential(
        "rain.ink",
        "apikey",
        "Set it with denovel credential set rain.ink apikey <value>.",
    );
    const REALAPI = API.replace('{{$.apikey}}', apikey!);
    const url = REALAPI.replace('{{$.item_id}}', item_id);
    return fetch2(url).then(res => res.json()).then(data => {
        if(data.success === false) throw new NoRetryError(data.message);
        return data.data.content
    });
}
