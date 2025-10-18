/**
 * 请不要使用
 * https://qyd.qingtian618.com/assets/json/88273c0496734a67218cdfec86977038.json
 */

import { fetch2 } from "../../main.ts";

const contentURL = `http://113.45.229.86:8543/content?item_id={{$.item_id}}`

/**
 * 
  "code": 0,
  "data": "content": "..."
 */

export function download(item_id: string): Promise<string> {
    const url = contentURL.replace('{{$.item_id}}', item_id);
    return fetch2(url).then(res => res.json()).then(data => data.data.content);
}