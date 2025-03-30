import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import threading
import os
import sys
import time
from tqdm import tqdm
import requests
import bs4
import re
import random
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm as tqdm_original
from collections import OrderedDict

# 全局配置
CONFIG = {
    "max_workers": 5,
    "max_retries": 3,
    "request_timeout": 15,
    "status_file": "chapter.json",
    "user_agents": [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ],
    "api_sources": {
        "primary": "http://rehaofan.jingluo.love",
        "backup": "https://api.cenguigui.cn/api/tomato/api",
        "search": "https://api.cenguigui.cn/api/tomato/api/search.php",
        "detail": "https://api.cenguigui.cn/api/tomato/api/detail.php",
        "catalog": "https://api.cenguigui.cn/api/tomato/api/catalog.php",
        "all_items": "https://api.cenguigui.cn/api/tomato/api/all_items.php",
        "content": "https://api.cenguigui.cn/api/tomato/api/content.php",
        "multi_content": "https://api.cenguigui.cn/api/tomato/api/multi_content.php",
        "multi_detail": "https://api.cenguigui.cn/api/tomato/api/multi-detail.php",
        "item_summary": "https://api.cenguigui.cn/api/tomato/api/item_summary.php",
        "category_front": "https://api.cenguigui.cn/api/tomato/api/category-front.php",
        "audio": "https://api.cenguigui.cn/api/tomato/api/audio.php"
    }
}

# 全局变量，存储GUI进度相关变量
GLOBAL_PROGRESS_VAR = None
GLOBAL_PROGRESS_LABEL = None

# 全局变量，用于GUI覆盖tqdm
tqdm = tqdm_original  # 默认使用原始tqdm，GUI会覆盖此变量

def get_headers(cookie=None):
    """生成随机请求头"""
    return {
        "User-Agent": random.choice(CONFIG["user_agents"]),
        "Cookie": cookie if cookie else get_cookie()
    }

def get_cookie():
    """生成或加载Cookie"""
    cookie_path = "cookie.json"
    if os.path.exists(cookie_path):
        try:
            with open(cookie_path, 'r') as f:
                return json.load(f)
        except:
            pass
    
    # 生成新Cookie
    for _ in range(10):
        novel_web_id = random.randint(10**18, 10**19-1)
        cookie = f'novel_web_id={novel_web_id}'
        try:
            resp = requests.get(
                'https://fanqienovel.com',
                headers={"User-Agent": random.choice(CONFIG["user_agents"])},
                cookies={"novel_web_id": str(novel_web_id)},
                timeout=10
            )
            if resp.ok:
                with open(cookie_path, 'w') as f:
                    json.dump(cookie, f)
                return cookie
        except Exception as e:
            print(f"Cookie生成失败: {str(e)}")
            time.sleep(0.5)
    raise Exception("无法获取有效Cookie")

def down_text(it, mod=1):
    """下载章节内容"""
    max_retries = CONFIG.get('max_retries', 3)
    retry_count = 0
    content = ""
    
    while retry_count < max_retries:
        try:
            # 尝试使用主API获取内容
            api_url = f"{CONFIG['api_sources']['primary']}/content?item_id={it}"
            response = requests.get(api_url, timeout=CONFIG["request_timeout"])
            data = response.json()
            
            if data.get("code") == 0 and data.get("data", {}).get("content", ""):
                content = data.get("data", {}).get("content", "")
            else:
                # 如果主API失败，尝试直接使用content API
                content_api_url = f"{CONFIG['api_sources']['content']}?item_id={it}"
                response = requests.get(content_api_url, timeout=CONFIG["request_timeout"])
                data = response.json()
                if data.get("code") == 0:
                    content = data.get("data", {}).get("content", "")
                    
                # 如果仍然失败，尝试备用API
                if not content:
            # if True:
            #     if True:
                    backup_api_url = f"{CONFIG['api_sources']['backup']}/content.php?item_id={it}"
                    response = requests.get(backup_api_url, timeout=CONFIG["request_timeout"])
                    data = response.json()
                    if data.get("code") == 0:
                        content = data.get("data", {}).get("content", "")
            
            if content:
                # 移除HTML标签
                content = re.sub(r'<header>.*?</header>', '', content, flags=re.DOTALL)
                content = re.sub(r'<footer>.*?</footer>', '', content, flags=re.DOTALL)
                content = re.sub(r'</?article>', '', content)
                content = re.sub(r'<p idx="\d+">', '\n', content)
                content = re.sub(r'</p>', '\n', content)
                content = re.sub(r'<[^>]+>', '', content)
                content = re.sub(r'\\u003c|\\u003e', '', content)
                content = re.sub(r'\n{2,}', '\n', content).strip()
                content = '\n'.join(['    ' + line if line.strip() else line for line in content.split('\n')])
                break
        except Exception as e:
            print(f"请求失败: {str(e)}, 重试第{retry_count + 1}次...")
            retry_count += 1
            time.sleep(1 * retry_count)
    
    return content

def get_book_info(book_id, headers):
    """获取书名、作者、简介"""
    # 首先尝试从网页获取信息
    url = f'https://fanqienovel.com/page/{book_id}'
    try:
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            soup = bs4.BeautifulSoup(response.text, 'html.parser')
            
            # 获取书名
            name_element = soup.find('h1')
            name = name_element.text if name_element else None
            
            # 获取作者
            author_name_element = soup.find('div', class_='author-name')
            author_name = None
            if author_name_element:
                author_name_span = author_name_element.find('span', class_='author-name-text')
                author_name = author_name_span.text if author_name_span else None
            
            # 获取简介
            description_element = soup.find('div', class_='page-abstract-content')
            description = None
            if description_element:
                description_p = description_element.find('p')
                description = description_p.text if description_p else None
            
            if name and author_name and description:
                return name, author_name, description
    except Exception as e:
        print(f"从网页获取书籍信息失败: {str(e)}")
    
    # 如果网页获取失败，尝试使用detail API获取
    try:
        detail_api_url = f"{CONFIG['api_sources']['detail']}?book_id={book_id}"
        response = requests.get(detail_api_url, timeout=CONFIG["request_timeout"])
        data = response.json()
        
        if data.get("code") == 0 and data.get("data"):
            book_data = data.get("data", {})
            name = book_data.get("book_name", "未知书名")
            author_name = book_data.get("author_name", "未知作者")
            description = book_data.get("abstract", "无简介")
            return name, author_name, description
    except Exception as e:
        print(f"从detail API获取书籍信息失败: {str(e)}")
    
    # 如果detail API也失败，尝试使用备用API
    try:
        backup_api_url = f"{CONFIG['api_sources']['backup']}/detail.php?book_id={book_id}"
        response = requests.get(backup_api_url, timeout=CONFIG["request_timeout"])
        data = response.json()
        
        if data.get("code") == 0 and data.get("data"):
            book_data = data.get("data", {})
            name = book_data.get("book_name", "未知书名")
            author_name = book_data.get("author_name", "未知作者")
            description = book_data.get("abstract", "无简介")
            return name, author_name, description
    except Exception as e:
        print(f"从备用API获取书籍信息失败: {str(e)}")
    
    print(f"无法获取书籍信息，状态码: {response.status_code if 'response' in locals() else '未知'}")
    return "未知书名", "未知作者", "无简介"

def extract_chapters(soup):
    """解析章节列表"""
    chapters = []
    for idx, item in enumerate(soup.select('div.chapter-item')):
        a_tag = item.find('a')
        if not a_tag:
            continue
        
        raw_title = a_tag.get_text(strip=True)
        
        # 特殊章节
        if re.match(r'^(番外|特别篇|if线)\s*', raw_title):
            final_title = raw_title
        else:
            clean_title = re.sub(
                r'^第[一二三四五六七八九十百千\d]+章\s*',
                '', 
                raw_title
            ).strip()
            final_title = f"第{idx+1}章 {clean_title}"
        
        chapters.append({
            "id": a_tag['href'].split('/')[-1],
            "title": final_title,
            "url": f"https://fanqienovel.com{a_tag['href']}",
            "index": idx
        })
    
    # 检查章节顺序
    expected_indices = set(range(len(chapters)))
    actual_indices = set(ch["index"] for ch in chapters)
    if expected_indices != actual_indices:
        print("警告：章节顺序异常，可能未按阿拉伯数字顺序排列！")
        chapters.sort(key=lambda x: x["index"])
    
    return chapters

def load_status(save_path):
    """加载下载状态"""
    status_file = os.path.join(save_path, CONFIG["status_file"])
    if os.path.exists(status_file):
        try:
            with open(status_file, 'r') as f:
                return set(json.load(f))
        except:
            pass
    return set()

def save_status(save_path, downloaded):
    """保存下载状态"""
    status_file = os.path.join(save_path, CONFIG["status_file"])
    with open(status_file, 'w') as f:
        json.dump(list(downloaded), f)

def download_chapter(chapter, headers, save_path, book_name, downloaded):
    """下载单个章节"""
    if chapter["id"] in downloaded:
        return None
    
    content = down_text(chapter["id"])
    if content:
        output_file_path = os.path.join(save_path, f"{book_name}.txt")
        with open(output_file_path, 'a', encoding='utf-8') as f:
            f.write(f'{chapter["title"]}\n')
            f.write(content + '\n\n')
        downloaded.add(chapter["id"])
        return chapter["index"], content
    return None

def search_novels(keyword, offset=0, limit=20):
    """搜索小说
    Args:
        keyword: 搜索关键词
        offset: 结果偏移量
        limit: 返回结果数量限制
        
    Returns:
        搜索结果列表，每个元素包含书名、作者、简介、封面URL等
    """
    try:
        # 使用search API搜索
        search_url = f"{CONFIG['api_sources']['search']}?query={keyword}&offset={offset}"
        response = requests.get(search_url, timeout=CONFIG["request_timeout"])
        data = response.json()
        
        if data.get("code") == 0 and data.get("data", {}).get("search_book_list"):
            results = []
            books = data.get("data", {}).get("search_book_list", [])
            
            for book in books[:limit]:
                results.append({
                    "book_id": book.get("book_id"),
                    "name": book.get("book_name", "未知书名"),
                    "author": book.get("author_name", "未知作者"),
                    "description": book.get("abstract", "无简介"),
                    "cover_url": book.get("cover_url", ""),
                    "category": book.get("category_name", "未知分类"),
                    "word_count": book.get("word_count", 0),
                    "score": book.get("score", 0)
                })
            
            return results
    except Exception as e:
        print(f"搜索小说失败: {str(e)}")
    
    return []

def Run(book_id, save_path):
    """运行下载"""
    headers = get_headers()
    
    # 获取书籍信息
    name, author_name, description = get_book_info(book_id, headers)
    if name == "未知书名":
        print("无法获取书籍信息，请检查小说ID或网络连接。")
        return

    # 尝试获取章节列表
    chapters = []
    try:
        # 首先尝试从网页获取章节列表
        url = f'https://fanqienovel.com/page/{book_id}'
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            soup = bs4.BeautifulSoup(response.text, 'lxml')
            chapters = extract_chapters(soup)
    except Exception as e:
        print(f"从网页获取章节列表失败: {str(e)}")
    
    # 如果网页获取失败，尝试使用all_items API获取完整章节列表
    if not chapters:
        try:
            all_items_url = f"{CONFIG['api_sources']['all_items']}?book_id={book_id}"
            response = requests.get(all_items_url, timeout=CONFIG["request_timeout"])
            data = response.json()
            
            if data.get("code") == 0 and data.get("data", {}).get("item_list"):
                ch_list = data.get("data", {}).get("item_list", [])
                for idx, ch in enumerate(ch_list):
                    chapters.append({
                        "id": ch.get("item_id"),
                        "title": f"第{idx+1}章 {ch.get('title')}",
                        "url": None,
                        "index": idx
                    })
                print(f"从all_items API获取到 {len(chapters)} 个章节")
        except Exception as e:
            print(f"从all_items API获取章节列表失败: {str(e)}")
    
    # 如果all_items API获取失败，尝试使用catalog API
    if not chapters:
        try:
            catalog_url = f"{CONFIG['api_sources']['catalog']}?book_id={book_id}"
            response = requests.get(catalog_url, timeout=CONFIG["request_timeout"])
            data = response.json()
            
            if data.get("code") == 0 and data.get("data", {}).get("chapter_list"):
                ch_list = data.get("data", {}).get("chapter_list", [])
                for idx, ch in enumerate(ch_list):
                    chapters.append({
                        "id": ch.get("item_id"),
                        "title": f"第{idx+1}章 {ch.get('title')}",
                        "url": None,
                        "index": idx
                    })
                print(f"从catalog API获取到 {len(chapters)} 个章节")
        except Exception as e:
            print(f"从catalog API获取章节列表失败: {str(e)}")
    
    # 如果前面的API都失败，尝试使用备用API
    if not chapters:
        try:
            backup_api_url = f"{CONFIG['api_sources']['backup']}/catalog.php?book_id={book_id}"
            response = requests.get(backup_api_url, timeout=CONFIG["request_timeout"])
            data = response.json()
            
            if data.get("code") == 0 and data.get("data", {}).get("chapter_list"):
                ch_list = data.get("data", {}).get("chapter_list", [])
                for idx, ch in enumerate(ch_list):
                    chapters.append({
                        "id": ch.get("item_id"),
                        "title": f"第{idx+1}章 {ch.get('title')}",
                        "url": None,
                        "index": idx
                    })
                print(f"从备用API获取到 {len(chapters)} 个章节")
        except Exception as e:
            print(f"从备用API获取章节列表失败: {str(e)}")
    
    if not chapters:
        print("无法获取章节列表，请检查小说ID或网络连接。")
        return
    
    # 确保保存路径存在
    if not os.path.exists(save_path):
        os.makedirs(save_path)
    
    # 加载已下载状态
    downloaded = load_status(save_path)
    
    # 创建或覆盖输出文件
    output_file_path = os.path.join(save_path, f"{name}.txt")
    with open(output_file_path, 'w', encoding='utf-8') as f:
        # 写入书籍信息
        f.write(f"《{name}》\n")
        f.write(f"作者: {author_name}\n\n")
        f.write(f"简介:\n{description}\n\n")
        f.write("=" * 30 + "\n\n")
    
    print(f"\n开始下载《{name}》，共 {len(chapters)} 章\n")
    print(f"已下载 {len(downloaded)} 章，待下载 {len(chapters) - len([ch for ch in chapters if ch['id'] in downloaded])} 章\n")
    
    # 多线程下载
    max_workers = CONFIG.get("max_workers", 5)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # 提交所有下载任务
        future_to_chapter = {
            executor.submit(download_chapter, chapter, headers, save_path, name, downloaded): chapter
            for chapter in chapters
        }
        
        # 确保使用正确的tqdm实例
        from tqdm import tqdm as tqdm_func
        # 使用tqdm显示进度条
        with tqdm_func(total=len(chapters), desc="下载进度") as pbar:
            completed_count = len(downloaded)
            pbar.update(completed_count)
            
            for future in as_completed(future_to_chapter):
                result = future.result()
                if result:
                    chapter_idx, _ = result
                    pbar.update(1)
                    
                    # 每下载5章保存一次状态
                    completed_count += 1
                    if completed_count % 5 == 0:
                        save_status(save_path, downloaded)
    
    # 最后保存状态
    save_status(save_path, downloaded)
    
    print(f"\n下载完成！文件保存在：{output_file_path}\n")
    print(f"总章节数: {len(chapters)}, 成功下载: {len(downloaded)}\n")
    
    # 返回下载结果信息
    return {
        "book_name": name,
        "author": author_name,
        "total_chapters": len(chapters),
        "downloaded_chapters": len(downloaded),
        "file_path": output_file_path
    }

class RedirectText:
    """用于重定向输出到GUI的类"""
    def __init__(self, text_widget):
        self.text_widget = text_widget
        self.buffer = ""

    def write(self, string):
        if string is None:
            string = "None"  # 处理None值情况
        self.buffer += string
        # 在UI线程上安全更新
        if self.text_widget and hasattr(self.text_widget, 'after'):
            self.text_widget.after(10, self.update_text_widget)
    
    def update_text_widget(self):
        if not self.text_widget or not hasattr(self.text_widget, 'config'):
            return  # 如果text_widget无效则直接返回
        try:
            self.text_widget.config(state=tk.NORMAL)
            self.text_widget.insert(tk.END, self.buffer)
            self.text_widget.see(tk.END)  # 自动滚动到最新内容
            self.text_widget.config(state=tk.DISABLED)
            self.buffer = ""
        except Exception as e:
            print(f"更新文本控件时出错: {str(e)}", file=sys.__stdout__)

    def flush(self):
        pass

class CustomTqdm(tqdm_original):
    """自定义tqdm进度条，将更新发送到GUI"""
    def __init__(self, *args, **kwargs):
        # 使用最基本的初始化，防止出现问题
        super().__init__(*args, **kwargs)
        self._last_update_time = 0
        self._update_interval = 0.1  # 更新UI的间隔时间（秒）

    def update(self, n=1):
        try:
            # 调用原始tqdm的update方法
            displayed = super().update(n)
            
            # 限制更新频率，避免UI卡顿
            current_time = time.time()
            if current_time - self._last_update_time > self._update_interval:
                self._last_update_time = current_time
                
                # 仅在全局进度变量可用时更新UI
                global GLOBAL_PROGRESS_VAR, GLOBAL_PROGRESS_LABEL
                if GLOBAL_PROGRESS_VAR and hasattr(GLOBAL_PROGRESS_VAR, 'set'):
                    try:
                        # 安全地计算百分比并在主线程中更新UI
                        self._update_ui_safely()
                    except Exception as e:
                        print(f"进度条更新出错: {str(e)}", file=sys.__stdout__)
            
            return displayed
        except Exception as e:
            print(f"tqdm.update出错: {str(e)}", file=sys.__stdout__)
            return False
    
    def _update_ui_safely(self):
        """安全地计算百分比并准备更新UI"""
        try:
            # 计算百分比
            if self.total and self.total > 0:
                percentage = min(100, max(0, int(self.n / self.total * 100)))
            else:
                percentage = 0
            
            # 使用调度器在主线程中更新UI
            self._schedule_ui_update(percentage)
        except Exception as e:
            print(f"准备UI更新时出错: {str(e)}", file=sys.__stdout__)
    
    def _schedule_ui_update(self, percentage):
        """使用tkinter调度器在主线程中更新UI"""
        import tkinter as tk
        global GLOBAL_PROGRESS_VAR, GLOBAL_PROGRESS_LABEL
        
        # 找到根窗口
        root = None
        if GLOBAL_PROGRESS_VAR and hasattr(GLOBAL_PROGRESS_VAR, '_root'):
            try:
                root = GLOBAL_PROGRESS_VAR._root()
            except:
                pass
        elif GLOBAL_PROGRESS_LABEL and hasattr(GLOBAL_PROGRESS_LABEL, 'winfo_toplevel'):
            try:
                root = GLOBAL_PROGRESS_LABEL.winfo_toplevel()
            except:
                pass
        
        # 如果找到了根窗口，在主线程中调度更新
        if root and isinstance(root, tk.Tk):
            try:
                root.after(0, self._do_update, percentage)
            except Exception as e:
                print(f"调度UI更新时出错: {str(e)}", file=sys.__stdout__)
    
    def _do_update(self, percentage):
        """在主线程中执行UI更新"""
        try:
            global GLOBAL_PROGRESS_VAR, GLOBAL_PROGRESS_LABEL
            
            # 更新进度条
            if GLOBAL_PROGRESS_VAR and hasattr(GLOBAL_PROGRESS_VAR, 'set'):
                GLOBAL_PROGRESS_VAR.set(percentage)
            
            # 更新标签文本
            if GLOBAL_PROGRESS_LABEL and hasattr(GLOBAL_PROGRESS_LABEL, 'configure'):
                text = f"下载进度: {percentage}% ({self.n}/{self.total or '?'})"
                GLOBAL_PROGRESS_LABEL.configure(text=text)
        except Exception as e:
            print(f"更新UI时出错: {str(e)}", file=sys.__stdout__)
    
    def refresh(self, *args, **kwargs):
        """强制刷新进度条，接受任意参数以兼容tqdm内部调用"""
        try:
            self._update_ui_safely()
        except Exception as e:
            print(f"刷新进度条时出错: {str(e)}", file=sys.__stdout__)

# 使用自定义进度条替换原始tqdm
def set_custom_tqdm():
    """设置全局tqdm为自定义版本"""
    # 此处不直接替换全局tqdm变量，而是在GUI类内部使用全局变量
    # 让Run函数使用原始tqdm实现，避免类型错误
    pass

class NovelDownloaderGUI(tk.Tk):
    def __init__(self):
        """初始化应用程序界面和设置"""
        try:
            super().__init__()
            self.title("番茄小说下载器 - 精简版")
            self.geometry("800x600")
            self.minsize(600, 450)  # 设置最小窗口大小
            self.resizable(True, True)
            self.protocol("WM_DELETE_WINDOW", self.on_closing)
            
            # 添加版本信息
            self.version = "1.2.1"
            
            # 状态变量
            self.is_downloading = False
            self.download_thread = None
            self.last_settings = {}  # 用于存储上次的设置
            
            # 初始化日志记录
            import logging
            self.logger = logging.getLogger("TomatoNovelDownloader.GUI")
            self.logger.info(f"GUI初始化开始，版本: {self.version}")
            
            # 设置变量
            self.threads_var = tk.StringVar(value="5")
            self.format_var = tk.StringVar(value="txt")
            
            # 创建控件前尝试加载配置
            self.load_settings()
            
            # 设置样式主题
            self.setup_style()
            
            # 创建UI控件
            self.create_widgets()
            
            # 设置图标（如果有的话）
            self.setup_icon()
            
            # 监听格式选择变化
            self.format_var.trace_add("write", self.on_format_changed)
            
            # 检查ebooklib可用性（如果需要）
            if self.format_var.get() == "epub":
                self.check_ebooklib_available()
            
            # 设置键盘快捷键
            self.bind("<Control-d>", lambda e: self.start_download())
            self.bind("<F1>", lambda e: self.show_help())
            
            self.logger.info("GUI初始化完成")
            
        except Exception as e:
            import traceback
            print(f"GUI初始化失败: {str(e)}")
            print(traceback.format_exc())
            # 失败时尝试显示消息框
            try:
                messagebox.showerror("初始化错误", f"应用程序初始化失败:\n{str(e)}")
            except:
                pass
            raise  # 重新抛出异常，让全局异常处理器捕获
    
    def setup_icon(self):
        """设置应用图标"""
        icon_paths = [
            "icon.ico",                        # 当前目录
            os.path.join("assets", "icon.ico"), # assets子目录
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "icon.ico")  # 脚本目录
        ]
        
        for icon_path in icon_paths:
            try:
                if os.path.exists(icon_path):
                    self.iconbitmap(icon_path)
                    self.logger.info(f"成功加载图标: {icon_path}")
                    return
            except Exception as e:
                self.logger.warning(f"加载图标失败: {icon_path} - {str(e)}")
        
        # 如果没有找到图标，使用默认Tk图标
        self.logger.info("未找到图标文件，使用默认图标")
    
    def setup_style(self):
        """设置界面样式和主题"""
        style = ttk.Style()
        current_theme = style.theme_use()
        
        # 尝试使用更现代的主题
        available_themes = style.theme_names()
        preferred_themes = ['clam', 'alt', 'vista', 'xpnative', 'winnative']
        
        for theme in preferred_themes:
            if theme in available_themes:
                try:
                    style.theme_use(theme)
                    self.logger.info(f"使用主题: {theme}")
                    break
                except:
                    # 如果主题切换失败，回退到当前主题
                    style.theme_use(current_theme)
        
        # 自定义按钮样式
        style.configure('Primary.TButton', font=('Helvetica', 10, 'bold'))
        style.configure('Secondary.TButton', font=('Helvetica', 10))
        
        # 配置进度条样式
        style.configure("TProgressbar", thickness=20)
    
    def load_settings(self):
        """加载上次的设置"""
        try:
            import json
            settings_path = os.path.join(os.path.expanduser("~"), ".tomato_novel_settings.json")
            
            if os.path.exists(settings_path):
                with open(settings_path, 'r', encoding='utf-8') as f:
                    settings = json.load(f)
                    
                # 应用设置
                if 'threads' in settings and settings['threads']:
                    self.threads_var.set(str(settings['threads']))
                if 'format' in settings and settings['format']:
                    self.format_var.set(settings['format'])
                if 'last_path' in settings and settings['last_path']:
                    self.last_settings['save_path'] = settings['last_path']
                    
                self.logger.info("成功加载配置")
        except Exception as e:
            self.logger.warning(f"加载配置失败: {str(e)}")
    
    def save_settings(self):
        """保存当前设置供下次使用"""
        try:
            import json
            settings = {
                'threads': int(self.threads_var.get()),
                'format': self.format_var.get(),
                'last_path': self.save_path_entry.get() if hasattr(self, 'save_path_entry') else "",
                'last_used': time.strftime("%Y-%m-%d %H:%M:%S")
            }
            
            settings_path = os.path.join(os.path.expanduser("~"), ".tomato_novel_settings.json")
            with open(settings_path, 'w', encoding='utf-8') as f:
                json.dump(settings, f, ensure_ascii=False, indent=2)
                
            self.logger.info("成功保存配置")
        except Exception as e:
            self.logger.warning(f"保存配置失败: {str(e)}")
    
    def on_format_changed(self, *args):
        """响应格式选择变化"""
        if self.format_var.get() == "epub":
            self.check_ebooklib_available()
    
    def check_ebooklib_available(self):
        """检查是否安装了ebooklib库"""
        try:
            import ebooklib
            return True
        except ImportError:
            # 提示安装
            if messagebox.askyesno("需要安装依赖",
                                 "导出EPUB格式需要安装ebooklib库。\n是否现在安装？"):
                self.install_ebooklib()
            return False
    
    def show_help(self):
        """显示帮助信息"""
        help_text = """番茄小说下载器 - 使用说明

1. 小说ID：从番茄小说网址中获取，通常为数字
   例如：https://fanqienovel.com/page/12345 中的12345

2. 保存路径：小说文件保存的目录，默认在程序所在目录的novels文件夹

3. 线程数：下载使用的线程数量，默认为5
   • 线程数越多，下载速度可能越快
   • 但过多的线程可能导致被网站限制

4. 输出格式：
   • TXT格式：普通文本文件，适合任何阅读器
   • EPUB格式：电子书格式，适合Kindle等电子书阅读器
     (需要安装ebooklib库)

快捷键：
• Ctrl+D：开始下载
• F1：显示帮助

版本：{version}"""
        
        messagebox.showinfo("使用说明", help_text.format(version=self.version))
            
    def create_widgets(self):
        """创建并布局GUI控件"""
        # 创建顶部菜单栏
        self.create_menu()
        
        # 创建主框架
        main_frame = ttk.Frame(self, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # 左侧面板 - 输入信息
        left_panel = ttk.Frame(main_frame)
        left_panel.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # 创建输入区域
        input_frame = ttk.LabelFrame(left_panel, text="下载设置", padding="10")
        input_frame.pack(fill=tk.BOTH, expand=False, padx=0, pady=5)
        
        # 小说ID输入 - 使用更现代的布局
        id_frame = ttk.Frame(input_frame)
        id_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(id_frame, text="小说ID:", width=10).pack(side=tk.LEFT, padx=(0,5))
        
        id_entry_frame = ttk.Frame(id_frame)
        id_entry_frame.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        self.book_id_entry = ttk.Entry(id_entry_frame)
        self.book_id_entry.pack(fill=tk.X, expand=True)
        
        # ID提示
        id_tip_frame = ttk.Frame(input_frame)
        id_tip_frame.pack(fill=tk.X, pady=(0,8))
        ttk.Label(id_tip_frame, text="提示: 从番茄小说网址中获取，例如 fanqienovel.com/page/12345 中的12345",
                 font=("Arial", 8), foreground="#666666").pack(side=tk.LEFT, padx=(10,0))
                 
        # 保存路径输入
        path_frame = ttk.Frame(input_frame)
        path_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(path_frame, text="保存路径:", width=10).pack(side=tk.LEFT, padx=(0,5))
        
        self.save_path_entry = ttk.Entry(path_frame)
        self.save_path_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0,5))
        
        # 设置默认保存路径（尝试从上次设置中恢复）
        default_path = os.path.join(os.getcwd(), "novels")
        if hasattr(self, 'last_settings') and 'save_path' in self.last_settings:
            default_path = self.last_settings['save_path']
        self.save_path_entry.insert(0, default_path)
        
        browse_button = ttk.Button(path_frame, text="浏览...", command=self.browse_folder, width=8)
        browse_button.pack(side=tk.LEFT)
        
        # 创建设置框架
        settings_frame = ttk.Frame(input_frame)
        settings_frame.pack(fill=tk.X, pady=5)
        
        # 左侧 - 线程设置
        threads_settings = ttk.LabelFrame(settings_frame, text="线程数")
        threads_settings.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0,5))
        
        threads_frame = ttk.Frame(threads_settings)
        threads_frame.pack(fill=tk.X, padx=5, pady=5)
        
        # 使用更直观的滑块来设置线程数
        self.threads_scale = ttk.Scale(threads_frame, from_=1, to=10, orient=tk.HORIZONTAL,
                                      variable=self.threads_var, command=self.update_threads_label)
        self.threads_scale.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        self.threads_label = ttk.Label(threads_frame, text=f"{self.threads_var.get()} 线程", width=8)
        self.threads_label.pack(side=tk.LEFT, padx=5)
        
        # 右侧 - 格式设置
        format_settings = ttk.LabelFrame(settings_frame, text="输出格式")
        format_settings.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        format_frame = ttk.Frame(format_settings)
        format_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Radiobutton(format_frame, text="TXT文档", value="txt",
                        variable=self.format_var).pack(side=tk.LEFT, padx=5, pady=2)
        ttk.Radiobutton(format_frame, text="EPUB电子书", value="epub",
                        variable=self.format_var).pack(side=tk.LEFT, padx=5, pady=2)
        ttk.Radiobutton(format_frame, text="分章节TXT", value="chapter",
                        variable=self.format_var).pack(side=tk.LEFT, padx=5, pady=2)
        
        # 操作按钮区域
        action_frame = ttk.Frame(input_frame)
        action_frame.pack(fill=tk.X, pady=(10,0))
        
        help_button = ttk.Button(action_frame, text="帮助", command=self.show_help, width=10, style='Secondary.TButton')
        help_button.pack(side=tk.LEFT, padx=5)
        
        self.download_button = ttk.Button(action_frame, text="开始下载 (Ctrl+D)",
                                         command=self.start_download, width=20, style='Primary.TButton')
        self.download_button.pack(side=tk.RIGHT, padx=5)
        
        # 右侧面板 - 进度和日志
        right_panel = ttk.Frame(main_frame)
        right_panel.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # 进度区域
        progress_frame = ttk.LabelFrame(right_panel, text="下载进度", padding="10")
        progress_frame.pack(fill=tk.X, pady=(0,5))
        
        # 进度信息显示
        progress_info_frame = ttk.Frame(progress_frame)
        progress_info_frame.pack(fill=tk.X, pady=(0,5))
        
        self.progress_var = tk.IntVar()
        self.progress_percent = ttk.Label(progress_info_frame, text="0%", width=5)
        self.progress_percent.pack(side=tk.LEFT, padx=(0,5))
        
        self.progress_bar = ttk.Progressbar(progress_info_frame, orient=tk.HORIZONTAL,
                                           length=100, mode='determinate', variable=self.progress_var)
        self.progress_bar.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        # 进度状态
        status_frame = ttk.Frame(progress_frame)
        status_frame.pack(fill=tk.X, pady=(0,5))
        
        ttk.Label(status_frame, text="状态:").pack(side=tk.LEFT, padx=(0,5))
        self.progress_label = ttk.Label(status_frame, text="准备就绪")
        self.progress_label.pack(side=tk.LEFT, fill=tk.X)
        
        # 日志区域
        log_frame = ttk.LabelFrame(right_panel, text="下载日志", padding="10")
        log_frame.pack(fill=tk.BOTH, expand=True)
        
        # 创建带滚动条的文本框
        log_container = ttk.Frame(log_frame)
        log_container.pack(fill=tk.BOTH, expand=True)
        
        self.log_text = tk.Text(log_container, wrap=tk.WORD, height=12)
        self.log_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.log_text.config(state=tk.DISABLED, font=("Consolas", 9))
        
        # 自定义日志标签样式
        self.log_text.tag_configure("error", foreground="red")
        self.log_text.tag_configure("success", foreground="green")
        self.log_text.tag_configure("info", foreground="blue")
        self.log_text.tag_configure("warning", foreground="orange")
        
        scrollbar = ttk.Scrollbar(log_container, command=self.log_text.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.log_text.config(yscrollcommand=scrollbar.set)
        
        # 底部信息栏
        footer_frame = ttk.Frame(self)
        footer_frame.pack(side=tk.BOTTOM, fill=tk.X, padx=10, pady=5)
        
        version_label = ttk.Label(footer_frame, text=f"版本: {self.version}", font=("Arial", 8))
        version_label.pack(side=tk.LEFT)
        
        info_label = ttk.Label(footer_frame,
                              text="作者: POf-L | 基于DlmOS驱动 | GitHub: github.com/POf-L/Fanqie-Tomato-Downloader",
                              font=("Arial", 8), foreground="#666666")
        info_label.pack(side=tk.RIGHT)
    
    def create_menu(self):
        """创建菜单栏"""
        menubar = tk.Menu(self)
        self.config(menu=menubar)
        
        # 文件菜单
        file_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="文件", menu=file_menu)
        file_menu.add_command(label="开始下载", command=self.start_download, accelerator="Ctrl+D")
        file_menu.add_separator()
        file_menu.add_command(label="退出", command=self.on_closing)
        
        # 设置菜单
        settings_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="设置", menu=settings_menu)
        settings_menu.add_command(label="保存当前设置", command=self.save_settings)
        settings_menu.add_command(label="重置设置", command=self.reset_settings)
        
        # 帮助菜单
        help_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="帮助", menu=help_menu)
        help_menu.add_command(label="使用说明", command=self.show_help, accelerator="F1")
        help_menu.add_command(label="关于", command=self.show_about)
    
    def update_threads_label(self, *args):
        """更新线程数量显示标签"""
        try:
            thread_count = int(float(self.threads_var.get()))
            self.threads_var.set(str(thread_count))  # 确保是整数
            self.threads_label.config(text=f"{thread_count} 线程")
        except:
            self.threads_label.config(text="错误")
    
    def show_about(self):
        """显示关于对话框"""
        messagebox.showinfo("关于番茄小说下载器",
                           f"番茄小说下载器 - 精简版 v{self.version}\n\n"
                           "这是一个简单的工具，用于从番茄小说下载您喜欢的小说\n\n"
                           "作者: POf-L\n"
                           "GitHub: github.com/POf-L/Fanqie-Tomato-Downloader")
    
    def reset_settings(self):
        """重置所有设置到默认值"""
        if messagebox.askyesno("确认", "确定要重置所有设置到默认值吗？"):
            self.threads_var.set("5")
            self.format_var.set("txt")
            self.save_path_entry.delete(0, tk.END)
            self.save_path_entry.insert(0, os.path.join(os.getcwd(), "novels"))
            
            # 更新线程数滑块标签
            self.update_threads_label()
            
            # 记录操作
            self.add_log("已重置所有设置到默认值", "info")
        
    def browse_folder(self):
        folder_path = filedialog.askdirectory()
        if folder_path:
            self.save_path_entry.delete(0, tk.END)
            self.save_path_entry.insert(0, folder_path)
            
    def start_download(self):
        if self.is_downloading:
            messagebox.showinfo("提示", "下载已在进行中")
            return
            
        book_id = self.book_id_entry.get().strip()
        save_path = self.save_path_entry.get().strip()
        
        if not book_id:
            messagebox.showerror("错误", "请输入小说ID")
            return
            
        if not save_path:
            messagebox.showerror("错误", "请选择保存路径")
            return

        # 检查EPUB格式所需的库
        output_format = self.format_var.get()
        if output_format == "epub":
            try:
                import ebooklib
            except ImportError:
                response = messagebox.askyesno("缺少依赖", "转换为EPUB格式需要安装'ebooklib'库。是否现在安装？")
                if response:
                    self.install_ebooklib()
                    # 安装后尝试再次导入
                    try:
                        import ebooklib
                    except ImportError:
                        messagebox.showerror("错误", "安装ebooklib失败，请尝试手动安装：pip install ebooklib")
                        return
                else:
                    return
            
        # 确保保存路径存在
        try:
            os.makedirs(save_path, exist_ok=True)
        except Exception as e:
            messagebox.showerror("错误", f"创建保存路径失败: {str(e)}")
            return
            
        # 准备下载
        self.is_downloading = True
        self.download_button.config(text="下载中...", state=tk.DISABLED)
        self.progress_var.set(0)
        self.progress_label.config(text="开始下载...")
        
        # 清空日志
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete(1.0, tk.END)
        self.log_text.config(state=tk.DISABLED)
        
        # 重定向标准输出到日志文本框
        self.stdout_redirect = RedirectText(self.log_text)
        sys.stdout = self.stdout_redirect
        
        # 设置全局进度变量
        global GLOBAL_PROGRESS_VAR, GLOBAL_PROGRESS_LABEL
        GLOBAL_PROGRESS_VAR = self.progress_var
        GLOBAL_PROGRESS_LABEL = self.progress_label
        
        # 使用全局tqdm替换
        set_custom_tqdm()
        
        # 设置线程数和输出格式
        threads = int(self.threads_var.get())
        output_format = self.format_var.get()
        
        # 将设置直接应用到CONFIG中
        CONFIG["max_workers"] = threads
        
        # 在新线程中运行下载
        self.download_thread = threading.Thread(target=self.run_download, args=(book_id, save_path, output_format))
        self.download_thread.daemon = True
        self.download_thread.start()
        
    def run_download(self, book_id, save_path, output_format):
        try:
            print(f"开始下载小说 ID: {book_id}")
            print(f"保存路径: {save_path}")
            print(f"使用线程数: {CONFIG['max_workers']}")
            print(f"输出格式: {output_format}")
            
            # 确保保存路径存在
            try:
                os.makedirs(save_path, exist_ok=True)
                print(f"保存路径确认: {save_path}")
            except Exception as e:
                raise Exception(f"创建保存目录失败: {str(e)}")
            
            try:
                # 调整请求超时时间，避免连接问题
                CONFIG["request_timeout"] = 30  # 延长超时时间到30秒
                
                # 更新全局配置中的线程数
                CONFIG["max_workers"] = int(self.threads_var.get())
                
                # 直接调用Run函数
                result = Run(book_id, save_path)
                
                if result:
                    message = f"下载完成！共下载了 {result.get('downloaded_chapters', 0)} 章，保存到：{result.get('file_path', save_path)}"
                else:
                    message = "下载完成，但未返回详细信息"
                
                self.after(100, self.download_complete, message)
            except AttributeError as e:
                if "'NoneType' object has no attribute" in str(e):
                    error_msg = f"下载失败: 可能是某个章节内容获取失败或文件写入失败。详细错误: {str(e)}"
                    print(error_msg)
                    self.after(100, self.download_complete, error_msg)
                else:
                    raise
        except Exception as e:
            error_msg = f"下载出错: {str(e)}"
            print(f"错误详情: {type(e).__name__}: {str(e)}")
            self.after(100, self.download_complete, error_msg)
            
    def download_complete(self, message):
        try:
            self.is_downloading = False
            self.download_button.config(text="开始下载", state=tk.NORMAL)
            self.progress_label.config(text=message)
            
            # 清理全局进度变量
            global GLOBAL_PROGRESS_VAR, GLOBAL_PROGRESS_LABEL
            GLOBAL_PROGRESS_VAR = None
            GLOBAL_PROGRESS_LABEL = None
            
            # 尝试恢复标准输出
            try:
                if sys.stdout != sys.__stdout__:
                    sys.stdout = sys.__stdout__
            except Exception as e:
                print(f"恢复标准输出时出错: {str(e)}")
                
            # 避免重复显示同一消息
            if "下载完成" in message:
                # 如果是EPUB格式，显示更详细的信息
                if hasattr(self, 'format_var') and self.format_var.get() == "epub":
                    messagebox.showinfo("下载状态", f"{message}\n\nEPUB文件应该已保存到指定目录。\n如果需要查看，请打开保存目录。")
                else:
                    messagebox.showinfo("下载状态", message)
            else:
                # 如果是错误信息，显示更多细节
                messagebox.showinfo("下载状态", f"{message}\n\n请检查小说ID是否正确，或者稍后重试。")
        except Exception as e:
            messagebox.showinfo("下载状态", f"下载过程完成，但状态更新时出错: {str(e)}")
    
    def install_ebooklib(self):
        """安装ebooklib库"""
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete(1.0, tk.END)
        self.log_text.insert(tk.END, "正在安装ebooklib库...\n")
        self.log_text.config(state=tk.DISABLED)
        
        try:
            import subprocess
            import sys
            
            # 禁用下载按钮，防止安装过程中操作
            original_state = self.download_button["state"]
            self.download_button.config(state=tk.DISABLED)
            
            # 显示详细的安装步骤
            self.log_text.config(state=tk.NORMAL)
            self.log_text.insert(tk.END, f"正在使用 {sys.executable} 安装...\n")
            self.log_text.see(tk.END)
            self.log_text.config(state=tk.DISABLED)
            self.update()  # 立即更新UI
            
            # 运行pip安装命令
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "ebooklib", "--upgrade"],
                capture_output=True,
                text=True,
                timeout=60  # 设置超时，防止无限等待
            )
            
            # 处理安装结果
            self.log_text.config(state=tk.NORMAL)
            if result.returncode == 0:
                self.log_text.insert(tk.END, "✓ 安装成功！\n")
                self.log_text.insert(tk.END, "现在可以将小说转换为EPUB格式。\n")
                messagebox.showinfo("安装成功", "ebooklib库安装成功！现在可以使用EPUB格式导出小说。")
            else:
                error_info = result.stderr or "未知错误"
                self.log_text.insert(tk.END, f"✗ 安装失败: \n{error_info}\n")
                self.log_text.insert(tk.END, "请检查网络连接或尝试手动安装：\n")
                self.log_text.insert(tk.END, "pip install ebooklib\n")
                messagebox.showerror("安装失败", f"安装ebooklib库失败，详细信息已在日志中显示。\n\n可能原因：网络问题或权限不足。")
            
            self.log_text.see(tk.END)  # 滚动到最新日志
            self.log_text.config(state=tk.DISABLED)
            
        except subprocess.TimeoutExpired:
            self.log_text.config(state=tk.NORMAL)
            self.log_text.insert(tk.END, "安装超时，可能是网络问题或服务器响应慢。\n")
            self.log_text.config(state=tk.DISABLED)
            messagebox.showerror("安装超时", "安装ebooklib库超时，请检查网络连接后重试。")
            
        except Exception as e:
            self.log_text.config(state=tk.NORMAL)
            self.log_text.insert(tk.END, f"安装过程出错: {str(e)}\n")
            self.log_text.config(state=tk.DISABLED)
            messagebox.showerror("安装错误", f"安装ebooklib库时出错: {str(e)}")
            
        finally:
            # 恢复下载按钮状态
            try:
                self.download_button.config(state=original_state)
            except:
                self.download_button.config(state=tk.NORMAL)
        
    def on_closing(self):
        try:
            if self.is_downloading:
                if messagebox.askyesno("确认", "下载正在进行中，确定要退出吗？"):
                    try:
                        # 恢复标准输出
                        if sys.stdout != sys.__stdout__:
                            sys.stdout = sys.__stdout__
                            
                        # 清理全局进度变量
                        global GLOBAL_PROGRESS_VAR, GLOBAL_PROGRESS_LABEL
                        GLOBAL_PROGRESS_VAR = None
                        GLOBAL_PROGRESS_LABEL = None
                    except Exception as e:
                        print(f"关闭时恢复标准输出错误: {str(e)}", file=sys.__stdout__)
                    self.destroy()
            else:
                self.destroy()
        except Exception as e:
            print(f"关闭应用程序时出错: {str(e)}", file=sys.__stdout__)
            # 强制关闭
            self.destroy()

def check_environment():
    """检查系统环境和依赖"""
    issues = []
    
    # 检查Python版本
    import platform
    py_version = platform.python_version_tuple()
    if int(py_version[0]) < 3 or (int(py_version[0]) == 3 and int(py_version[1]) < 6):
        issues.append(f"当前Python版本 ({platform.python_version()}) 过低，建议使用Python 3.6或更高版本")
    
    # 检查tk是否可用
    try:
        import tkinter
        root = tkinter.Tk()
        root.destroy()
    except Exception as e:
        issues.append(f"Tkinter初始化失败: {str(e)}")
    
    # 检查临时文件目录是否可写
    import tempfile
    try:
        with tempfile.NamedTemporaryFile(delete=True) as f:
            f.write(b"test")
    except Exception as e:
        issues.append(f"临时目录写入测试失败: {str(e)}")
    
    return issues

def setup_logging():
    """设置基本日志记录"""
    import logging
    import os
    import tempfile
    
    # 设置日志文件路径
    log_dir = os.path.join(tempfile.gettempdir(), "tomato_novel_downloader")
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, "app_log.txt")
    
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler()
        ]
    )
    return logging.getLogger("TomatoNovelDownloader")

if __name__ == "__main__":
    # 设置异常钩子，捕获未处理的异常
    import sys
    import traceback
    
    # 设置日志
    logger = setup_logging()
    logger.info("应用程序启动")
    
    # 检查环境
    issues = check_environment()
    if issues:
        from tkinter import messagebox
        warn_msg = "检测到以下潜在问题，程序可能无法正常运行:\n\n" + "\n".join(issues)
        logger.warning(warn_msg)
        messagebox.showwarning("环境检查警告", warn_msg)
    
    # 处理未捕获的异常
    def handle_exception(exc_type, exc_value, exc_traceback):
        if issubclass(exc_type, KeyboardInterrupt):
            # 正常的Ctrl+C终止，使用默认处理
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return
            
        # 记录未捕获的异常
        logger.error("未捕获的异常",
                     exc_info=(exc_type, exc_value, exc_traceback))
        
        # 显示错误对话框
        import tkinter as tk
        from tkinter import messagebox
        if tk._default_root:
            error_message = f"发生未预期的错误:\n{exc_type.__name__}: {exc_value}"
            messagebox.showerror("程序错误", error_message)
    
    # 设置全局异常处理器
    sys.excepthook = handle_exception
    
    try:
        # 启动应用程序
        app = NovelDownloaderGUI()
        app.protocol("WM_DELETE_WINDOW", app.on_closing)  # 确保关闭处理器已设置
        logger.info("GUI初始化完成")
        app.mainloop()
    except Exception as e:
        logger.error(f"应用程序启动失败: {str(e)}", exc_info=True)
        from tkinter import messagebox
        messagebox.showerror("启动错误", f"应用程序启动失败: {str(e)}")
    finally:
        # 确保资源被清理
        logger.info("应用程序关闭")