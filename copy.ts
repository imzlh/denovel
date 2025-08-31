/**
 * 复制指定大小/数量文件到指定目录
 */

import { accessSync } from "node:fs";
import { parseArgs } from "https://deno.land/std@0.224.0/cli/parse_args.ts";
import { join } from "https://deno.land/std@0.224.0/path/join.ts";
import { progress } from 'jsr:@ryweal/progress'
import { constants } from "node:fs/promises";

function parseSize(size: string) {
    const match = size.match(/(\d+)([kmg])?/);
    if (!match) throw new Error(`Invalid size: ${size}`);
    const value = parseInt(match[1]);
    const unit = match[2] || 'b';
    switch (unit) {
        case 'k': return value * 1024;
        case'm': return value * 1024 * 1024;
        case 'g': return value * 1024 * 1024 * 1024;
        default: return value;
    }
}

function copySync(src: string, dest: string, filter: {
    keyWords?: string[],
    size?: number,
    singleMinSize?: number,
    count?: number
}) {
    let countSize = 0, count = 0;
    for (const file of Deno.readDirSync(src)){
        const stat = Deno.statSync(src + '/' + file.name);
        if (!stat.isFile) continue;
        if (filter.keyWords && !filter.keyWords.includes(file.name)) continue;
        if (filter.singleMinSize && stat.size < filter.singleMinSize) continue;
        if (filter.size && countSize >= filter.size) break;
        if (filter.count && count >= filter.count) break;
        countSize += stat.size;
        count++;

        console.log(`[ ${count} ] COPY ${file.name} to ${dest}`);
        const srcPath = join(src, file.name);
        const destPath = join(dest, file.name);
        const srcStream = Deno.openSync(srcPath, { read: true, write: false });
        const destStream = Deno.createSync(destPath);
        const size = stat.size;
        const progressBar = progress('COPY [[bar]] [[count]]/[[total]] [[rate]] [[eta]]\n', {
            total: size,
            unit: 'MB',
            unitScale: 1024*1024,
            shape: {
                bar: {
                    start: '[',
                    end: ']',
                    completed: '█',
                    pending: ' '
                },
                total: { mask: '###.##' },
                count: { mask: '###.##' },
            }
        });

        const buf = new Uint8Array(1024*1024);
        while(true){
            const n = srcStream.readSync(buf);
            if (n === null) break;
            destStream.writeSync(buf.subarray(0, n));
            progressBar.next(n);
        }
    }
}

if (import.meta.main) {
    const args = parseArgs(Deno.args, {
        string: ["src", "dest", "size", "singleMinSize", "count"],
        collect: ["keyWords"],
        alias: {
            s: "src",
            d: "dest",
            k: "keyWords",
            z: "size",
            m: "singleMinSize",
            c: "count"
        },
        default: {
            src: ".",
            dest: ".",
        }
    });

    accessSync(args.src, constants.R_OK);
    copySync(args.src, args.dest, {
        keyWords: args.keyWords as string[],
        size: args.size ? parseSize(args.size) : undefined,
        singleMinSize: args.singleMinSize ? parseSize(args.singleMinSize) : undefined,
        count: args.count ? parseInt(args.count) : undefined
    });
}