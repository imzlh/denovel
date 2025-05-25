import { exists } from "./main.ts";

console.log('server started');
if(await exists('out.log')) Deno.removeSync('out.log');
const file = Deno.openSync('out.log', { create: true, write: true });
for await (const conn of Deno.listen({ port: 8000 }))(async function(){
    console.log('new connection');
    const buf = new Uint8Array(100);
    let len: number | null;
    while(true){
        if((len = await conn.read(buf)) === null) continue;
        file.writeSync(buf.subarray(0, len));
        console.log(new TextDecoder().decode(buf.subarray(0, len)));
    }
    conn.close();
});
// const server = Deno.serve({
//     port: 8000,
//     transport: "tcp"
// }, req => {
//     console.log('new connection');
//     const { socket, response } = Deno.upgradeWebSocket(req);
//     socket.onmessage = (event) => {
//         console.log(`message: ${event.data}`);
//         socket.send(`Hello, ${event.data}!`);
//     };
//     socket.onclose = () => {
//         console.log('connection closed');
//     };
//     socket.send('Welcome to the WebSocket server');
//     return response;
// })