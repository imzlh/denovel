import { CommandError } from "../../lib/core/errors.ts";
import { serveTcpProxy } from "../../lib/net/tcp_proxy.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel forward --listen <host:port> --target <host:port>

Starts a TCP forwarding proxy.`);
    return;
  }
  const args = parse(argv);
  if (!args.listen || !args.target) throw new CommandError("forward requires --listen and --target", 2);
  const listen = parseHostPort(args.listen, "listen");
  const target = parseHostPort(args.target, "target");
  await serveTcpProxy({
    listenHost: listen.host,
    listenPort: listen.port,
    targetHost: target.host,
    targetPort: target.port,
  });
}

function parse(argv: string[]): { listen?: string; target?: string } {
  const args: { listen?: string; target?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--listen") args.listen = argv[++i];
    else if (arg === "--target") args.target = argv[++i];
    else throw new CommandError(`Unknown forward option: ${arg}`, 2);
  }
  return args;
}

function parseHostPort(value: string, name: string): { host: string; port: number } {
  const index = value.lastIndexOf(":");
  if (index < 0) throw new CommandError(`${name} must be host:port`, 2);
  const host = value.slice(0, index);
  const port = Number.parseInt(value.slice(index + 1), 10);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) throw new CommandError(`${name} must be host:port`, 2);
  return { host, port };
}

export const command = {
  name: "forward",
  description: "Forward TCP connections",
  run,
};
