import { ensureDir } from '@std/fs';

let APPDIR = Deno.env.get("DENOVEL_APP_DIR");
// os usr app data dir
if(!APPDIR) switch(Deno.build.os){
    case "darwin":
        APPDIR = Deno.env.get("HOME") + "/Library/Application Support/denovel";
        break;
    case "freebsd":
    case "netbsd":
    case "linux":
        APPDIR = Deno.env.get("HOME") + "/.config/denovel";
        break;
    case "android":
        APPDIR = Deno.env.get("EXTERNAL_STORAGE") + "/denovel";
        break;
    case "windows":
        APPDIR = Deno.env.get("APPDATA") + "\\denovel";
        break;
    default:
        throw new Error("Unsupported platform");
}
await ensureDir(APPDIR);
APPDIR = await Deno.realPath(APPDIR);

export const DATA_FILE_PATH = {
    CONFIG: APPDIR + "/config.json",
    COOKIES: APPDIR + "/cookies.db",
}