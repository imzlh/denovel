// ==UserScript==
// @name         Bing小说自动下载助手
// @namespace    http://github.com/imzlh/
// @downloadURL  https://raw.githubusercontent.com/imzlh/denovel/refs/heads/main/helper/helper.js
// @updateURL    https://raw.githubusercontent.com/imzlh/denovel/refs/heads/main/helper/helper.js
// @version      1.0
// @description  自动检测Bing搜索结果中的小说链接并支持一键下载
// @author       imzlh
// @match        https://www.bing.com/search*
// @icon         https://book.sfacg.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_notification
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    // 配置API端点
    const API_BASE = 'http://localhost:8000';
    const CHECK_URL_API = `${API_BASE}/api/check-url`;
    const PUSH_DOWNLOAD_API = `${API_BASE}/api/push-download`;

    // 添加自定义样式
    GM_addStyle(`
        .novel-indicator {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            background: #4a90e2;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            color: white;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            cursor: pointer;
            z-index: 9999;
            border: 2px solid white;
        }
        .novel-badge {
            display: inline-block;
            margin-left: 8px;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }
        .badge-ready {
            background: #2ecc71;
            color: white;
        }
        .badge-needs-info {
            background: #f39c12;
            color: white;
        }
        .badge-error {
            background: #e74c3c;
            color: white;
        }
        .b_algo {
            position: relative;
        }
        .novel-status {
            position: absolute;
            right: 15px;
            top: 15px;
        }
    `);

    // 检查是否包含小说关键词
    const containsNovelKeyword = (text) => {
        return /小说|novel|book|story|文学|连载|章节|阅读|小说网|书城|读书|文集|作品集/.test(text.toLowerCase());
    };

    // 分析搜索结果并自动检查
    const analyzeAndCheckResults = () => {
        const results = document.querySelectorAll('.b_algo');
        if (results.length === 0) return false;

        let hasNovelContent = false;
        const searchQuery = document.querySelector('input[name="q"]')?.value || '';

        // 检查搜索词
        if (containsNovelKeyword(searchQuery)) {
            hasNovelContent = true;
        }

        // 检查结果内容
        results.forEach((result, index) => {
            const title = result.querySelector('h2')?.textContent || '';
            const snippet = result.querySelector('.b_caption p')?.textContent || '';
            const url = result.querySelector('h2 a')?.href;

            if (url && (hasNovelContent || containsNovelKeyword(title + snippet))) {
                // 添加状态标记
                const statusDiv = document.createElement('div');
                statusDiv.className = 'novel-status';
                statusDiv.innerHTML = `<span class="novel-badge">检查中...</span>`;
                result.appendChild(statusDiv);

                // 自动检查URL
                setTimeout(() => checkUrl(url, statusDiv), index * 300); // 间隔300ms防止请求过猛
            }
        });

        return hasNovelContent;
    };

    // 检查URL状态
    const checkUrl = (url, statusElement) => {
        console.log('[denovel] Try', url);
        if(url.includes('bing.com'))
            GM_xmlhttpRequest({
                method: "GET",
                url,
                responseType: 'text',
                onload: function(response) {
                    if (response.status === 200) {
                        const data = response.response;
                        const match = data.match(/var\s+u\s+=\s+"([^"]+)";/);
                        if(match){
                            checkUrl2(match[1], statusElement);
                        }else{
                            showStatusError(statusElement, 'bing错误:无法获取真实地址');
                        }
                    } else {
                        showStatusError(statusElement, 'bing错误');
                    }
                },
                onerror: function(error) {
                    showStatusError(statusElement, '请求失败');
                    console.log(this)
                }
            });
        else
            checkUrl2(url, statusElement);
    };

    const checkUrl2 = (url, statusElement) => {
        GM_xmlhttpRequest({
            method: "POST",
            url: CHECK_URL_API,
            headers: {
                "Content-Type": "application/json"
            },
            data: JSON.stringify({ url }),
            responseType: "json",
            onload: function(response) {
                if (response.status === 200) {
                    const data = response.response;
                    updateStatusUI(url, data.needsInfo, statusElement);
                } else if(response.status == 400) {
                    console.log('No CONFIG', url, response.response);
                    showStatusError(statusElement, '没有配置');
                } else {
                    showStatusError(statusElement, 'HTTP' + response.status);
                }
            },
            onerror: function(error) {
                showStatusError(statusElement, '请求失败');
                console.log(this)
            }
        });
    }

    // 更新状态UI
    const updateStatusUI = (url, needsInfo, statusElement) => {
        if (needsInfo) {
            statusElement.innerHTML = `
                <span class="novel-badge badge-needs-info"
                      title="点击复制URL"
                      style="cursor:pointer">
                    信息不完整
                </span>
            `;
            statusElement.querySelector('.badge-needs-info').onclick = () => {
                GM_setClipboard(url, 'text');
                GM_notification({
                    title: '已复制URL',
                    text: '请粘贴到下载页补全信息',
                    timeout: 2000
                });
            };
        } else {
            statusElement.innerHTML = `
                <span class="novel-badge badge-ready"
                      title="点击推送下载"
                      style="cursor:pointer">
                    可下载
                </span>
            `;
            statusElement.querySelector('.badge-ready').onclick = () => pushDownload(url);
        }
    };

    // 显示错误状态
    const showStatusError = (statusElement, message) => {
        statusElement.innerHTML = `<span class="novel-badge badge-error">${message}</span>`;
    };

    // 推送下载
    const pushDownload = (url) => {
        GM_xmlhttpRequest({
            method: "GET",
            url: `${PUSH_DOWNLOAD_API}?url=${encodeURIComponent(url)}`,
            onload: function(response) {
                if (response.status === 200) {
                    GM_notification({
                        title: '下载任务已添加',
                        text: '小说已加入下载队列，请去管理页面点击"刷新队列"',
                        timeout: 2000
                    });
                } else {
                    GM_notification({
                        title: '下载失败',
                        text: '请稍后重试',
                        timeout: 2000
                    });
                }
            },
            onerror: function(error) {
                GM_notification({
                    title: '请求失败',
                    text: '无法连接到服务器',
                    timeout: 2000
                });
            }
        });
    };

    // 创建右下角指示器
    const createIndicator = () => {
        const indicator = document.createElement('div');
        indicator.className = 'novel-indicator';
        indicator.innerHTML = '📚';
        indicator.title = '小说下载助手';
        document.body.appendChild(indicator);
        indicator.onclick = () => GM_notification({
            title: 'DeNovel Helper',
            text: '@imzlh/denovel配套油猴脚本，轻松下载小说！',
            timeout: 3000
        });
        return indicator;
    };

    // 主函数
    const main = () => {
        if (!globalThis.location.href.includes('bing.com/search')) return;

        // 创建右下角指示器
        createIndicator();

        // 初始分析
        if (analyzeAndCheckResults()) {
            // 如果有小说内容，显示指示器
            document.querySelector('.novel-indicator').style.display = 'flex';
        } else {
            document.querySelector('.novel-indicator')?.remove();
        }
    };

    // 页面加载完成后执行
    if (document.readyState === 'complete') {
        main();
        let currentUrl = globalThis.location.href;
        setInterval(() => {
            if (globalThis.location.href !== currentUrl) {
                currentUrl = globalThis.location.href;
                console.log('URL changed:', currentUrl);
                main();
            }
        }, 1000);
    } else {
        globalThis.addEventListener('load', main);
    }
})();