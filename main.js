#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { extname } from 'node:path';

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import sanitize from 'sanitize-filename';
import TurndownService from 'turndown';

let url = process.argv[2];
let response = await fetch(url);
let html = await response.text();
let dom = new JSDOM(html, { url: url });
let article = new Readability(dom.window.document).parse();
let doc = new JSDOM(article.content, { url: url }).window.document;
let images = [];

for (let img of doc.getElementsByTagName('img')) {
    let renamed = 'img_' + randomBytes(8).toString('hex') + extname(img.src.split('?')[0]);
    images.push({ src: img.src, target: renamed });
    img.src = renamed;
}

let turndown = new TurndownService({
    headingStyle: 'atx', hr: '---', bulletListMarker: '-',
    codeBlockStyle: 'fenced', emDelimiter: '*' });
let md = turndown.turndown(doc.documentElement.outerHTML);

let title = sanitize(article.title.replace('/', '-'));
await writeFile(`${title}.md`, md, { flag: 'wx' });
console.log(`${url} -> ${title}.md`);

for (let img of images) {
    let fetched = await fetch(img.src);
    let body = Readable.fromWeb(fetched.body);
    await writeFile(`Assets/${img.target}`, body, { flag: 'wx' });
    console.log(`${img.src} -> ${img.target}`);
}
