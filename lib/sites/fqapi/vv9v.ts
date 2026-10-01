/**
 * 每分钟300次请求限制
 * TODO
 */

import { fetch2, getSiteCredential, requireSiteCredential, setSiteCredential } from "../../core/mod.ts";

const API = 'https://fq.vv9v.cn/novel/chap?novelId=${.bookid}&chapId=${.id}';

interface TokenData {
    id: string;
    ddl: number;
    iat: number;
    ddlTime: string;
    createTime: string;
    used: number;
    left: number;
    token: string;
}
async function getToken(){
    const cachedToken = await getSiteCredential('fq.vv9v.cn', 'token');
    if (cachedToken){
        const expr = await getSiteCredential('fq.vv9v.cn', 'token_expr');
        if (!expr) return cachedToken;
        const ts = parseInt(expr);
        const now = Date.now();
        if (!Number.isFinite(ts) || now < ts) {
            return cachedToken;
        }
    }

    const tok = await requireSiteCredential(
        'fq.vv9v.cn',
        'temp_token',
        'Set fq.vv9v.cn:token or fq.vv9v.cn:temp_token with denovel credential set.',
    );
    const TOKEN_URL = 'https://fq.vv9v.cn/user/temp?id=a1b2c3d4e5f67890&pw1=%E7%9F%A5%E7%A7%8B&pw2=755947375&pw3=' + tok;
    const res = await fetch2(TOKEN_URL);
    const data = await res.json();
    const token = (data.data as TokenData);
    if (!token) {
        console.log(data);
        throw new Error('token获取失败');
    }
    await setSiteCredential('fq.vv9v.cn', 'token', token.token);
    await setSiteCredential('fq.vv9v.cn', 'token_expr', String(token.ddl));
    return token.token;
}

async function getAndroidId() {
    const id = await getSiteCredential('fq.vv9v.cn', 'android_id');
    if (id) return id;
    const uuid = (Math.floor(Math.random() * 9000000000) + 1000000000).toString(16).substring(16).padStart(16, '0');
    await setSiteCredential('fq.vv9v.cn', 'android_id', uuid);
    return uuid;
}

export async function download(bookid: string, id: string) {
    const res = await fetch2(API.replace('${.bookid}', bookid).replace('${.id}', id), {
        headers: {
            'x-sec-token': await getToken(),
            'x-android-id': await getAndroidId()
        }
    });
    const data = await res.json();
    return data.data.content;
}
