import assert from "node:assert";
import { DATA_FILE_PATH } from "./config.ts";
import defaultEvent from "./event.ts";

export class CookieStore {
    static async open(name: string): Promise<CookieStore> {
        const db = await Deno.openKv(name);
        return new CookieStore(db);
    }

    constructor(private db: Deno.Kv){
        defaultEvent.on("exit", () => db.close());
    }

    async get(site: string){
        const res = {} as Record<string, string>;
        for await (const it of this.db.list<string>({
            prefix: [site]
        })){
            res[it.key[1] as string] = it.value;
        }
        return res;
    }

    async set(site: string, cookies: Record<string, string>){
        const commit = this.db.atomic();
        for(const key in cookies){
            commit.set([site, key.toLowerCase()], cookies[key]);
        }
        assert((await commit.commit()).ok, "Failed to commit cookies to database");
    }

    /**
     * (for client) Cookie header for request URL
     * @param site 
     * @returns 
     */
    async getCookieHeader(site: string){
        const cookies = await this.get(site);
        return Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join("; ");
    }

    async fromSetCookieHeader(host: string, setCookieHeader: string[]) {
        const commit = this.db.atomic();
        for (const setCookie of setCookieHeader) {
            const cookie = setCookie.split(';')[0]
            let [key, value] = cookie.split('=').map(s => s.trim());
            key = key.toLowerCase();

            // check if cookie is expired
            const expire = setCookie.split(';')
                .find(s => s.trim().toLowerCase().startsWith('expires='))
                ?.trim().split('=')[1];
            if (expire) {
                const exp_date = new Date(expire);
                if (exp_date.getTime() <= Date.now()) {
                    commit.delete([host, key]);
                    continue;
                }
            }

            if (key && value) {
                commit.set([host, key], value);
            }
        }
        await commit.commit();
    }

    close(){
        this.db.close();
    }
}

const defaultCookieStore = await CookieStore.open(DATA_FILE_PATH.COOKIES);
export default defaultCookieStore;