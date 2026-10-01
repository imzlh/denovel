import { createCanvas, Image } from "jsr:@gfx/canvas@0.5.8";
import { dirname } from "jsr:@std/path";

export interface ImageFile {
  name: string;
  data: Uint8Array;
}

export interface MergeOptions {
  outputBase: string;
  format: "jpeg" | "png";
  maxHeight?: number;
}

export async function mergeImagesVertically(files: ImageFile[], options: MergeOptions): Promise<string[]> {
  const images = files
    .filter((file) => file.data.byteLength > 16 * 1024)
    .map((file) => {
      try {
        return new Image(file.data);
      } catch {
        return undefined;
      }
    })
    .filter((image): image is Image => image !== undefined);

  await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
  const width = images.reduce((acc, image) => Math.max(acc, image.width), 0);
  const totalHeight = images.reduce((acc, image) => acc + image.height, 0);
  if (width === 0 || totalHeight === 0) throw new Error("No images found");

  const canvas = createCanvas(width, totalHeight);
  const ctx = canvas.getContext("2d");
  let y = 0;
  for (const image of images) {
    ctx.drawImage(image, 0, y);
    y += image.height;
  }

  await Deno.mkdir(dirname(options.outputBase), { recursive: true }).catch(() => undefined);
  const maxHeight = options.maxHeight ?? 65500;
  if (totalHeight <= maxHeight) {
    const output = `${options.outputBase}.${extension(options.format)}`;
    canvas.save(output, options.format);
    return [output];
  }

  const outputs: string[] = [];
  const parts = Math.ceil(totalHeight / maxHeight);
  const partHeight = Math.floor(totalHeight / parts);
  for (let top = 0, index = 0; top < totalHeight; top += partHeight, index++) {
    const height = Math.min(partHeight, totalHeight - top);
    const subCanvas = createCanvas(width, height);
    const subCtx = subCanvas.getContext("2d");
    subCtx.drawImage(canvas, 0, top, width, height, 0, 0, width, height);
    const output = `${options.outputBase}_${index}.${extension(options.format)}`;
    subCanvas.save(output, options.format);
    outputs.push(output);
  }
  return outputs;
}

function extension(format: "jpeg" | "png"): string {
  return format === "jpeg" ? "jpg" : "png";
}
