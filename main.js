import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'

let html = '<h1>Greetings, creatures of wherewhen</h1>Greetings from <font size="50">beyondbetween</font>'
let doc = new JSDOM(html,
                    { url: 'https://nyan.cat'})
let reader = new Readability(doc.window.document)
let article = reader.parse()
let md = new TurndownService().turndown(article.content)
console.log(md)
