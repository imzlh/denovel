// @ts-check

import { readFile } from 'fs/promises';
import scribe from 'scribe.js-ocr';

/**
 * 
 * @param {import('http').IncomingMessage} req 
 * @param {import('http').ServerResponse} res 
 * @param {URL} url 
 */
export default async  function ocr(req, res, url) {
    const fpath = url.searchParams.get('fpath');
    if(!fpath) throw new Error('No file path provided');
    const rs = await scribe.extractText([fpath], ['eng'], "text");
    res.writeHead(200, {'Content-Type': 'text/plain'})
        .end(rs);
}