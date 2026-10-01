export interface SiteModule<T = unknown> {
  default?: T;
  [name: string]: unknown;
}

export class SiteRegistry {
  constructor(private readonly rootUrl: string) {}

  async loadTraditional(hostname: string): Promise<SiteModule> {
    return await import(new URL(`../sites/${hostname}.t.ts`, this.rootUrl).href);
  }

  async loadNative(hostname: string): Promise<SiteModule> {
    return await import(new URL(`../sites/${hostname}.n.ts`, this.rootUrl).href);
  }

  async hasTraditional(hostname: string): Promise<boolean> {
    return await canLoadDefault(() => this.loadTraditional(hostname));
  }

  async hasNative(hostname: string): Promise<boolean> {
    return await canLoadDefault(() => this.loadNative(hostname));
  }
}

export class ComicSiteRegistry {
  constructor(private readonly rootUrl: string) {}

  async load(site: string): Promise<SiteModule> {
    return await import(new URL(`../comic-sites/${site}.ts`, this.rootUrl).href);
  }

  async resolve(hostname: string): Promise<string> {
    const short = hostname.split(".").slice(-2).join(".");
    if (await canLoadDefault(() => this.load(short))) return short;
    if (await canLoadDefault(() => this.load(hostname))) return hostname;
    throw new Error(`No comic adapter found for ${hostname}`);
  }
}

async function canLoadDefault(loader: () => Promise<SiteModule>): Promise<boolean> {
  try {
    const mod = await loader();
    return typeof mod.default !== "undefined";
  } catch {
    return false;
  }
}
