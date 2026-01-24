import { readline } from "./exe.ts";

if(Deno.args.length === 0){
    while(true){
        let link: string | null;
        while(link = await readline(' >> ')){
            console.log('Start', link);
            new Deno.Command('BBDown', {
                args: [link, '--download-danmaku', '--dfn-priority', '1080P 高清'],
                stdout: 'inherit',
                stderr: 'inherit',
                stdin: 'inherit'
            }).outputSync();
        }
    }
}

const file = Deno.readTextFileSync(Deno.args[0]);

for(const [link] of file.matchAll(/https?\:\/\/([^\s]+)/g)){
    console.log(link);
    new Deno.Command('BBDown', {
        args: [link, '--dfn-priority', '720P 高清'],
        stdout: 'inherit',
        stderr: 'inherit',
        stdin: 'inherit'
    }).outputSync();
}