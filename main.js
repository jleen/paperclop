import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { extname } from 'node:path';

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

let url = process.argv[2];
let response = await fetch(url);
let html = await response.text();
let dom = new JSDOM(html, { url: url });
let article = new Readability(dom.window.document).parse();

let doc = new JSDOM(article.content, { url: url }).window.document;
for (let img of doc.getElementsByTagName('img')) {
    let offlineImg = 'img' + Math.random() + extname(img.src);
    let imgresponse = await fetch(img.src);
    let body = Readable.fromWeb(imgresponse.body);
    await writeFile(`out/${offlineImg}`, body);
    console.log(`${img.src} -> ${offlineImg}`);
    img.src = offlineImg;
}

let turndown = new TurndownService({
    headingStyle: 'atx', hr: '---', bulletListMarker: '-',
    codeBlockStyle: 'fenced', emDelimiter: '*' });
let md = turndown.turndown(doc.documentElement.outerHTML);

await writeFile('out/article.md', md);
