#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env

import { extname, join } from "@std/path";
import { parseArgs } from "@std/cli/parse-args";
import { ensureDir } from "@std/fs";

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

interface ImageReference {
    src: string;
    target: string;
}

function sanitizeFilename(name: string): string {
    return name
        // deno-lint-ignore no-control-regex
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/^\.+/, '')
        .replace(/\.+$/, '')
        .trim()
        .slice(0, 255);
}

function generateImageName(imageUrl: string): string {
    const ext = extname(imageUrl.split('?')[0]);
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return 'img_' + randomHex + (ext || '');
}

function getExtensionFromContentType(contentType: string | null): string {
    const mimeToExt: Record<string, string> = {
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
    return (mimeType && mimeToExt[mimeType]) || '.jpeg';
}

async function downloadImages(images: ImageReference[], markdown: string): Promise<string> {
    let updatedMarkdown = markdown;

    for (const img of images) {
        const fetched = await fetch(img.src);
        const contentType = fetched.headers.get('content-type');

        // If the image name doesn't have an extension, add one based on content-type.
        let target = img.target;
        if (!extname(target)) {
            target += getExtensionFromContentType(contentType);
        }

        await ensureDir('Assets');
        const targetPath = `Assets/${target}`;

        // Write image file
        const arrayBuffer = await fetched.arrayBuffer();
        await Deno.writeFile(targetPath, new Uint8Array(arrayBuffer), { createNew: true });
        console.log(`${img.src} -> ${target}`);

        // Update markdown with the final filename (including extension).
        updatedMarkdown = updatedMarkdown.replace(`](${img.src})`, `](Assets/${target})`);
    }

    return updatedMarkdown;
}

function extractImageUrls(markdown: string): ImageReference[] {
    const images: ImageReference[] = [];
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;

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

// Parse command-line arguments
const args = parseArgs(Deno.args, {
    string: ['out', 'dir'],
    alias: { o: 'out', d: 'dir' },
    boolean: ['help'],
    default: { help: false },
});

if (args.help || args._.length === 0) {
    console.log(`
Usage: main.ts <url-or-file> [options]

Positional arguments:
  url-or-file    URL to fetch or local markdown file to process

Options:
  -o, --out      Output filename (.md implied)
  -d, --dir      Output subdirectory for the markdown file
  --help         Show this help message
`);
    Deno.exit(args._.length === 0 ? 1 : 0);
}

const input = String(args._[0]);

// Check if input is a local file path.
let isLocalFile = false;
try {
    await Deno.stat(input);
    isLocalFile = true;
} catch {
    // Not a local file, assume it's a URL.
}

let md: string;
let outputPath: string;

if (isLocalFile) {
    // Process local markdown file.
    const originalMd = await Deno.readTextFile(input);
    const images = extractImageUrls(originalMd);

    outputPath = input;

    // Backup original file.
    const backupPath = `${input}.old`;
    await Deno.rename(input, backupPath);
    console.log(`${input} -> ${backupPath}`);

    // Download images and get updated markdown with correct extensions.
    md = await downloadImages(images, originalMd);

    await Deno.writeTextFile(outputPath, md, { createNew: true });
    console.log(`${input} -> ${outputPath}`);

} else {
    // Process URL.
    const url = input;
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html, { url: url });
    const article = new Readability(dom.window.document).parse();

    if (!article) {
        console.error('Failed to parse article from URL');
        Deno.exit(1);
    }

    const doc = new JSDOM(article.content, { url: url }).window.document;

    const images: ImageReference[] = [];
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

    const title = args.out ?? sanitizeFilename((article.title || 'untitled').replace('/', '-'));
    outputPath = args.dir ? join(args.dir, `${title}.md`) : `${title}.md`;

    // Create output directory if it doesn't exist.
    if (args.dir) {
        await ensureDir(args.dir);
    }

    await Deno.writeTextFile(outputPath, md, { createNew: true });
    console.log(`${input} -> ${outputPath}`);
}
