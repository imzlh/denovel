import { createCanvas, Image } from "jsr:@gfx/canvas@0.5.8";
import { exists, existsSync } from "./main.ts";

if(self.postMessage && import.meta.main){
    self.onmessage = async (e) => {
        const [dir, rootDir, wid] = e.data;
        console.log(`Worker #${wid}: processing ${dir}`);
        try{
            await process(dir, rootDir);
        }catch(e){
            console.log(`Worker #${wid}: error processing ${dir}: ${e instanceof Error? e.message : e}`);
        }
        self.postMessage({ data: 1 });
    }
    import.meta.main = false;
    self.postMessage({ data: 0 });
}

export default async function imgmerge(imgfiles: {
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
    images.forEach((img, i) => {
        img.onerror = e => {
            e.preventDefault();e.stopPropagation();
            console.log (`Error loading image ${i+1}: ${e instanceof Error? e.message : e}`);
            images.splice(images.findIndex(e => e === img), 1);
        };
    });
    await new Promise(resolve => queueMicrotask(() => resolve(undefined)));
    const width = images.reduce((acc, img) => Math.max(acc, img.width), 0),
        totalHeight = images.reduce((acc, img) => acc + img.height, 0);

    if(width === 0 || totalHeight === 0) throw new Error('No images found');

    console.log(`Merging ${images.length} images to png(${width} x ${totalHeight})...`);

    const canvas = createCanvas(width, totalHeight);
    const ctx = canvas.getContext('2d');

    let y = 0;
    for (const img of images) {
        ctx.drawImage(img, 0, y);
        y += img.height;
    }

    canvas.save(outbasename + '.png', 'png');
    console.log(`Saved ${outbasename}.png`);
    console.log(`Done!`);
}

async function isImageFile(name: string): Promise<boolean> {
    const ext = name.toLowerCase().split('.').pop();
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext || '');
}

async function getAllDirs(dir: string, rootDir: string): Promise<string[]> {
    const dirs: string[] = [];
    const entries = Array.from(Deno.readDirSync(dir));
    
    for (const entry of entries) {
        if (entry.isDirectory) {
            const subdir = `${dir}/${entry.name}`;
            dirs.push(subdir);
            dirs.push(...await getAllDirs(subdir, rootDir));
        }
    }
    return dirs;
}

async function hasImages(dir: string): Promise<boolean> {
    const entries = Array.from(Deno.readDirSync(dir));
    for (const entry of entries) {
        if (entry.isFile && await isImageFile(entry.name)) {
            return true;
        }
    }
    return false;
}

async function process(dir: string, rootDir: string) {
    const relPath = dir.substring(rootDir.length).replace(/^[\\/]/, '');
    const basename = relPath.split('/').pop()?.split('\\').pop() || relPath || dir.split('/').pop()?.split('\\').pop() || dir;

    const allFiles = Array.from(Deno.readDirSync(dir)).filter(e => e.isFile);
    const imageFiles = [];
    for (const entry of allFiles) {
        if (await isImageFile(entry.name)) {
            imageFiles.push(entry);
        }
    }

    if (imageFiles.length > 0) {
        const sortedFiles = imageFiles.sort((a, b) => a.name.localeCompare(b.name));
        const imgfiles = [];
        for (const entry of sortedFiles) {
            const data = await Deno.readFile(`${dir}/${entry.name}`);
            imgfiles.push({ name: entry.name, data });
        }

        const outPath = relPath ? `dist/${relPath}` : 'dist';
        await imgmerge(imgfiles, outPath);
        console.log(`Done!`, relPath || dir);
    }
}

export async function main() {
    const $f = Deno.args[0];
    if(!await exists($f)){
        console.error(`Directory not found: ${$f}`);
        Deno.exit(1);
    }

    const stat = Deno.statSync($f);
    if(!stat.isDirectory){
        console.error(`Not a directory: ${$f}`);
        Deno.exit(1);
    }

    if(!await exists('dist')){
        await Deno.mkdir('dist', { recursive: true });
    }

    const allDirs = await getAllDirs($f, $f);
    const dirsWithImages = [];
    for (const d of allDirs) {
        if (await hasImages(d)) {
            dirsWithImages.push(d);
        }
    }

    if (dirsWithImages.length > 0) {
        const workers = Array.from({ length: navigator.hardwareConcurrency })
            .map(() => new Worker(import.meta.url, { type:'module' }));
        console.log(`Using ${workers.length} workers to process ${dirsWithImages.length} directories...`);
        
        workers.forEach((w, i) => {
            w.onmessage = () => {
                if(dirsWithImages.length === 0){
                    console.log(`All workers finished!`);
                    Deno.exit(0);
                }
                const task = dirsWithImages.shift()!;
                w.postMessage([task, $f, i + 1]);
            };
        });
    } else {
        await process($f, $f);
    }
}

if (import.meta.main) main();