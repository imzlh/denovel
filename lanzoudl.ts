/**
 * 下载蓝奏云盘
 */

import { _TextDecoder } from "https://deno.land/std@0.92.0/node/_utils.ts";
import { exists, fetch2, getDocument, removeIllegalPath } from "./main.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { basename, dirname, join } from "jsr:@std/path@^1.0";
import { delay } from "https://deno.land/std@0.224.0/async/delay.ts";
import { DOMParser } from "jsr:@b-fuze/deno-dom";
import { readline } from "./exe.ts";

interface LanZouFile {
    icon: string;
    t: number;
    id: string;
    name_all: string;
    size: string;
    time: string;
    duan: string;
    p_ico: number;
    _link: string;
    _path: string;
}
function extractFunctionByName(source: string, functionName: string): string | null {
    // 定位函数起始位置
    const funcHeader = `function ${functionName}(`;
    const startIndex = source.indexOf(funcHeader);
    if (startIndex === -1) return null;

    // 语法分析状态机
    let braceCount = 0;
    let position = startIndex + funcHeader.length;
    let inString: "'" | '"' | '`' | null = null;
    let inComment = false;
    let commentType: '//' | '/*' | null = null;

    // 定位第一个左花括号
    while (position < source.length) {
        const char = source[position];
        
        // 处理注释
        if (!inString && !inComment) {
            if (char === '/' && source[position + 1] === '/') {
                commentType = '//';
                inComment = true;
                position += 2;
                continue;
            }
            if (char === '/' && source[position + 1] === '*') {
                commentType = '/*';
                inComment = true;
                position += 2;
                continue;
            }
        }

        // 处理字符串
        if (!inComment && (char === '"' || char === "'" || char === '`')) {
            if (inString === char && source[position - 1] !== '\\') {
                inString = null;
            } else if (!inString) {
                inString = char;
            }
        }

        // 统计有效花括号
        if (!inString && !inComment) {
            if (char === '{') {
                braceCount++;
                if (braceCount === 1) {
                    position++; // 跳过起始花括号
                    break;
                }
            }
        }

        position++;
    }

    const codeStart = position;
    let codeEnd = codeStart;

    // 精确提取函数体
    while (position < source.length && braceCount > 0) {
        const char = source[position];
        const nextChar = source[position + 1];

        // 更新注释状态
        if (!inString) {
            if (!inComment && char === '/' && nextChar === '/') {
                inComment = true;
                commentType = '//';
                position += 2;
                continue;
            }
            if (!inComment && char === '/' && nextChar === '*') {
                inComment = true;
                commentType = '/*';
                position += 2;
                continue;
            }
            if (inComment && commentType === '/*' && char === '*' && nextChar === '/') {
                inComment = false;
                commentType = null;
                position += 2;
                continue;
            }
            if (inComment && commentType === '//' && char === '\n') {
                inComment = false;
                commentType = null;
            }
        }

        // 更新字符串状态
        if (!inComment) {
            if (char === '\\' && inString) {
                position += 2; // 跳过转义字符
                continue;
            }
            if ((char === '"' || char === "'" || char === '`') && (!inString || inString === char)) {
                inString = inString ? null : char;
            }
        }

        // 统计有效花括号
        if (!inString && !inComment) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
        }

        codeEnd = position;
        position++;
    }

    return braceCount === 0 
        ? source.slice(codeStart, codeEnd).trim()
        : null;
}

function sandboxEval(code: string, predef: string) {
    const env = `let res; const $ = { ajax: d => res = d }; `

    // 提取前定义
    let def = '';
    for (const line of predef.split('\n')) {
        if (line.trim()) {
            // 非函数声明
            if (line.trimStart().match(/\(.+\)/)) {
                break;
            }else{
                def += line + '\n';
            }
        }
    }

    // 找到$.ajax
    const ajax = code.indexOf('$.ajax(');
    if (ajax !== -1) {
        code = code.substring(ajax);
    }

    const ecode = env + '\n' + def + '\n' + code + '\n' + 'return res;';
    try{
        return new Function(ecode)() as { url: string, data: any };
    }catch(e){
        throw e;
    }
}

const getFiles = async function (page: string, parentPath = '', files: LanZouFile[]) {
    const doc = await getDocument(page);
    const script = doc.getElementsByTagName('script').find(s =>
        s.innerHTML.includes('$.ajax')
    );
    if (!script) {
        throw new Error('找不到script部分，确保这是蓝奏云分享链接！');
    }

    const data = extractFunctionByName(script.innerHTML, "file")!;
    const { url, data: bodyData } = sandboxEval(data, script.innerHTML);
    const formData = new FormData();
    for (const [key, value] of Object.entries(bodyData)) {
        formData.append(key, String(value));
    }

    let pgnum = 1;
    let lastNum = 50;   // 每页显示50个文件
    while (lastNum == 50) {
        formData.set('pg', pgnum.toString());
        const list = await fetch2(new URL(url, page), {
            method: 'POST',
            body: formData
        }).then(r => r.json());
        if(list.info != 'sucess'){
            if(typeof list.info === 'string' && list.info.includes('重试')){
                console.warn(`获取第 ${pgnum} 页文件列表出现问题：蓝奏云限制！`);
                await delay(1000 * Math.random() + 834);
                continue;
            }
            console.warn(`获取第 ${pgnum} 页文件列表失败！`, list.info);
            break;
        }
        lastNum = list.text.length;
        pgnum++;
        files.push(...list.text.map((el: LanZouFile) => ({
            ...el,
            _link: new URL('/' + el.id, page).href,
            _path: parentPath + '/' + removeIllegalPath(el.name_all)
        })));

        console.log(`获取第 ${pgnum - 1} 页文件列表成功！`);
        await delay(1000 * Math.random() + 782);
    }

    // 提取文件夹
    for (const direl of doc.querySelectorAll('#folder a')) try {
        direl.querySelector('div.filesize')?.remove();  // 去除文件夹大小
        const dirurl = new URL(direl.getAttribute('href')!, page);
        console.log(`递归：获取文件夹 ${dirurl.href}`);
        await getFiles(dirurl.href, parentPath + '/' + direl.textContent, files);
        await delay(500 * Math.random() + 432);
    } catch (e) {
        console.error(e);
    }

    console.log(`共获取 ${files.length} 个文件！`);
    return files;
}

async function downloadFile(docurl: string) {
    const document1 = await getDocument(docurl);
    for(const iframe of document1.getElementsByTagName('iframe')){
        await delay(475 + 1000 * Math.random());
        const docurl2 = new URL(iframe.getAttribute('src')!, docurl);
        const document = await getDocument(docurl2);
        const code = document.getElementsByTagName('script').at(-1)!.innerHTML;
        const { url, data } = sandboxEval(code, code);

        const formData = new FormData();
        for (const [key, value] of Object.entries(data)) {
            formData.append(key, String(value));
        }
        await delay(143 + 1000 * Math.random());
        const file = await fetch2(new URL(url, docurl), {
            body: formData,
            method: 'POST',
            referrer: docurl2.href,
            headers: {
                Origin: docurl2.origin,
                "X-Requested-With": "XMLHttpRequest"
            }
        }).then(r => r.json());
        if(file.zt != 1) throw new Error('下载 ' + file.name +' 失败: 链接超时');
        const realpath = file.dom + '/file/' + file.url;

        await delay(324 + 1000 * Math.random());
        const textpath = new URL(realpath, docurl);
        const text2 = await fetch2(textpath);
        // 网络验证
        if(text2.headers.get('Content-Type')?.includes('text/html')){
            const document = new DOMParser().parseFromString(await text2.text(), 'text/html');
            const script = document.getElementsByTagName('script').at(-1)!;
            const func = extractFunctionByName(script.innerHTML, 'down_r')!;
            const { url, data } = sandboxEval(func, 'var el = 2;' + script.innerHTML);
            const formData = new FormData();
            for (const [key, value] of Object.entries(data)) {
                formData.append(key, String(value));
            }
            await delay(2241 + 1000 * Math.random());
            const file2 = await fetch2(new URL(url, textpath), {
                body: formData,
                method: 'POST',
                referrer: textpath.href,
                headers: {
                    Origin: textpath.origin,
                    "X-Requested-With": "XMLHttpRequest"
                }
            }).then(r => r.json());
            if(file2.zt != 1) throw new Error('下载 ' + file.name +' 失败: 验证网络：链接超时');
            const urlreal = new URL(file2.url, textpath);
            await delay(1000 * Math.random() + 621);
            return await fetch2(urlreal);
        }else{
            return text2;
        }
    }
    throw new Error('下载 ' + docurl +' 失败: 找不到文件下载链接！');
}

async function downloadCorutine(file: LanZouFile) {
    try{
        if(await exists(join('lanout', file._path))){
            console.log(`文件 ${file._path} 已存在，跳过下载...`);
            return;
        }
        await ensureDir('lanout/' + dirname(file._path));
        let f;
        do{
            if(f) console.log(`下载 ${basename(file._path)} 失败，重试...`);
            f = await downloadFile(file._link);
        }while(!f.ok)
        if(!f?.body) throw new Error('下载 ' + file._path +' 失败！');
        await Deno.writeFile(`lanout/${file._path}`, f?.body!);
        console.log(`下载 ${basename(file._path)} 成功，大小: ${file.size} 字节！`);
    }catch(e){
        console.error(e);
    }
}

const CO_COUNT = 8;
export default async function main() {
    let files: LanZouFile[] = [];
    
    if(!Deno.args.length){
        const link = await readline('请输入蓝奏云分享链接：') ?? 'https://wwt.lanzov.com/b041zh0qj';
        if (!link) return;
        
        const intv = setInterval(() => Deno.writeTextFileSync('files.json', JSON.stringify(files, null, 4)), 10000);

        await getFiles(link, '', files);
        Deno.writeTextFileSync('files.json', JSON.stringify(files, null, 4));
        clearInterval(intv);
    }else{
        files = JSON.parse(Deno.readTextFileSync(Deno.args[0] ?? 'files.json'));
    }

    await ensureDir('lanout');
    for (let i = 0; i < files.length; i+=CO_COUNT){
        console.log(`## 开始下载第 ${i/CO_COUNT+1}/${Math.ceil(files.length/CO_COUNT+1)} 批文件...`);
        await Promise.all(files.slice(i, i + CO_COUNT).map(downloadCorutine));
    }
}
if(import.meta.main) main();