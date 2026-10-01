import { CommandError } from "../lib/core/errors.ts";
import { getCommand, listCommands } from "./commands/mod.ts";

interface BackgroundTask {
  command: string;
  argv: string[];
  output: Uint8Array[];
  startedAt: number;
  done: boolean;
  status?: Deno.CommandStatus;
  error?: unknown;
}

export function splitCommand(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: string | undefined;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if ((char === "\"" || char === "'") && !quote) {
      quote = char;
    } else if (char === quote) {
      quote = undefined;
    } else if (char === " " && !quote) {
      if (current) args.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (quote) throw new CommandError("Unclosed quote", 2);
  if (current) args.push(current);
  return args;
}

function createLineReader(): (prompt: string) => Promise<string | undefined> {
  const decoder = new TextDecoder();
  const buffer = new Uint8Array(4096);
  let pending = "";

  return async function readline(prompt: string): Promise<string | undefined> {
    await Deno.stdout.write(new TextEncoder().encode(prompt));
    while (true) {
      const newline = pending.search(/\r?\n/);
      if (newline !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(pending[newline] === "\r" && pending[newline + 1] === "\n" ? newline + 2 : newline + 1);
        return line.trim();
      }

      const count = await Deno.stdin.read(buffer);
      if (!count) {
        const line = pending.trim();
        pending = "";
        return line || undefined;
      }
      pending += decoder.decode(buffer.subarray(0, count), { stream: true });
    }
  };
}

function mainPath(): string {
  return new URL("../main.ts", import.meta.url).pathname;
}

async function collectOutput(stream: ReadableStream<Uint8Array>, task: BackgroundTask): Promise<void> {
  for await (const chunk of stream) {
    task.output.push(chunk);
  }
}

function drainOutput(task: BackgroundTask): string {
  const text = new TextDecoder().decode(concat(task.output));
  task.output.length = 0;
  return text;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function taskName(command: string, tasks: Map<string, BackgroundTask>): string {
  if (!tasks.has(command)) return command;
  let index = 2;
  while (tasks.has(`${command}-${index}`)) index++;
  return `${command}-${index}`;
}

function startBackgroundTask(name: string, command: string, argv: string[], tasks: Map<string, BackgroundTask>): void {
  const task: BackgroundTask = {
    command,
    argv,
    output: [],
    startedAt: Date.now(),
    done: false,
  };
  tasks.set(name, task);

  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--unstable-kv", mainPath(), command, ...argv],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  Promise.all([
    collectOutput(child.stdout, task),
    collectOutput(child.stderr, task),
    child.status.then((status) => {
      task.status = status;
    }),
  ]).catch((error) => {
    task.error = error;
  }).finally(() => {
    task.done = true;
  });
}

function showShellHelp(): void {
  console.log("Commands:");
  for (const command of listCommands()) {
    const aliases = command.aliases?.length ? ` (${command.aliases.join(", ")})` : "";
    console.log(`${command.name}${aliases}\t${command.description}`);
  }
  console.log(`
Shell:
  help                  Show help
  exit                  Exit shell
  start <command> ...   Start a command in the background
  log <task>            Print and clear background task output
  tasks                 List background tasks`);
}

export async function runShell(): Promise<void> {
  const tasks = new Map<string, BackgroundTask>();
  const readline = createLineReader();
  while (true) {
    const line = await readline("denovel # ");
    if (line === undefined || line === "exit") return;
    if (!line) continue;
    if (line === "help") {
      showShellHelp();
      continue;
    }
    if (line === "tasks") {
      for (const [name, task] of tasks) {
        const status = task.done ? `done${task.status ? `:${task.status.code}` : ""}` : "running";
        console.log(`${name}\t${status}\t${task.command} ${task.argv.join(" ")}`.trimEnd());
      }
      continue;
    }
    const [name, ...argv] = splitCommand(line);
    if (name === "start") {
      const [commandName, ...commandArgv] = argv;
      if (!commandName) {
        console.error("start requires <command>");
        continue;
      }
      const command = getCommand(commandName);
      if (!command && commandName !== "help") {
        console.error(`Unknown command: ${commandName}`);
        continue;
      }
      if (command?.asyncSafe === false) {
        console.error(`Command is not marked safe for background execution: ${commandName}`);
        continue;
      }
      const name = taskName(command?.name ?? commandName, tasks);
      startBackgroundTask(name, command?.name ?? commandName, commandArgv, tasks);
      console.log(`started ${name}`);
      continue;
    }
    if (name === "log") {
      const [taskId] = argv;
      if (!taskId) {
        console.error("log requires <task>");
        continue;
      }
      const task = tasks.get(taskId);
      if (!task) {
        console.error(`Unknown task: ${taskId}`);
        continue;
      }
      const text = drainOutput(task);
      if (text) console.log(text.trimEnd());
      if (task.done) {
        if (task.error) console.error(task.error instanceof Error ? task.error.message : String(task.error));
        else if (task.status) console.log(`[${taskId}] exited with ${task.status.code}`);
      }
      continue;
    }
    const command = getCommand(name);
    if (!command) {
      console.error(`Unknown command: ${name}`);
      continue;
    }
    try {
      await command.run(argv);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
  }
}
