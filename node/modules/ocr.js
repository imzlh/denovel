// @ts-check

import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import tesseract from 'tesseract.js';

const worker = await tesseract.createWorker(['chi', 'eng'], tesseract.OEM.LSTM_ONLY, {
    langPath: import.meta.dirname + '/../lang/'
});

/**
 * 
 * @param {import('http').IncomingMessage} req 
 * @param {import('http').ServerResponse} res 
 * @param {URL} url 
 */
export default async  function ocr(req, res, url) {
    const fpath = url.searchParams.get('fpath');
    if(!fpath) throw new Error('No file path provided');
    const fileCtx = await readFile(fpath);
    const rs = await worker.recognize(fileCtx);
    res.writeHead(200, {'Content-Type': 'text/plain'}).end(rs.data.text);
}

if (import.meta.main) {
    // test OCR
    const fctx = readFileSync('./test.png');
    const rs = await worker.recognize(fctx, {}, {
        ""
    });
    console.log(rs.data);
}