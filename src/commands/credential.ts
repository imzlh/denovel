import { createRuntimeContext } from "../../lib/core/context.ts";
import { CommandError } from "../../lib/core/errors.ts";
import { hasHelp } from "../cli/args.ts";

interface Parsed {
  dataDir?: string;
  action?: string;
  rest: string[];
}

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel credential set-cookie [options] <host> <raw-cookie>
  denovel credential get-cookie [options] <host>
  denovel credential set [options] <scope> <name> <value>
  denovel credential get [options] <scope> <name>
  denovel credential delete [options] <scope> <name>

Options:
  -d, --data-dir <dir>    v2 data directory`);
    return;
  }

  const args = parse(argv);
  if (!args.action) throw new CommandError("credential requires an action", 2);
  const ctx = await createRuntimeContext({ dataDir: args.dataDir });
  try {
    switch (args.action) {
      case "set-cookie": {
        const [host, cookie] = args.rest;
        if (!host || !cookie) throw new CommandError("set-cookie requires <host> <raw-cookie>", 2);
        await ctx.cookies.setRawCookie(host, cookie);
        console.log(`stored cookie for ${host}`);
        return;
      }
      case "get-cookie": {
        const [host] = args.rest;
        if (!host) throw new CommandError("get-cookie requires <host>", 2);
        console.log(await ctx.cookies.getCookieHeader(host));
        return;
      }
      case "set": {
        const [scope, name, value] = args.rest;
        if (!scope || !name || value === undefined) throw new CommandError("set requires <scope> <name> <value>", 2);
        await ctx.settings.setSiteCredential(scope, name, value);
        console.log(`stored credential ${scope}:${name}`);
        return;
      }
      case "get": {
        const [scope, name] = args.rest;
        if (!scope || !name) throw new CommandError("get requires <scope> <name>", 2);
        console.log(await ctx.settings.getSiteCredential(scope, name) ?? "");
        return;
      }
      case "delete": {
        const [scope, name] = args.rest;
        if (!scope || !name) throw new CommandError("delete requires <scope> <name>", 2);
        await ctx.settings.deleteSiteCredential(scope, name);
        console.log(`deleted credential ${scope}:${name}`);
        return;
      }
      default:
        throw new CommandError(`Unknown credential action: ${args.action}`, 2);
    }
  } finally {
    ctx.state.close();
  }
}

function parse(argv: string[]): Parsed {
  const parsed: Parsed = { rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-d" || arg === "--data-dir") parsed.dataDir = argv[++i];
    else if (arg.startsWith("-")) throw new CommandError(`Unknown credential option: ${arg}`, 2);
    else if (!parsed.action) parsed.action = arg;
    else parsed.rest.push(arg);
  }
  return parsed;
}

export const command = {
  name: "credential",
  aliases: ["cred"],
  description: "Manage v2 KV cookies and site credentials",
  run,
};
