import { createCanvas, Image } from "jsr:@gfx/canvas@0.5.8";
import { extract } from 'jsr:@quentinadam/zip';
import { exists, existsSync } from "./main.ts";

// @ts-ignore ?
if(self.postMessage && import.meta.main){
    // @ts-ignore ?
    self.onmessage = async (e) => {
        const [fpath, fbase, wid] = e.data;
        console.log(`Worker #${wid}: processing ${fpath}`);
        try{
            await cbz2jpg2(await Deno.readFile(fpath), fbase);
        }catch(e){
            console.log(`Worker #${wid}: error processing ${fpath}: ${e instanceof Error? e.message : e}`);
        }
        // @ts-ignore ?
        self.postMessage({ data: 1 });
    }
    import.meta.main = false;
    // @ts-ignore ?
    self.postMessage({ data: 0 });
}

export default async function cbz2jpg(imgfiles: {
    name: string;
    data: Uint8Array;
    lastModification?: Date;
}[], outbasename: string = 'out') {
    const images = imgfiles.filter(e => e.data.byteLength > 16 * 1024).map(e => {
        try{
            return new Image(e.data)
        }catch(er){
            console.log(`Error loading image ${e.name}: ${er instanceof Error? er.message : er}`);
            return null;
        }
    }).filter(Boolean) as Image[];
    images.forEach((img, i) => img.onerror = e => {
        e.preventDefault();e.stopPropagation();
        console.log (`Error loading image ${i+1}: ${e instanceof Error? e.message : e}`);
        images.splice(images.findIndex(e => e === img), 1);
    });
    await new Promise(resolve => queueMicrotask(() => resolve(undefined)));
    const width = images.reduce((acc, img) => Math.max(acc, img.width), 0),
        totalHeight = images.reduce((acc, img) => acc + img.height, 0);

    if(width === 0 || totalHeight === 0) throw new Error('No images found in the cbz file');
    console.log(`Converting ${images.length} images to jpg(${width} x ${totalHeight})...`);

    const canvas = createCanvas(width, totalHeight);
    const ctx = canvas.getContext('2d');

    let y = 0;
    for (const img of images) {
        ctx.drawImage(img, 0, y);
        y += img.height;
    }

    // Maximum supported image dimension is 65500 pixels
    if(totalHeight > 65500){
        let sizeInEachImage;
        for(let i = 1;; i += 1){
            if(totalHeight < 65500 * i){
                // 均分，防止不均衡产生的空白
                sizeInEachImage = Math.floor(totalHeight / i);
                break;
            }
        }
        for(let i = 0; i < totalHeight; i += sizeInEachImage){
            const subCanvas = createCanvas(width, sizeInEachImage);
            const subCtx = subCanvas.getContext('2d');
            subCtx.drawImage(canvas, 0, i, width, sizeInEachImage, 0, 0, width, sizeInEachImage);
            subCanvas.save(outbasename + '_' + Math.floor(i / sizeInEachImage) + '.jpg', 'jpeg');
            console.log(`Saved ${outbasename}_${Math.floor(i / sizeInEachImage)}.jpg part ${i} -> ${i + sizeInEachImage}`);
        }
    }else{
        canvas.save(outbasename + '.jpg', 'jpeg');
        console.log(`Saved ${outbasename}.jpg`);
    }
    console.log(`Done!`);
}

async function cbz2jpg2(buffer: Uint8Array, outbasename: string = 'out'){
    return cbz2jpg(await extract(buffer), outbasename);
}

async function process(file: string) {
    await cbz2jpg2(await Deno.readFile(file), file.replace(/\.cbz?$/i, ''));
    console.log(`Done!`, file);
}

export async function main() {
    const $f = Deno.args[0];
    if(!await exists($f)){
        console.error(`File Or Directory not found: ${$f}`);
        Deno.exit(1);
    }

    const stat = Deno.statSync($f);
    if(stat.isDirectory){
        const files = Array.from(Deno.readDirSync($f)).filter(e => e.isFile && e.name.endsWith('.cbz') && !existsSync(`${$f}/${e.name.replace(/\.cbz?$/i, '.jpg')}`));
        if(files.length > navigator.hardwareConcurrency * 2){
            // 使用Worker加速
            const workers = Array.from({ length: navigator.hardwareConcurrency })
                .map(() => new Worker(import.meta.url, { type:'module' }));
            console.log(`Using ${workers.length} workers to process ${files.length} files...`);
            // wait for all workers to finish
            workers.forEach((w, i) => w.onmessage = () => {
                if(files.length === 0){
                    console.log(`All workers finished!`);
                    Deno.exit(0);
                }

                // 派发任务
                const task = files.shift()!;
                w.postMessage([task.name, `${$f}/${task.name.replace(/\.cbz?$/i, '')}`, i + 1]);
            });
        }else for (const entry of files){
            await process(`${$f}/${entry.name}`);
        }
    }else{
        await process($f);
    }    
}

if (import.meta.main) main();