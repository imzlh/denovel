import { Converter } from "./opencc.js";

export const traditionalToSimplified = Converter({ from: "tw", to: "cn" });
