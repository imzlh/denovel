/**
 * 多CDN的晴天书原
 */

import assert from "node:assert";
import { fetch2, getDocument, requireSiteCredential } from "../../core/mod.ts";

interface Node {
    url: string;
    name: string;
    location: string;
}

let serversPromise: Promise<Node[]> | undefined;

const VERSION = '4.12.3';   // todo: 自动获取版本号

async function ensureKey() {
    return await requireSiteCredential(
        'gyks.cf',
        'qtoken',
        'Set it with denovel credential set gyks.cf qtoken <value>.',
    );
}

async function getServers(): Promise<Node[]> {
    serversPromise ??= (async () => {
        const doc = (await getDocument('http://vip.gyks.cf'))
            .getElementsByTagName('script').find(el => el.innerHTML.includes('// 服务器列表'));
        assert(doc, '服务器列表获取失败');
        const srvstr = doc.innerHTML.match(/const\s+servers\s+=\s+\[([\w\W]+?)\]/)?.[1];
        assert(srvstr, '服务器列表解析失败');
        return (new Function(`return [${srvstr}]`)() as Node[])
            .filter(node => !node.name.includes('轻阅读'));
    })();
    return await serversPromise;
}

export async function download(id: string) {
    /**
     * {
    "data": {
        "content": 
     */
    let res;
    const servers = [...await getServers()];
    if (!servers.length) throw new Error('没有可用的晴天书源节点');
    let nodeid = Math.floor(Math.random() * servers.length);
    while(!res || res.bodyUsed) try{
        const key = await ensureKey();
        const node = servers[nodeid];
        console.debug(`下载 ${id} 资源，使用节点 ${node.name} (${node.location})`);
        res = await fetch2(`${node.url}/content`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'cookie': `qttoken=${key}; deviceId=a1b2c3d4e5f67890;`
            },
            body: JSON.stringify({
                item_id: id,                        // 章节ID
                source: "番茄",                     // 来源标识
                tab: "小说",                        // 类型标识
                version: VERSION,                   // 版本号
                variable: "eyJjdXN0b20iOiIifQ=="    // 加密参数
            }),
            ignoreStatus: true
        });
        if (res.status != 200) throw new Error(`节点 ${node.name} 下载失败，状态码 ${res.status}`);
    }catch(e){
        console.log(`节点 ${servers[nodeid].name} 下载失败，${e}`)
        servers.splice(nodeid, 1);
        if (!servers.length) throw new Error('所有节点下载失败');
        nodeid = Math.floor(Math.random() * servers.length);
        res = undefined
    }

    const data = await res.json();
    assert(data.code == 0, data.msg);
    const resstr = data.content as string;
    // 去除广告
    return resstr.substring(0, resstr.lastIndexOf('本书源属于'));
}
