export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  asyncSafe?: boolean;
  run(argv: string[]): Promise<void>;
}
