/**
 * https://api.langge.cf/user
 */

import { readline } from "../../exe.ts";
import { fetch2, getSiteCookie, setRawCookie } from "../../main.ts";

const devUUID = 'ea7a2be2-10a6-4d0f-995e-ecc8ef680a7c';
const contentURL = `https://api.langge.cf/content?item_id={{$.item_id}}&source=番茄&device=${devUUID}&tab=小说&version=4.6.29&key={{$.key}}`
const contentsURL = `https://api.langge.cf/content?item_ids={{$.item_ids}}&source=番茄&device=${devUUID}&tab=小说&version=4.6.29&key={{$.key}}`

async function ensureKey() {
    let key = getSiteCookie('langge.cf', 'key');
    if (!key) {
        key = await readline('请输入大灰狼的key（在信息页内复制）:');
        if(!key) console.log('注意：现在大灰狼需要登陆了，否则只有10次免费限额');
        setRawCookie('langge.cf', 'key=' + key);
    }
    return key;
}

/**
 * 
  "code": 0,
  "msg": "",
  "time": 1285,
  "title": "第1章：突如其来的变身",
  "content": ...
 */

export async function download(item_id: string): Promise<string> {
    const key = await ensureKey();
    const url = contentURL.replace('{{$.item_id}}', item_id).replace('{{$.key}}', key);
    const res = await fetch2(url);
    const data = await res.json();
    return data.content;
}

export async function downloadAll(item_ids: string[]): Promise<Record<string, string>> {
    const key = await ensureKey();
    const url = contentsURL.replace('{{$.item_ids}}', item_ids.join(',')).replace('{{$.key}}', key);
    const res = await fetch2(url);
    const data = await res.json();
    return data.contents;
}
