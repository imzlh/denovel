import { DOMParser } from "jsr:@b-fuze/deno-dom@~0.1.49";
import { processContent, getDocument } from "../main.ts";

export default {
    "title": "#ss-reader-main > div.reader-main > h1",
    next_link: '#next_url',
    content: '#article',
    async filter(document, filled_data) {
        const [,, bid, pid] = filled_data.url.pathname.split('/'),
            [pid2, pageid] = pid.match(/^[_\d]+/)![0].split('_');
        const doctxt = await fetch(`https://fssom.com/api/reader_js.php`, {
            method: 'POST',
            body: `articleid=${bid}&chapterid=${pid2}&pid=${pageid || 1}`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        }).then(r => r.text());
        filled_data.content = processContent(
            new DOMParser().parseFromString(doctxt, 'text/html').body
        );
    },
} satisfies TraditionalConfig;