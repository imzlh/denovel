// forfile: 命令行工具，用于批量处理文件
import { basename, dirname, globToRegExp, join } from "jsr:@std/path@^1.0.8";

// 处理args
if(Deno.args.length < 3){
    console.log("Usage: forfile <glob> <command> [args...]");
    Deno.exit(1);
}

const [path, exeFile] = Deno.args,
    glob = globToRegExp(basename(path));

function pipe(process: Deno.ChildProcess){
    const writer = process.stdout.getReader(),
        writer2 = process.stderr.getReader(),
        reader = process.stdin.getWriter();
    let res = false;
    process.status.then(() => res = true);
    (async function() {
        while(true){
            const result = await writer.read();
            if(result.done) break;
            Deno.stdout.writeSync(result.value);
        }
    })();

    (async function() {
        while(true){
            const result = await writer2.read();
            if(result.done) break;
            Deno.stderr.writeSync(result.value);
        }
    })();

    (async function() {
        while(res){
            const ui = new Uint8Array(1024);
            const n = await Deno.stdin.read(ui);
            await reader.write(ui.subarray(0, n ?? 0));
        }
    })();
}

for(const file of Deno.readDirSync(dirname(path))){
    if(glob.test(file.name)){
        console.log(file.name);
        const fullPath = join(dirname(path), file.name),
            basename = file.name;

        let inArgs = false;
        const args = Deno.args.slice(2).map(arg => {
            if(arg.includes('%f') || arg.includes('%b')){
                inArgs = true;
                return arg.replaceAll('%f', fullPath).replaceAll('%b', basename);
            }else{
                return arg;
            }
        });
        if(!inArgs)
            args.push(fullPath);

        const proc = new Deno.Command(exeFile, {
            stdout: "piped",
            stderr: "piped",
            stdin: "piped",
            args
        }).spawn();
        pipe(proc);
        await proc.status;
    }
}