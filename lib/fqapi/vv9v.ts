/**
 * 每分钟300次请求限制
 * TODO
 */

import assert from "node:assert";
import { readline } from "../../exe.ts";
import { fetch2, getSiteCookie, setRawCookie } from "../../main.ts";

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
    if (getSiteCookie('fq.vv9v.cn', 'token')){
        const expr = getSiteCookie('fq.vv9v.cn', 'token_expr');
        assert(expr, 'token_expr not found');
        const ts = parseInt(expr);
        const now = Date.now();
        if (now < ts) {
            // 过期了
            setRawCookie('fq.vv9v.cn', `token=`);
            return getToken();
        }
        return getSiteCookie('fq.vv9v.cn', 'token')!;
    }
    const tok = await readline('请输入token。去 https://zq.vv9v.cn/ 找找？');
    const TOKEN_URL = 'https://fq.vv9v.cn/user/temp?id=a1b2c3d4e5f67890&pw1=%E7%9F%A5%E7%A7%8B&pw2=755947375&pw3=' + tok;
    const res = await fetch2(TOKEN_URL);
    const data = await res.json();
    const token = (data.data as TokenData);
    if (!token) {
        console.log(data);
        throw new Error('token获取失败');
    }
    setRawCookie('fq.vv9v.cn', `token=${token.token}`);
    setRawCookie('fq.vv9v.cn', `token_expr=${token.ddl}`);
    return token.token;
}

function getAndroidId() {
    const id = getSiteCookie('fq.vv9v.cn', 'android_id');
    if (id) return id;
    const uuid = (Math.floor(Math.random() * 9000000000) + 1000000000).toString(16).substring(16).padStart(16, '0');
    setRawCookie('fq.vv9v.cn', `android_id=${uuid}`);
    return uuid;
}

const aid = getAndroidId();
export async function download(bookid: string, id: string) {
    const res = await fetch2(API.replace('${.bookid}', bookid).replace('${.id}', id), {
        headers: {
            'x-sec-token': await getToken(),
            'x-android-id': aid
        }
    });
    const data = await res.json();
    return data.data.content;
}