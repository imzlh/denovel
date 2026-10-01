import { dirname, globToRegExp } from "jsr:@std/path";
import { walk } from "jsr:@std/fs";

export interface ConvertOptions {
  inputDir: string;
  fromGlob: string;
  toFormat: string;
  recursive?: boolean;
  deleteSource?: boolean;
  audioBitrate?: string;
  audioCodec?: string;
  videoBitrate?: string;
  videoCodec?: string;
  fps?: string;
  videoFilter?: string;
  minInputSize?: number;
}

export async function convertMedia(options: ConvertOptions): Promise<number> {
  const matcher = globToRegExp(options.fromGlob);
  let converted = 0;
  for await (const entry of walk(options.inputDir, { includeDirs: false, maxDepth: options.recursive ? Infinity : 1 })) {
    if (!matcher.test(entry.name)) continue;
    const stat = await Deno.stat(entry.path);
    if (options.minInputSize && stat.size < options.minInputSize) continue;
    const output = replaceExt(entry.path, options.toFormat);
    await Deno.mkdir(dirname(output), { recursive: true });
    const args = ["-i", entry.path];
    if (options.audioBitrate) args.push("-ab", options.audioBitrate);
    if (options.videoBitrate) args.push("-vb", options.videoBitrate);
    if (options.videoCodec) args.push("-c:v", options.videoCodec);
    if (options.audioCodec) args.push("-c:a", options.audioCodec);
    if (options.fps) args.push("-r", options.fps);
    if (options.videoFilter) args.push("-vf", options.videoFilter);
    const result = await new Deno.Command("ffmpeg", {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      args: args.concat(["-y", output]),
    }).output();
    if (!result.success) throw new Error(`ffmpeg failed for ${entry.path}`);
    if (options.deleteSource) await Deno.remove(entry.path);
    converted++;
  }
  return converted;
}

function replaceExt(path: string, ext: string): string {
  const index = path.lastIndexOf(".");
  return `${index >= 0 ? path.slice(0, index) : path}.${ext}`;
}
