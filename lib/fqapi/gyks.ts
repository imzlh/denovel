/**
 * 多CDN的晴天书原
 */

import assert from "node:assert";
import { fetch2, getDocument, getSiteCookie, setRawCookie } from "../../main.ts";
import { readline } from '../../exe.ts';

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

async function ensureKey() {
    let key = getSiteCookie('gyks.cf', 'qtoken');
    if (!key) {
        key = await readline('请输入key（在vip.gyks.cf信息页内找个节点复制）:');
        if(!key) console.log('不登录，此节点就是一次性的，我们将尝试下一个源');
        setRawCookie('gyks.cf', 'qtoken=' + key);
    }
    return key;
}

export async function download(id: string) {
    /**
     * {
    "data": {
        "content": 
     */
    let res;
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