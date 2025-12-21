/**
 * 书山聚合API章节解密
 * 免费用户每天可阅读200章节，需配置密钥使用
 * deepseek辅助
 */

import { base64 } from "jsr:@hexagon/base64";
import { inflate } from "https://deno.land/x/compress/zlib/mod.ts";
import { getSiteCookie, setRawCookie, NoRetryError, fetch2, removeIllegalPath } from "../../main.ts";

const BASE_URL = "https://search.shusan.icu";
const API = `${BASE_URL}/chapter?cid={{$.cid}}&source={{$.source}}&device={{$.device}}&book_id={{$.book_id}}&item_id={{$.item_id}}&key={{$.key}}&h=10`;

let inited = false;

/**
 * 解密base64+gzip压缩的内容
 * @param encryptedContent base64编码的gzip压缩内容
 * @returns 解密后的文本
 */
async function decryptContent(encryptedContent: string): Promise<string> {
    // 1. Base64解码
    const bytes = base64.toArrayBuffer(encryptedContent);

    // // 2. GZIP解压
    Deno.writeFileSync("encrypted.bin", new Uint8Array(bytes));
    try {
        // 使用DecompressionStream API
        const data = inflate(new Uint8Array(bytes));
        return new TextDecoder("utf-8").decode(data);
    } catch (gzipError) {
        const data = inflate(new Uint8Array(bytes), { raw: true });
        return new TextDecoder("utf-8").decode(data);
    }
}

/**
 * 下载章节内容
 * @param params 章节参数对象
 * @returns 解密后的章节内容
 */
export async function download(item_id: string, book_id: string): Promise<string> {
    if (!inited) {
        console.log('书山聚合源：每天可免费阅读200章节，赞助后可下载书籍');

        // 检查密钥
        if (!getSiteCookie("shusan.icu", "key")) {
            const key = prompt("请输入书山聚合的密钥（前往 search.shusan.icu/key 获取）:");
            if (key) {
                setRawCookie("shusan.icu", "key=" + key);
            } else {
                throw new Error("书山聚合密钥未设置");
            }
        }
        inited = true;
    }

    const key = getSiteCookie("shusan.icu", "key");
    if (!key) {
        throw new Error("书山聚合密钥未设置");
    }

    // 构建URL
    const encodedKey = btoa(key);
    const url = API
        .replace('{{$.cid}}', '')
        .replace('{{$.source}}', '番茄小说')
        .replace('{{$.device}}', 'a1b2c3d4e5f67890')
        .replace('{{$.book_id}}', book_id)
        .replace('{{$.item_id}}', item_id)
        .replace('{{$.key}}', encodedKey);

    console.log(`请求章节: ${url}`);

    try {
        const response = await fetch2(url, {
            headers: {
                // "X-Novel-Token": "SHUSAN_READ_2025",
            },
        });

        const data = await response.json();

        // 检查API响应
        if (data.success === false) {
            throw new NoRetryError(data.message || "API请求失败");
        }

        if (data.code !== 200) {
            console.log(data)
            throw new NoRetryError(`API错误: ${data.message}`);
        }

        if (!data.data?.content) {
            throw new Error("响应缺少content字段");
        }

        const content = data.data.content;

        return await decryptContent(content);
    } catch (error) {
        if (error instanceof NoRetryError) {
            throw error;
        }
        throw new Error(`章节获取失败: ${error}`);
    }
}

if (import.meta.main) {
    console.log('书山可以直接下书哦，超快！');

    // 检查密钥
    if (!getSiteCookie("shusan.icu", "key")) {
        const key = prompt("请输入书山聚合的密钥（前往 search.shusan.icu/key 获取）:");
        if (key) {
            setRawCookie("shusan.icu", "key=" + key);
        } else {
            throw new Error("书山聚合密钥未设置");
        }
    }

    const key = btoa(getSiteCookie("shusan.icu", "key")!);
    const book_id = prompt("请输入书籍ID:")?.trim();
    if (!book_id) throw new Error("书籍ID不能为空");
    const url = BASE_URL + `/down?key=${key}&book_id=` + book_id;
    console.log(`下载地址: ${url}`);
    console.log('服务器正在下载，需要较长时间，请稍候...');

    const res = await fetch2(url);
    const bookname = res.headers.get('Content-Disposition')?.match(/filename="(.*?)"/)?.[1]
        ?? prompt("请输入书籍名称（用于保存文件名）:") ?? removeIllegalPath(new Date().toLocaleString());
    const f = await Deno.open('./downloads/' + bookname + '.txt', { create: true, write: true });
    await res.body?.pipeTo(f.writable);
    console.log('下载完成！');
}