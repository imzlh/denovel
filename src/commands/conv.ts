import { CommandError } from "../../lib/core/errors.ts";
import { convertMedia } from "../../lib/media/convert.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel conv --from <glob> --to <format> [options]

Options:
  -i, --input <dir>       Input directory, default .
  -s, --recursive         Recurse into subdirectories
  -d, --delete            Delete source files after successful conversion
  --ab <value>            Audio bitrate
  --ac <codec>            Audio codec
  --vb <value>            Video bitrate
  --vc <codec>            Video codec
  --fps <value>           Output framerate
  --vf <filter>           ffmpeg video filter`);
    return;
  }
  const args = parse(argv);
  if (!args.from || !args.to) throw new CommandError("conv requires --from <glob> --to <format>", 2);
  const count = await convertMedia({
    inputDir: args.input ?? ".",
    fromGlob: args.from,
    toFormat: args.to,
    recursive: args.recursive,
    deleteSource: args.deleteSource,
    audioBitrate: args.ab,
    audioCodec: args.ac,
    videoBitrate: args.vb,
    videoCodec: args.vc,
    fps: args.fps,
    videoFilter: args.vf,
  });
  console.log(`Converted ${count} files.`);
}

interface Args {
  from?: string;
  to?: string;
  input?: string;
  recursive?: boolean;
  deleteSource?: boolean;
  ab?: string;
  ac?: string;
  vb?: string;
  vc?: string;
  fps?: string;
  vf?: string;
}

function parse(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-f":
      case "--from":
        args.from = argv[++i];
        break;
      case "-t":
      case "--to":
        args.to = argv[++i];
        break;
      case "-i":
      case "--input":
        args.input = argv[++i];
        break;
      case "-s":
      case "--recursive":
        args.recursive = true;
        break;
      case "-d":
      case "--delete":
        args.deleteSource = true;
        break;
      case "--ab":
        args.ab = argv[++i];
        break;
      case "--ac":
        args.ac = argv[++i];
        break;
      case "--vb":
        args.vb = argv[++i];
        break;
      case "--vc":
        args.vc = argv[++i];
        break;
      case "--fps":
        args.fps = argv[++i];
        break;
      case "--vf":
        args.vf = argv[++i];
        break;
      default:
        throw new CommandError(`Unknown conv option: ${arg}`, 2);
    }
  }
  return args;
}

export const command = {
  name: "conv",
  description: "Convert media/text formats",
  run,
};
