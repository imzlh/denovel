console.log('该网站繁体较多，建议使用"-t"翻译为简体中文');

export default {
    title: '#__layout > div > div > div.frame_body > div.title > h1',
    content: '#__layout > div > div > div.frame_body > div.content',
    // 特例:特隐蔽
    next_link: '#__layout > div > div > div.frame_body > div.next_page_links > a:nth-child(1)'
} satisfies TraditionalConfig;