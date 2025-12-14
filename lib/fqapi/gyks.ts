/**
 * 多CDN的晴天书原
 */

import assert from "node:assert";
import { fetch2, getDocument } from "../../main.ts";

interface Node {
    url: string;
    name: string;
    location: string;
}

// 获取服务器列表
const doc = (await getDocument('http://vip.gyks.cf'))
    .getElementsByTagName('script').find(el => el.innerHTML.includes('// 服务器列表'));
assert(doc, '服务器列表获取失败');
const srvstr = doc.innerHTML.match(/const\s+servers\s+=\s+\[([\w\W]+?)\]/)?.[1];
assert(srvstr, '服务器列表解析失败');
const servers = (new Function(`return [${srvstr}]`)() as Node[])
    .filter(node => !node.name.includes('轻阅读'));

const VERSION = '4.12.3';   // todo: 自动获取版本号

export async function download(id: string) {
    /**
     * {
    "data": {
        "content": 
     */
    const node = servers[Math.floor(Math.random() * servers.length)];
    console.debug(`下载 ${id} 资源，使用节点 ${node.name} (${node.location})`);
    const res = await fetch2(`${node.url}/content?item_id=${id}&version=${VERSION}`);
    const data = await res.json();
    assert(data.code == 0, data.msg);
    const resstr = data.content as string;
    // 去除广告
    return resstr.substring(0, resstr.lastIndexOf('本书源属于'));
}