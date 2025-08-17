import { basename, globToRegExp } from "jsr:@std/path@^1.1.1";
import { tree } from "./_dep.ts";
import { existsSync } from "./main.ts";

for await (const f of tree(Deno.args[0] ?? '.', globToRegExp('*.txt'), true)){
    console.log(f);
    const fb = basename(f);
    if(existsSync(fb) && Deno.statSync(fb).size > Deno.statSync(f).size){
        console.log(`${fb} exists and is larger than ${f}`);
    }else{
        Deno.renameSync(f, fb);
        console.log(`${f} -> ${fb}`);
    }
}