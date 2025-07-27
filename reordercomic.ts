const preg = /^\d+_(\d+)([\w\W]+)\.cbz$/;
const files = Deno.readDirSync(".");
for(const file of files){
    const match = preg.exec(file.name);
    if(!match) continue;
    Deno.renameSync(file.name, `${match[1]}_${match[2]}.cbz`);
}