import type { Document, Element, HTMLDocument } from "jsr:@b-fuze/deno-dom";
import type { fetchWithContext } from "./fetch.ts";

export type PromiseOrNot<T> = Promise<T> | T;

export interface MainInfo {
  mainPageLike: RegExp;
  mainPageFirstChapter: string;
  mainPageTitle: string;
  mainPageCover: string;
  mainPageSummary?: string;
  mainPageAuthor?: string;
  jpStyle?: boolean;
  mainPageFilter?: (url: URL, document: Document, filledData: MainInfoResult) => PromiseOrNot<void>;
}

export interface MainInfoResult {
  firstPage: URL;
  cover?: string;
  book_name?: string;
  summary?: string;
  author?: string;
  jpStyle?: boolean;
}

export interface Data {
  title: string;
  content: string;
  next_link: string | URL | undefined;
}

export interface TraditionalConfig extends Partial<MainInfo> {
  title: string;
  content: string;
  next_link: string;
  infoFilter?: (url: URL, info: MainInfoResult) => PromiseOrNot<void>;
  filter?: (document: HTMLDocument, filledData: Data & { url: URL }) => PromiseOrNot<void>;
  request?: (url: URL | string, options?: any) => Promise<HTMLDocument>;
  networkHandler?: typeof fetch | typeof fetchWithContext;
}

export interface ComicMainInfo {
  title: string;
  cover?: string;
  firstPage: string | URL;
  tags?: string[];
  summary?: string;
  author?: string;
}

export type Callback = (urlStart: URL | string) => AsyncGenerator<Data, void, void>;

export type ContentElement = Element;
