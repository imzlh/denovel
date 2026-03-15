const LISTEN_PORT = 7890;
const TARGET_HOST = "cloud.imzlh.top";
const TARGET_PORT = 7890;

const listener = Deno.listen({ port: LISTEN_PORT, transport: "tcp", hostname: '0.0.0.0' });
console.log(`TCP proxy listening on port ${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`);

for await (const clientConn of listener) {
  handleConnection(clientConn);
}

async function handleConnection(clientConn: Deno.Conn) {
  const clientAddr = clientConn.remoteAddr as Deno.NetAddr;
  console.log(`[+] Connection from ${clientAddr.hostname}:${clientAddr.port}`);
  
  let serverConn: Deno.Conn | null = null;
  
  try {
    serverConn = await Deno.connect({ 
      hostname: TARGET_HOST, 
      port: TARGET_PORT,
      transport: "tcp"
    });
    
    const clientToServer = clientConn.readable.pipeTo(serverConn.writable).catch(() => {});
    const serverToClient = serverConn.readable.pipeTo(clientConn.writable).catch(() => {});
    
    await Promise.race([clientToServer, serverToClient]);
  } catch (err) {
    console.error(`[!] Error: ${err}`);
  } finally {
    try{ clientConn.close(); }catch{}
    try{ serverConn?.close(); }catch{}
    console.log(`[-] Disconnected ${clientAddr.hostname}:${clientAddr.port}`);
  }
}