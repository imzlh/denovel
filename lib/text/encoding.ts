export function tryReadTextFile(path: string): string {
  const data = Deno.readFileSync(path);
  for (const encoding of ["utf-8", "gbk", "gb2312", "big5", "utf-16le"]) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(data);
    } catch {
      // Try next encoding.
    }
  }
  return new TextDecoder().decode(data);
}
