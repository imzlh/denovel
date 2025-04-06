// console.log('请将链接转换为mobile链接');
// const url = prompt('请输入链接 >> ');
// // https://book.sfacg.com/Novel/731099/967026/8866216/
// const pageURL = url?.match(/^https:\/\/book\.sfacg\.com\/Novel\/\d+\/\d+\/(\d+)\/?/);
// if(!pageURL) throw new Error('链接格式不正确');
// console.log('请重新输入为: https://m.sfacg.com/c/' + pageURL[1] + '/');
// Deno.exit(0);

export default {
    title: '#article > div.article-hd > h1',
    content: '#ChapterBody',
    next_link: '#article > div.fn-btn > a:nth-child(2)'
} satisfies TraditionalConfig;