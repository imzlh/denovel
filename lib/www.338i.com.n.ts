import { getDocument } from "../main.ts";

console.log('同学，请尝试Github开源项目爬取番茄小说吧！');
console.log('不建议使用这个文件获取！');

export default (async function* (url: string | URL) {

    // 从HTML提取
    async function getMeta(url: string | URL) {
        const html = await getDocument(url);
        const info = html.getElementsByTagName('script').find(s => s.innerHTML.includes('var'))!.innerHTML;
        // var articleid='4KTRMFqh57pzN1jgIeWpRw==', chapterid='SToW9E+XOEfJGGJeN7Noww==',pid='1';
        const [, aid, cid, pid] = info.match(/var articleid='(.*?)'.+?chapterid='(.*?)'.+?pid='(.*?)'/)!;
        // articleid=4KTRMFqh57pzN1jgIeWpRw%3D%3D&chapterid=SToW9E%2BXOEfJGGJeN7Noww%3D%3D&pid=1
        return {
            fetch_body: `articleid=${encodeURIComponent(aid)}&chapterid=${encodeURIComponent(cid)}&pid=${pid}`,
            title: html.querySelector('#mlfy_main_text > h1')!.textContent!,
            next_link: html.querySelector('#next_url')?.getAttribute('href')!
        };
    }

    async function decryptAES(ciphertext: string, key: string, iv: string): Promise<string> {
        // 将密钥和初始向量转换为字节数组
        const keyBuffer = new TextEncoder().encode(key);
        const ivBuffer = new TextEncoder().encode(iv).subarray(0, 16); // 确保 iv 长度为16字节（128位）

        // 将密钥转换为 CryptoKey 对象
        const cryptoKey = await crypto.subtle.importKey(
            "raw", // 密钥格式
            keyBuffer,   // 密钥字节数组
            { name: "AES-CBC" }, // 算法规范
            false, // 是否可以导出
            ["decrypt"] // 用途
        );

        // 将密文字符串转换为字节数组
        const ciphertextBuffer = Uint8Array.from(ciphertext, c => c.charCodeAt(0));

        // 解密
        const decrypted = await crypto.subtle.decrypt(
            {
                name: "AES-CBC",
                iv: ivBuffer // 初始向量
            },
            cryptoKey, // CryptoKey 对象
            ciphertextBuffer // 要解密的密文
        );

        // 解密后的结果是 ArrayBuffer, 需要转换为字符串
        const decoder = new TextDecoder("utf-8");
        return decoder.decode(decrypted);
    }

    // 获取数据
    async function getData(body: string) {
        const url = `https://www.338i.com/api/reader_js.php`;
        const fe = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body
        })
        if (!fe.ok) throw new Error(`Failed to fetch ${url}: ${fe.status} ${fe.statusText}`);
        const { data, key } = await fe.json();
        const [iv, base64_ciphertext] = atob(data).split("::"),
            ciphertext = atob(base64_ciphertext);
        // AES解码
        return await decryptAES(ciphertext, key, iv);
    }

    function fmtData(data: string) {
        // 删除标签和<p class="noise2">(</p>
        return data
            .replaceAll(/<p\s+class="noise[0-9]?">[^>]+<\/p>/g, '')
            .replaceAll(/<\/?p>/g, '\r\n')
            .replaceAll(/<[^>]+>/g, '')
            .replace(/ +/, '  ');
    }

    let next_link = url;
    while (next_link) {
        const { fetch_body, title, next_link: next } = await getMeta(next_link);
        const data = await getData(fetch_body);
        yield { title, content: fmtData(data) };
        next_link = next;
    }
} satisfies Callback);