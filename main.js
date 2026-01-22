#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile, rename, access, constants } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import process from "node:process";
import sanitize from 'sanitize-filename';
import TurndownService from 'turndown';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 <url-or-file> [options]')
    .positional('url-or-file', {
        describe: 'URL to fetch or local markdown file to process',
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
    .demandCommand(1, 'Please provide a URL or file path')
    .help()
    .parse();

const input = argv._[0];

function generateImageName(imageUrl) {
    const ext = extname(imageUrl.split('?')[0]);
    return 'img_' + randomBytes(8).toString('hex') + (ext || '');
}

function getExtensionFromContentType(contentType) {
    const mimeToExt = {
        'image/jpeg': '.jpeg',
        'image/jpg': '.jpeg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
        'image/bmp': '.bmp',
        'image/tiff': '.tiff',
        'image/x-icon': '.ico',
    };
    const mimeType = contentType?.split(';')[0].trim();
    return mimeToExt[mimeType] || '.jpeg';
}

async function downloadImages(images, markdown) {
    let updatedMarkdown = markdown;

    for (const img of images) {
        const fetched = await fetch(img.src);
        const contentType = fetched.headers.get('content-type');

        // If the image name doesn't have an extension, add one based on content-type.
        let target = img.target;
        if (!extname(target)) {
            target += getExtensionFromContentType(contentType);
        }

        const writeStream = createWriteStream(`Assets/${target}`, { flags: 'wx' });
        await pipeline(fetched.body, writeStream);
        console.log(`${img.src} -> ${target}`);

        // Update markdown with the final filename (including extension).
        updatedMarkdown = updatedMarkdown.replace(`](${img.src})`, `](Assets/${target})`);
    }

    return updatedMarkdown;
}

function extractImageUrls(markdown) {
    const images = [];
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;

    while ((match = imageRegex.exec(markdown)) !== null) {
        const imageUrl = match[2];

        // Skip if already a local path.
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
            continue;
        }

        const baseName = generateImageName(imageUrl);
        images.push({ src: imageUrl, target: baseName });
    }

    return images;
}

// Check if input is a local file path.
let isLocalFile = false;
try {
    await access(input, constants.R_OK);
    isLocalFile = true;
} catch {
    // Not a local file, assume it's a URL.
}

let md;
let outputPath;

if (isLocalFile) {
    // Process local markdown file.
    const originalMd = await readFile(input, 'utf-8');
    const images = extractImageUrls(originalMd);

    outputPath = input;

    // Backup original file.
    const backupPath = `${input}.old`;
    await rename(input, backupPath);
    console.log(`${input} -> ${backupPath}`);

    // Download images and get updated markdown with correct extensions.
    md = await downloadImages(images, originalMd);

    await writeFile(outputPath, md, { flag: 'wx' });
    console.log(`${input} -> ${outputPath}`);

} else {
    // Process URL.
    const url = input;
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html, { url: url });
    const article = new Readability(dom.window.document).parse();
    const doc = new JSDOM(article.content, { url: url }).window.document;

    const images = [];
    for (const img of doc.getElementsByTagName('img')) {
        const baseName = generateImageName(img.src);
        images.push({ src: img.src, target: baseName });
    }

    const turndown = new TurndownService({
        headingStyle: 'atx', hr: '---', bulletListMarker: '-',
        codeBlockStyle: 'fenced', emDelimiter: '*' });
    const initialMd = turndown.turndown(doc.documentElement.outerHTML);

    // Download images and get markdown with correct paths and extensions.
    md = await downloadImages(images, initialMd);

    const title = argv.out ?? sanitize(article.title.replace('/', '-'));
    outputPath = argv.dir ? join(argv.dir, `${title}.md`) : `${title}.md`;

    // Create output directory if it doesn't exist.
    if (argv.dir) {
        await mkdir(argv.dir, { recursive: true });
    }

    await writeFile(outputPath, md, { flag: 'wx' });
    console.log(`${input} -> ${outputPath}`);
}
