#!/usr/bin/env -S deno run -A

// Compatibility entry point. The implementation lives in the v2 command
// registry so legacy scripts do not use the removed v1 core modules.
import { main } from "../main.ts";

if (import.meta.main) Deno.exitCode = await main(["downovel", ...Deno.args]);
