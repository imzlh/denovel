import type {
  Callback as CoreCallback,
  ComicMainInfo as CoreComicMainInfo,
  Data as CoreData,
  MainInfo as CoreMainInfo,
  MainInfoResult as CoreMainInfoResult,
  PromiseOrNot as CorePromiseOrNot,
  TraditionalConfig as CoreTraditionalConfig,
} from "./types.ts";

declare global {
  type PromiseOrNot<T> = CorePromiseOrNot<T>;
  type Callback = CoreCallback;
  interface MainInfo extends CoreMainInfo {}
  interface MainInfoResult extends CoreMainInfoResult {}
  interface ComicMainInfo extends CoreComicMainInfo {}
  interface TraditionalConfig extends CoreTraditionalConfig {}
  interface Data extends CoreData {}
}

export {};
