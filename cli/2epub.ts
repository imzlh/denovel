#!/usr/bin/env -S deno run -A

// Compatibility entry point for scripts that still invoke cli/2epub.ts.
import { main } from "../main.ts";

if (import.meta.main) Deno.exitCode = await main(["2epub", ...Deno.args]);
