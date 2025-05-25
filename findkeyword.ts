import { ensureDirSync } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { removeNonVisibleChars } from "./main.ts";

// 遍历文件夹，打开txt查找关键字
const key = Deno.args[0];
const minappear = Deno.args[1] ?? '10';
if (!key) {
    console.log("Usage: findkeyword.ts <keyword> <minappear>");
    Deno.exit(1);
}
const mina = parseInt(minappear);
if(isNaN(mina) || mina < 1) {
    console.log("Usage: findkeyword.ts <keyword> <minappear>");
    Deno.exit(1);
}

// 搜索多次匹配的文件
function search(content: string, keyword: string, minappear: number) {
    let lastIndex = 0;
    for(var i = 0; i < minappear; i++) {
        const index = content.indexOf(keyword, lastIndex);
        if(index >= 0) {
            lastIndex = index + 1;
        }
    }
    if(i == minappear) return true;
    return false;
}

const files = [] as string[];
for (const entry of Deno.readDirSync('.')) {
    console.log(entry.name, entry.isFile);
    if (entry.isFile && entry.name.endsWith(".txt")) {
        const file = Deno.openSync(entry.name);
        const content = Deno.readTextFileSync(entry.name);

        if(search(content, '.xhtml', 10)){
            console.log(entry.name, 'is an epub file, skip it');
            break;  // 跳过epub文件
        }
        const lines = content.split('\n');
        let appear = 0;
        for(let j = 0; j < lines.length; j++) {
            const line = lines[j].trim();
            if(line.includes(key)) {
                if(appear ++ == 0)
                    console.log(entry.name, '\n');

                const start = Math.max(0, j - 2);
                const end = Math.min(lines.length, j + 2);

                for (let i = start; i <= end; i++) {
                    console.log(i, '|', removeNonVisibleChars(lines[i]).replace(key, "\x1b[31m" + key + "\x1b[0m"));
                }
                console.log('\n');
                j += 2;
            }
            if(appear >= mina) {
                files.push(entry.name);
                console.log('...\n');
                break;
            }
        }
        file.close();
    }
}

ensureDirSync('./matched');
for (const file of files) {
    Deno.linkSync(file, './matched/' + file.replace('\\', '/').split('/').pop());
}