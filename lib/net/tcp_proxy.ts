export interface TcpProxyOptions {
  listenHost: string;
  listenPort: number;
  targetHost: string;
  targetPort: number;
  logger?: Pick<Console, "log" | "error">;
}

export async function serveTcpProxy(options: TcpProxyOptions): Promise<void> {
  const logger = options.logger ?? console;
  const listener = Deno.listen({
    hostname: options.listenHost,
    port: options.listenPort,
    transport: "tcp",
  });
  logger.log(`TCP proxy ${options.listenHost}:${options.listenPort} -> ${options.targetHost}:${options.targetPort}`);
  for await (const clientConn of listener) {
    handleConnection(clientConn, options).catch((error) => logger.error(String(error)));
  }
}

async function handleConnection(clientConn: Deno.Conn, options: TcpProxyOptions): Promise<void> {
  let serverConn: Deno.Conn | undefined;
  try {
    serverConn = await Deno.connect({
      hostname: options.targetHost,
      port: options.targetPort,
      transport: "tcp",
    });
    await Promise.race([
      clientConn.readable.pipeTo(serverConn.writable).catch(() => undefined),
      serverConn.readable.pipeTo(clientConn.writable).catch(() => undefined),
    ]);
  } finally {
    try {
      clientConn.close();
    } catch {
      // ignore
    }
    try {
      serverConn?.close();
    } catch {
      // ignore
    }
  }
}
