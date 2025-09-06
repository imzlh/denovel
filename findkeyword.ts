import { ensureDirSync } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { removeNonVisibleChars } from "./main.ts";
export async function main() {
    // 遍历文件夹，打开txt查找关键字
    const key = Deno.args[0];
    const minappear = Deno.args[1] ?? '10';
    if (!key) {
        console.log("Usage: findkeyword.ts <keyword> <minappear>");
        Deno.exit(1);
    }
    const mina = parseInt(minappear);
    if (isNaN(mina) || mina < 1) {
        console.log("Usage: findkeyword.ts <keyword> <minappear>");
        Deno.exit(1);
    }

    // 搜索多次匹配的文件
    function search(content: string, keyword: string, minappear: number) {
        let count = 0;
        let pos = -1;
        while ((pos = content.indexOf(keyword, pos + 1)) !== -1) {
            count++;
            if (count >= minappear) return true;
        }
        return false;
    }


    const files = [] as string[];
    let i = 0;
    console.log('Searching in', Deno.cwd());
    for await (const entry of Deno.readDir(Deno.cwd())) {
        // console.log(entry.name, entry.isFile);
        if (entry.isFile && entry.name.endsWith(".txt")) {
            const file = Deno.openSync(entry.name);
            const content = Deno.readTextFileSync(entry.name);
            i++;

            if (search(content, '.xhtml', 10)) {
                console.log(entry.name, 'is an epub file, skip it');
                continue;  // 跳过epub文件
            }
            const lines = content.split('\n');
            let appear = 0;
            for (let j = 0; j < lines.length; j++) {
                const line = lines[j].trim();
                if (line.includes(key)) {
                    if (appear++ == 0)
                        console.log(entry.name, '\n');

                    const start = Math.max(0, j - 2);
                    const end = Math.min(lines.length, j + 2);

                    for (let i = start; i <= end; i++) {
                        console.log(i, '|', removeNonVisibleChars(lines[i]).replace(key, "\x1b[31m" + key + "\x1b[0m"));
                    }
                    console.log('\n');
                    j += 2;
                }
                if (appear >= mina) {
                    files.push(entry.name);
                    console.log('...\n');
                    break;
                }
            }
            file.close();
            i++;
        }
    }

    ensureDirSync('./matched');
    for (const file of files) {
        Deno.linkSync(file, './matched/' + file.replace('\\', '/').split('/').pop());
    }
    console.log(`Found ${files.length} files with keyword "${key}" appeared ${mina} times or more in ${i} files total.`);
}

if(import.meta.main) main();