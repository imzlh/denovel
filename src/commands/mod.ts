import { command as bilibili } from "./bilibili.ts";
import { command as epub2 } from "./2epub.ts";
import { command as txt2 } from "./2txt.ts";
import { command as cbz2img } from "./cbz2img.ts";
import { command as conv } from "./conv.ts";
import { command as copy } from "./copy.ts";
import { command as credential } from "./credential.ts";
import type { Command } from "./types.ts";
import { command as downcomic } from "./downcomic.ts";
import { command as downmusic } from "./downmusic.ts";
import { command as downovel } from "./downovel.ts";
import { command as find } from "./find.ts";
import { command as filterInFile } from "./filter_in_file.ts";
import { command as fixMixedCode } from "./fix_mixed_code.ts";
import { command as fixname } from "./fixname.ts";
import { command as forfile } from "./forfile.ts";
import { command as forward } from "./forward.ts";
import { command as i234me } from "./i234me.ts";
import { command as imgmerge } from "./imgmerge.ts";
import { command as lanzou } from "./lanzou.ts";
import { command as migrateState } from "./migrate_state.ts";
import { command as m3u8 } from "./m3u8.ts";
import { kugouCommand, neastCommand } from "./music_aliases.ts";
import { command as move } from "./move.ts";
import { command as noads } from "./noads.ts";
import { command as normalize } from "./normalize.ts";
import { command as part } from "./part.ts";
import { command as pixiv2epub } from "./pixiv2epub.ts";
import { command as quark } from "./quark.ts";
import { command as recurseJoin } from "./recurse_join.ts";
import { command as renameindir } from "./renameindir.ts";
import { command as reppat } from "./reppat.ts";
import { command as reordercomic } from "./reordercomic.ts";
import { command as retxt } from "./retxt.ts";
import { command as server } from "./server.ts";
import { command as seventeen } from "./seventeen.ts";
import { command as t2cn } from "./t2cn.ts";
import { command as transchinese } from "./transchinese.ts";
import { command as tsnovel } from "./tsnovel.ts";
import { command as ttxs } from "./ttxs.ts";
import { command as uc } from "./uc.ts";
import { command as unescapeHtml } from "./unescape_html.ts";

const commandList: Command[] = [
  migrateState,
  epub2,
  txt2,
  part,
  find,
  filterInFile,
  fixMixedCode,
  fixname,
  forfile,
  forward,
  i234me,
  move,
  noads,
  normalize,
  retxt,
  reppat,
  renameindir,
  reordercomic,
  recurseJoin,
  credential,
  bilibili,
  pixiv2epub,
  quark,
  uc,
  unescapeHtml,
  t2cn,
  transchinese,
  tsnovel,
  ttxs,
  cbz2img,
  imgmerge,
  downovel,
  downcomic,
  downmusic,
  neastCommand,
  kugouCommand,
  copy,
  server,
  conv,
  m3u8,
  lanzou,
  seventeen,
];

export const commands = new Map<string, Command>();
for (const command of commandList) {
  commands.set(command.name, command);
  for (const alias of command.aliases ?? []) commands.set(alias, command);
}

export function listCommands(): Command[] {
  return commandList.toSorted((a, b) => a.name.localeCompare(b.name));
}

export function getCommand(name: string): Command | undefined {
  return commands.get(name);
}
