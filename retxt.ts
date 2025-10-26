import { DOMParser } from "jsr:@b-fuze/deno-dom@~0.1.49";
import { processContent } from "./main.ts";

const file = Deno.readTextFileSync(Deno.args[0]);
const dom = new DOMParser().parseFromString(file, "text/html");
Deno.writeTextFileSync(Deno.args[0], processContent(dom.documentElement));