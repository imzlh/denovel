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