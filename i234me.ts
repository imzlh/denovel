import { extname } from "node:path";
import { fetch2, getDocument, sleep } from "./main.ts";

const BOOK_SEL = 'body > div.container-fluid > div > div.col-sm-10 > div.discover.load-more > div > div.book';

interface Book {
    cover: string;
    entry: URL;
    author: string;
    name: string;
}

async function* getAllBooks(pnum: number){
    const url = 'http://chenakc.i234.me:5002/page/' + pnum;
    const document = await getDocument(url);
    const books = document.querySelectorAll(BOOK_SEL);
    if(books.length === 0){
        throw new Error('Reached end of book list：' + pnum);
    }
    for(const book of books){
        const img = book.querySelector('img');
        const link = book.querySelector('a');
        const title = book.querySelector('.title');
        const author = book.querySelector('.author');

        if(img && link && title && author){
            yield {
                entry: new URL(link.getAttribute('href')!, 'http://chenakc.i234.me:5002/'),
                name: title.textContent!,
                author: author.textContent!,
                cover: img.getAttribute('src')!
            } satisfies Book;
        }
    }
}

async function login(){
    const user = prompt('Username:');
    const pass = prompt('Password:');
    const url = 'http://chenakc.i234.me:5002/login';
    if(!user ||!pass) throw new Error('Username or password is empty');

    const form = new FormData();
    form.append('username', user);
    form.append('password', pass);
    form.append('remember_me', 'off');
    form.append('submit', '');

    // auto cache cookies
    const req = await fetch2(url, {
        method: 'POST',
        body: form
    });
    const res = await req.text();
    if(res.includes('用户名或密码错误')){
        throw new Error('Invalid username or password');
    }
}

async function download(book: Book) {
    const doc = await getDocument(book.entry);
    const els = Array.from(doc.querySelectorAll('.button-link[href]'));
    if(!els.length) throw new Error('No download link found');
    let el = els.find(el => el.getAttribute('href')?.includes('epub'))
    if(!el) el = els.find(el => el.getAttribute('href')?.includes('txt'));
    if(!el) el = els[0];

    const url = el.getAttribute('href')!;
    console.log('GET', url);
    const req = (await fetch2(new URL(url, book.entry))).body;
    if(!req) throw new Error('Failed to download book');
    return Deno.writeFile('./out/' + book.name + extname(url), req);
}

if(import.meta.main){
    await login();
    let i = 1;
    while(true){
        console.log(`Fetching page ${i}...`);
        for await(const book of getAllBooks(i)){
            try{
                console.log(`Downloading ${book.name}...`);
                await download(book);
            }catch(e){
                console.error(`Failed to download ${book.name}`, e);
            }

            await sleep(5 + 2 * Math.random());
        }
        i++;
        await sleep(8 * Math.random());
    }
}