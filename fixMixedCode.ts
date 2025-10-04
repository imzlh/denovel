for (const f of Deno.readDirSync('.')){
    const bin = Deno.readFileSync(f.name);
    const text = new TextDecoder().decode(bin.slice(0, 300));
    if(!text.includes('封面：yes')) continue;
    // find 4th \n
    let index = 0;
    for(let i = 0; i < 1; i++){
        index = bin.indexOf(0x0A, index + 1);
    }
    // save the rest of the file
    const rest = bin.slice(index +3);
    const file = Deno.openSync(f.name, {write: true});
    // file.writeSync(firstLine);
    file.writeSync(rest);
    file.close();
    console.log(`Fixed ${f.name}`);
}