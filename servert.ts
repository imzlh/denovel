import { exists } from "./main.ts";

console.log('server started');
if(await exists('out.log')) Deno.removeSync('out.log');
const file = Deno.openSync('out.log', { create: true, write: true });
for await (const conn of Deno.listen({ port: 8000 }))(async function(){
    console.log('new connection');
    const buf = new Uint8Array(100);
    let len: number | null;
    while((len = await conn.read(buf))!== null){
        if(buf)
            file.writeSync(buf.subarray(0, len));
    }
    conn.close();
});