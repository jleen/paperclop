import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'

let url = process.argv[2]
let resp = await fetch(url)
let html = await resp.text()
let doc = new JSDOM(html,
                    { url: url })
let reader = new Readability(doc.window.document)
let article = reader.parse()
let turndown = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*'
})
let md = turndown.turndown(article.content)

console.log(md)
