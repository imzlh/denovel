import { processContent } from '../main.ts';

export default {
    "title": "body > div.main.readmain > div.bookname > h1",
    next_link: 'body > div.main.readmain > div.bookname > a:nth-child(6)',
    content: 'body > div.main.readmain > div.centent',
    filter(document, filled_data) {
        const dom = document.querySelector(this.content);
        dom?.querySelectorAll('a').forEach(a => a.remove());
        filled_data.content = processContent(dom);
    }
} satisfies TraditionalConfig;