/**
 * https://api.langge.cf/user
 */

const devUUID = 'ea7a2be2-10a6-4d0f-995e-ecc8ef680a7c';
const contentURL = `https://api.langge.cf/content?item_id={{$.item_id}}&source=番茄&device=${devUUID}&tab=小说&version=4.6.29`
const contentsURL = `https://api.langge.cf/content?item_ids={{$.item_ids}}&source=番茄&device=${devUUID}&tab=小说&version=4.6.29`


/**
 * 
  "code": 0,
  "msg": "",
  "time": 1285,
  "title": "第1章：突如其来的变身",
  "content": ...
 */

export function download(item_id: string): Promise<string> {
    const url = contentURL.replace('{{$.item_id}}', item_id);
    return fetch(url).then(res => res.json()).then(data => data.content);
}

export function downloadAll(item_ids: string[]): Promise<Record<string, string>> {
    const url = contentsURL.replace('{{$.item_ids}}', item_ids.join(','));
    return fetch(url).then(res => res.json()).then(data => data.contents);
}
