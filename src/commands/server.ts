import { createRuntimeContext } from "../../lib/core/context.ts";
import { serveDenovel } from "../../lib/core/server.ts";
import { CommandError } from "../../lib/core/errors.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel server [--port <port>] [--data-dir <dir>]

Starts the v2 API server. Settings and queue state are stored in the unified KV store.`);
    return;
  }
  const args = parse(argv);
  const ctx = await createRuntimeContext({ dataDir: args.dataDir });
  const server = serveDenovel(ctx, { port: args.port ? Number.parseInt(args.port, 10) : undefined });
  await server.finished.finally(() => ctx.state.close());
}

interface Args {
  port?: string;
  dataDir?: string;
}

function parse(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port") args.port = argv[++i];
    else if (arg === "--data-dir" || arg === "-d") args.dataDir = argv[++i];
    else throw new CommandError(`Unknown server option: ${arg}`, 2);
  }
  return args;
}

export const command = {
  name: "server",
  description: "Start the web server",
  run,
};
