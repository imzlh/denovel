export function similarTitle(title1: string, title2: string, strict = true): boolean {
  title1 = title1.trim();
  title2 = title2.trim();
  if (title1 === title2) return true;
  const format = /^\s*(.+?)\s*[\(（]\d+(?:[\/\-]\d+)?[\)）]\s*$/;
  const format2 = /^\s*(.+?)\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|\d{1,2})\s*$/;
  const t1res = title1.match(format);
  const t2res = title2.match(format);
  if (t1res && t2res && t1res[1] === t2res[1]) return true;
  const t1res2 = title1.match(format2);
  const t2res2 = title2.match(format2);
  if (!t1res2 || !t2res2 || t1res2[1] !== t2res2[1]) return false;
  if (!strict) return true;
  const map = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  const getId = (c: string) => /[0-9]/.test(c) ? Number.parseInt(c, 10) : map.indexOf(c);
  return getId(t2res2[2]) - getId(t1res2[2]) === 1;
}
