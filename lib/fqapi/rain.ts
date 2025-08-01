/**
 * 基于番茄API的阅读书源
 * 免费用户每天可阅读200章节（不可下书），赞助后可下书
 */

import { getSiteCookie, setRawCookie, NoRetryError, fetch2 } from "../../main.ts";

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
export function download(item_id: string): Promise<string> {
    if(!inited){
        console.log('不建议使用这个源，只有其他源无法使用时做备选方案');
        if(!getSiteCookie("rain.ink", "apikey")){
            const key = prompt("请输入Rain.ink的API Key:");
            if(key){
                setRawCookie("rain.ink", "apikey=" + key);
            }else{
                throw new Error("Rain API Key未设置，请前往v3.rain.ink注册并获取API Key");
            }
        }
        inited = true;
    }

    const apikey = getSiteCookie("rain.ink", "apikey");
    const REALAPI = API.replace('{{$.apikey}}', apikey!);
    const url = REALAPI.replace('{{$.item_id}}', item_id);
    return fetch2(url).then(res => res.json()).then(data => {
        if(data.success === false) throw new NoRetryError(data.message);
        return data.data.content
    });
}