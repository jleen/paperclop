import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'

let url = process.argv[2]
let resp = await fetch(url)
let html = await resp.text()
let dom = new JSDOM(html,
                    { url: url })
let reader = new Readability(dom.window.document)
let article = reader.parse()

let readableDom = new JSDOM(article.content, { url: url })
for (let img of readableDom.window.document.getElementsByTagName('img')) {
    let offlineImg = 'img' + Math.random()
    console.log(`${img.src} -> ${offlineImg}`)
    img.src = offlineImg
}

let turndown = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*'
})
let md = turndown.turndown(readableDom.window.document.documentElement.outerHTML)

console.log(md)
