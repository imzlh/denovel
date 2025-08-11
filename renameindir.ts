import { join } from "jsr:@std/path@^1.0/join";
import { exists } from "./main.ts";

// 从类似"{name}/content.txt"重命名为"{name}.txt"
for(const file of Deno.readDirSync(".")){
    if(file.isDirectory && await exists(join(file.name, "content.txt"))){
        Deno.renameSync(join(file.name, "content.txt"), file.name + ".txt");
    }
}