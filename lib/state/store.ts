import { dirname, join } from "jsr:@std/path";

export type KvKey = Deno.KvKey;

export class StateStore {
  private constructor(
    readonly kv: Deno.Kv,
    readonly path: string,
  ) {}

  static async open(dataDir: string): Promise<StateStore> {
    const path = join(dataDir, "denovel.db");
    await Deno.mkdir(dirname(path), { recursive: true });
    if (typeof Deno.openKv !== "function") {
      throw new Error("Deno KV is unavailable. Run denovel v2 commands with --unstable-kv.");
    }
    return new StateStore(await Deno.openKv(path), path);
  }

  close(): void {
    this.kv.close();
  }
}
