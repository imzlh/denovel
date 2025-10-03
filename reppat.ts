// const pattern = /^(.+?)⊙(?:.+)\s*\.txt$/
// 《我，装备锻造者》 作者：因果（全本）
// const pattern = /^《(.+)》\s*/
// 去除前缀www.pxdd.cc 
// const pattern = /^www\.pxdd\.cc\s*(.+)$/
// 去(1)
// const pattern = /^(.+?)\s*\((\d+)\)/
// 去【xx】
// const pattern = /^【(?:.+)】(.+)\.txt$/;
// 去末尾括号
const pattern = /^(.+?)\s*[(（].+[)）]\.txt$/;
for (const f of Deno.readDirSync('./')){
    const match = pattern.exec(f.name)
    if (match && match[1]) {
        Deno.renameSync(`./${f.name}`, `./${match[1]}.txt`)
        console.log(`Renamed ${f.name} to ${match[1]}.txt`)
    }
}