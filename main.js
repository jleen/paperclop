#!/usr/bin/env -S deno run --allow-net --allow-write --allow-read

import { encodeHex } from '@std/encoding/hex';
import { extname, join } from '@std/path';

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import sanitize from 'sanitize-filename';
import TurndownService from 'turndown';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(Deno.args))
    .usage('Usage: $0 <url> [options]')
    .positional('url', {
        describe: 'URL to fetch and save',
        type: 'string'
    })
    .option('o', {
        alias: 'out',
        describe: 'Output filename (.md implied)',
        type: 'string'
    })
    .option('d', {
        alias: 'dir',
        describe: 'Output subdirectory for the markdown file',
        type: 'string'
    })
    .demandCommand(1, 'Please provide a URL')
    .help()
    .parse();

const url = argv._[0];

let response = await fetch(url);
let html = await response.text();
let dom = new JSDOM(html, { url: url });
let article = new Readability(dom.window.document).parse();
let doc = new JSDOM(article.content, { url: url }).window.document;
let images = [];

for (let img of doc.getElementsByTagName('img')) {
    let renamed = 'img_' + encodeHex(crypto.getRandomValues(new Uint8Array(8))) + extname(img.src.split('?')[0]);
    images.push({ src: img.src, target: renamed });
    img.src = renamed;
}

let turndown = new TurndownService({
    headingStyle: 'atx', hr: '---', bulletListMarker: '-',
    codeBlockStyle: 'fenced', emDelimiter: '*' });
let md = turndown.turndown(doc.documentElement.outerHTML);

let title = argv.out ?? sanitize(article.title.replace('/', '-'));
let outputPath = argv.dir ? join(argv.dir, `${title}.md`) : `${title}.md`;

// Create output directory if it doesn't exist
if (argv.dir) {
    await Deno.mkdir(argv.dir, { recursive: true });
}

await Deno.writeTextFile(outputPath, md, { createNew: true });
console.log(`${url} -> ${outputPath}`);

for (let img of images) {
    const fetched = await fetch(img.src);
    const file = await Deno.open(`Assets/${img.target}`, { write: true, createNew: true });
    await fetched.body.pipeTo(file.writable);
    console.log(`${img.src} -> ${img.target}`);
}
