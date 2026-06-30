import { readline } from "./exe.ts";

const d = (await readline('输入 >> ')!);
console.log(d, )
console.log([...new TextEncoder().encode(d)])