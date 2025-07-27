
function dp() {
let ck = String(cookie.getCookie("fanqienovel.com").match(/sessionid=([^;]*)/)?.[1] || '');
let match = chapter.bookUrl.match(/\?(fq_id|qm_id)=\d+/); 
let cid = match ? match[0] : '未匹配到';
let url = java.ajax(`${source.bookSourceUrl}bzplsj${cid}`);
let name = book.durChapterTitle;
let data = JSON.parse(url);
let zpurl = data[name]+'&key='+Map("密钥")+'&sessionid='+ck;
java.startBrowser(zpurl,name);
    }

function ck() {
let ck = String(this.cookie.getCookie("fanqienovel.com").match(/sessionid=([^;]*)/)?.[1] || '');
return ck;
}

function Map(e) {
    const { source } = this;
    var infomap = source.getLoginInfoMap();
    try {
        return String(infomap[e]);
    } catch (err) {
        return "";
    }
}

function W() {
    let W = String('7jK9pR2sL5qW').replace(/7|s|p|9|R|5/g, "");
        return W;
}

function getComments(type, content, bid, cid, version) {
    // 主函数
    const { java, cache } = this;
    //let date = String(Date.now()).match(/(\d{6}$)/)[1];
    try {
        let comments;
        let comcont = content.replace(/(<img[^>]*?>)\n/g, "$1").split("\n");
        if (type == "fq") {
            comments = java.ajax(`{{source.bookSourceUrl}}fqdlsj?item_id=${cid}&version=${version}`);
            //java.log(comments);
            let raw = JSON.parse(comments).data.data;
            Object.keys(raw).forEach((x) => {
                cache.putMemory(`fq-${bid}-${cid}-${x}-text`, comcont[x]);
                if (comcont[x]) comcont[x] += `<img src ="${this.createSvg(type, raw[x].count, "red", bid, cid, x, version)}">`;
            });
            return comcont.join("\n");
        } else {
            comments = java.ajax(`{{source.bookSourceUrl}}qmdlsj?book_id=${bid}&chapter_id=${cid}`);
            //java.log(comments);
            let raw = JSON.parse(comments).data.chapters[0].bubbles;
            raw.forEach((x, i) => {
                cache.putMemory(`qm-${bid}-${cid}-${i}-text`, comcont[i]);
                if (x.c > 0) {
                    comcont[i] += `<img src ="${this.createSvg(type, x.c, "red", bid, cid, x.p)}">`;
                }
            });
            return comcont.join("\n");
        }
    } catch (e) {
        java.log(e);
        return content;
    }
}

function createSvg(type, number, color, bid, cid, para, version) {
    let displayText = number > 99 ? "99+" : number;
    let date = Date.now().toString(); // 内部生成时间戳

let colorValue = this.source.getLoginInfoMap().get("颜色");
let ys = (colorValue == null || colorValue === "") ? "#0000ff" : String(colorValue);

let qpValue = this.source.getLoginInfoMap().get("气泡");
let qp = (qpValue == null || qpValue === "") ? "0" : String(qpValue);


let svg = '';
if (qp == "1") {
        svg = `<svg width="1000" height="1000" viewBox="0 0 2048 2048" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(300, 300) scale(1.85)">
    <path d="M541.866667 138.666667C324.266667 138.666667 147.2 315.733333 147.2 533.333333c0 61.866667 14.933333 119.466667 38.4 170.666667v145.066667c0 21.333333 17.066667 38.4 38.4 38.4h145.066667c51.2 25.6 108.8 38.4 170.666666 38.4 217.6 0 394.666667-177.066667 394.666667-394.666667 2.133333-215.466667-174.933333-392.533333-392.533333-392.533333z m0 729.6c-51.2 0-100.266667-10.666667-145.066667-34.133334l-12.8-6.4h-138.666667V691.2l-6.4-12.8c-21.333333-46.933333-34.133333-96-34.133333-145.066667 0-185.6 151.466667-334.933333 334.933333-334.933333s337.066667 149.333333 337.066667 334.933333c0 183.466667-151.466667 334.933333-334.933333 334.933334z"
fill="${ys}"
  />
  </g>
  <text x="1320" y="1450" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" font-size="550" fill="${ys}">${displayText}</text>
</svg>
`;
    } else if (qp == "2") {
        svg = `<svg width="800" height="800" viewBox="0 0 2200 2300" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(300, 440) scale(1.8)">
    <path d="M683.712 800l-89.408 148.992a96 96 0 0 1-164.608 0L340.288 800H192A160 160 0 0 1 32 640V192A160 160 0 0 1 192 32h640A160 160 0 0 1 992 192v448a160 160 0 0 1-160 160h-148.288z m148.288-64a96 96 0 0 0 96-96V192A96 96 0 0 0 832 96H192A96 96 0 0 0 96 192v448A96 96 0 0 0 192 736h184.512l108.032 180.096a32 32 0 0 0 54.912 0l108.032-180.096H832z" 
fill="${ys}"
transform="rotate(90 512 512)"
/>
  </g>
  <text x="1400" y="1520" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" font-size="550" fill="${ys}">${displayText}</text>
</svg>
`;
       
    } else if (qp == "0") {
svg = `<svg width="1000" height="800" xmlns="http://www.w3.org/2000/svg">
    <rect x="240" y="240" width="750" height="550" rx="250" ry="250" fill="none" stroke="${ys}" stroke-width="25"/>
    <text x="610" y="620" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" font-size="300" fill="${ys}">${displayText}</text>
</svg>
`
;
}


    let encodedSvg = this.java.base64Encode(svg);  

    return `data:image/svg+xml;base64,${encodedSvg},{"style":"text",'type':'fq','js':'showCmt("${type}","${bid}", "${cid}", "${para}", "${version}", ${date})'}`;
}

function showCmt(type, bid, cid, para, version, date) {
    const { java, cache } = this;
    if (type == "fq") {
        var mname = `fq-${bid}-${cid}-${para}`;
        var cname = "item_id";
        var pname = "para";
    } else if (type == "qm") {
        var mname = `qm-${bid}-${cid}-${para}`;
        var cname = "chapter_id";
        var pname = "paragraph_id";
    }

    let load = (cache.getFromMemory(mname) ?? "-").split("-");
    if (load[0] != "1" || load[1] != date) {
        cache.putMemory(mname, "1-" + date);
        //java.toast("跳过加载");
        return;
    }

    let apiUrl = `{{source.bookSourceUrl}}${type}dlpl?${cname}=${cid}&book_id=${bid}&${pname}=${para}&version=${version}&sessionid={{ck()}}&key={{Map("密钥")}}`;
    let title = cache.getFromMemory(mname + "-text") ?? "fqphp_段落评论";

    java.startBrowser(apiUrl, title);
}

function deviceType() {
  try {
    return !!java.androidId();
  } catch (e) {
    return false;
  }
}
let device = deviceType() ? 'android' : 'ios';
java.put("dev", device)
let url = baseUrl?.match(/&ts=([^&]*)/)?.[1] || null;

// 直接根据 url 和设备类型判断模式并赋值  
if (device === 'android') {  
  if (url === "听书") {  
    book.type = 32;  
    java.longToast("已自动切换为听书!");  
  } else if (url === "漫画") {  
    book.type = 64;  
    java.longToast("已自动切换为漫画!");  
  } else {  
    book.type = 8;  // 安卓普通阅读模式  
  }  
} else if (device === 'ios') {  
  if (url === "听书") {  
    book.type = 1;  
    java.longToast("已自动切换为听书!");  
  } else if (url === "漫画") {  
    book.type = 2;  
    java.longToast("已自动切换为漫画!");  
  } else if (url === "短剧") {  
    book.type = 3;  
    java.longToast("已自动切换为视频!");  
  }else {  
    book.type = 0;  // iOS 普通阅读模式  
  }  
}

let bid = baseUrl.match(/\?(fq|qm)_id=([^&]*)/)?.[2]
if (book.bookUrl.includes("fq_id")){
	var type = "fqbzpl"
	var cname = "item_id"
	} else if (book.bookUrl.includes("qm_id")) {
		var type = "qmbzpl"
		var cname = "chapter_id"
		}




JSON.parse(result).data.lists.map((x) => {
    let match = x.url.match(/item_id=([^&]+)|chapterId=\d+-(\d+)/);
let cid = match ? (match[1] || match[2]) : null;
    x.url = `data:chapterUrl;base64,${java.base64Encode(
        x.url
    )},{"type":"","js":"book ? result :'${source.bookSourceUrl}${type}?book_id=${bid}&${cname}=${cid}&version=${x.version?? ""}&sessionid=${ck()}&key=${Map("密钥")}'"}`;

   return x;
});

@js:
let url = java.hexDecodeToString(result);

let response = java.ajax( url + "&key=" + Map("密钥") + "&ban=" + W()
);

let content = JSON.parse(response).data.content;

if (java.get("dev") == "android" && url.includes("%E7%9F%AD%E5%89%A7") && book.durChapterIndex == chapter.index) {
	let dj = `{{source.bookSourceUrl}}dpurl?url=${chapter.bookUrl}&ban=${W()}&key=${Map("密钥")}`;
    java.startBrowser(dj,chapter.title);
    content = "刷新播放"; 
} else
if (java.get("dp") == "开启" && /fq_id|qm_id/.test(book.bookUrl) && String(content).length > 0) {
	  type = book.bookUrl.match(/(.{2})_id=/)[1]
	  content = content.replace(/\n+/g,"\n")
    bid = book.bookUrl.match(/(fq|qm)_id=(\d+)/)[2];
    cid = chapter.url.match(/(item_id|chapter_id)=(\w+)/)[2];
    version = chapter.url.match(/version=(\w+)/)?.[1];
    getComments(type, content, bid, cid, version);
} else {
    content;
};