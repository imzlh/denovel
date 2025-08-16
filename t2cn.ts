import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { basename, dirname } from "jsr:@std/path@^1.0.8";
import { convert, tryReadTextFile } from "./main.ts";

export default async function main() {
    const args = parseArgs(Deno.args, {
        string: ['output'],
        boolean: ['help', 'delete'],
        alias: {
            o: 'output',
            h: 'help',
            d: 'delete'
        }
    });

    if (args.help) {
        console.log(`Replace tradition Chinese chars to simplified Chinese chars.

Usage:
  t2cn [options] <input>
  
Options:
    -o, --output <output>  Output directory or file.
    -h, --help             Show help.
    -d, --delete           Delete original file.
`);
        Deno.exit(0);
    }

    const input = args._[0];
    let output = (args.output || input).toString();
    if (typeof input !== 'string')
        throw new Error('Input file is required');
    const finfo = await Deno.stat(input);
    let files = [] as string[];
    if(finfo.isDirectory) {
        files = await Array.fromAsync(Deno.readDir(input)).then(data => 
            data.filter(item => item.isFile && item.name.endsWith('.txt')).map(item => item.name)
        );
        await ensureDir(output);
    } else {
        files = [input];
        output = dirname(output);
    }

    console.time('convert');
    for(const file of files) try{
        if(file.endsWith('.2.txt')) continue;
        const ofile = output + '/' + basename(file) + '.2.txt';
        const data = tryReadTextFile(file);
        const res = convert(data);
        Deno.writeTextFileSync(args.delete ? file : ofile, res);
    }catch(e) {
        console.error(`Error converting "${file}": ${(e as Error).message}`);
    }

    console.log('Done!');
}

if (import.meta.main) main();