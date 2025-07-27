/**
 * 各位朋友好，近期鲸落本人呢，也是毕业了，就业压力很大，不知道去做什么。深夜思来想去，不应该就此放弃，心里一直很苦闷
 * 不过我还是振作了起来，继续维护本项目的爱心，这是我的初心，有老板，或者家里有厂的，可以收留一下鲸落，
 * 鲸落不怕困难，就像这个项目，也会继续下去一样！有老板看到的，愿意提供帮助，可以添加我的个人qq1941282716，为了后续的维护和更新，请大家添加qq群784682454，
 * 鲸落在此谢过，深夜发帖，无奈之举，祝各位，工作顺利，身体健康！谢过。
 * 书源奉上：https://dns.jingluo.love/2025/684c7088c22b2.json
 * 网络导入
 */

const API = 'http://nuu2.jingluo.love/content?item_id=';

let init = false;
export async function download(id: string) {
    if(!init){
        console.log('这是鲸落的API。注意，千万不要滥用，这个API炸过2次了');
        console.log('详细信息请去看：https://www.jingluo.love/index.php/archives/93/');
        init = true;
    }
    /**
     * {
    "data": {
        "content": 
     */
    const res = await fetch(API + id);
    const data = await res.json();
    return data.data.content;
}