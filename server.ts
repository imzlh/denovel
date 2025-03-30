// server.ts
import { Application, Router } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import { WebSocketServer, WebSocketClient } from "https://deno.land/x/websocket@v0.1.4/mod.ts";
import { downloadNovel, Status } from "./main.ts";
import { exists } from "./main.ts";

// 任务状态存储
const tasks = new Map<string, {
    status: Status;
    message: string;
    progress: number;
    wsClients: Set<WebSocketClient>;
    abortController: AbortController;
    name: string;
    url: string;
}>();

const app = new Application();
const router = new Router();
const wss = new WebSocketServer(8080);

// WebSocket处理
wss.on("connection", (ws) => {
    ws.on('message', (e: string) => {
        try {
            const data = JSON.parse(e);

            if (data.action === "subscribe" && data.taskId && tasks.has(data.taskId)) {
                const task = tasks.get(data.taskId)!;
                task.wsClients.add(ws);
                // 立即发送当前状态
                ws.send(JSON.stringify({
                    taskId: data.taskId,
                    status: Status[task.status],
                    message: task.message,
                    progress: task.progress,
                    name: task.name,
                    url: task.url
                }));
            }
            else if (data.action === "cancel" && data.taskId && tasks.has(data.taskId)) {
                const task = tasks.get(data.taskId)!;
                task.abortController.abort();
                task.status = Status.CANCELLED;
                task.message = "用户取消下载";
                broadcastTaskUpdate(data.taskId);
            }
        } catch (err) {
            console.error("WebSocket message error:", err);
        }
    });

    ws.on('close', () => {
        tasks.forEach(task => task.wsClients.delete(ws));
    });
});

// 广播任务更新
function broadcastTaskUpdate(taskId: string) {
    const task = tasks.get(taskId);
    if (!task) return;

    const update = JSON.stringify({
        taskId,
        status: Status[task.status],
        message: task.message,
        progress: task.progress,
        name: task.name,
        url: task.url
    });

    task.wsClients.forEach(client => {
        try {
            if (client.isClosed) {
                task.wsClients.delete(client);
            } else {
                client.send(update);
            }
        } catch (err) {
            console.error("WebSocket send error:", err);
            task.wsClients.delete(client);
        }
    });
}

// 状态报告函数
function createReporter(taskId: string) {
    return (status: Status, message: string) => {
        const task = tasks.get(taskId);
        if (!task) return;

        task.status = status;
        task.message = message;

        if (status === Status.DONE || status === Status.ERROR || status === Status.CANCELLED) {
            task.progress = 100;
        } else {
            task.progress = Math.min(task.progress + 5, 95);
        }

        broadcastTaskUpdate(taskId);
    };
}

// HTML界面
router.get("/", async (ctx) => {
    ctx.response.type = "text/html";
    ctx.response.body = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>小说下载管理器</title>
  <style>
    :root {
      --primary: #4CAF50;
      --primary-dark: #388E3C;
      --danger: #F44336;
      --danger-dark: #D32F2F;
      --text: #333;
      --text-light: #666;
      --bg: #f5f5f5;
      --card-bg: #fff;
      --border: #e0e0e0;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: var(--text);
      background-color: var(--bg);
      padding: 20px;
      max-width: 1000px;
      margin: 0 auto;
    }
    
    h1 {
      color: var(--primary);
      margin-bottom: 20px;
      text-align: center;
    }
    
    .card {
      background: var(--card-bg);
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      padding: 25px;
      margin-bottom: 20px;
    }
    
    .form-group {
      margin-bottom: 20px;
    }
    
    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: var(--text);
    }
    
    input, select {
      width: 100%;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 16px;
      transition: border 0.3s;
    }
    
    input:focus, select:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
    }
    
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s;
      border: none;
    }
    
    .btn-primary {
      background: var(--primary);
      color: white;
    }
    
    .btn-primary:hover {
      background: var(--primary-dark);
    }
    
    .btn-danger {
      background: var(--danger);
      color: white;
    }
    
    .btn-danger:hover {
      background: var(--danger-dark);
    }
    
    .btn-secondary {
      background: #6c757d;
      color: white;
    }
    
    .btn-secondary:hover {
      background: #5a6268;
    }
    
    dialog {
      width: 90%;
      max-width: 800px;
      border-radius: 12px;
      border: none;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
      padding: 0;
      overflow: hidden;
      top: 50vh;
    left: 50vw;
    transform: translate(-50%, -50%);
    }
    
    dialog::backdrop {
      background-color: rgba(0,0,0,0.5);
    }
    
    .dialog-header {
      padding: 20px;
      background: var(--primary);
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .dialog-title {
      font-size: 20px;
      font-weight: 500;
    }
    
    .dialog-close {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
      padding: 0 8px;
    }
    
    .dialog-content {
      padding: 20px;
      max-height: 70vh;
      overflow-y: auto;
    }
    
    .task-list {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    
    .task-item {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 15px;
    }
    
    .task-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    
    .task-name {
      font-weight: bold;
      color: var(--primary);
    }
    
    .task-url {
      color: var(--text-light);
      font-size: 0.9em;
      word-break: break-all;
    }
    
    .task-status {
      font-weight: bold;
    }
    
    .progress-container {
      margin: 15px 0;
    }
    
    .progress-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    
    .progress-bar {
      height: 10px;
      background: #f0f0f0;
      border-radius: 5px;
      overflow: hidden;
    }
    
    .progress-fill {
      height: 100%;
      background: var(--primary);
      width: 0%;
      transition: width 0.3s ease;
    }
    
    .task-message {
      padding: 10px;
      background: #f8f8f8;
      border-radius: 6px;
      margin: 10px 0;
    }
    
    .task-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    
    .no-tasks {
      text-align: center;
      padding: 20px;
      color: var(--text-light);
    }
    
    .view-tasks-btn {
      margin-top: 15px;
    }
    
    @media (max-width: 600px) {
      body {
        padding: 15px;
      }
      
      .card {
        padding: 15px;
      }
      
      dialog {
        width: 95%;
      }
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>小说下载管理器</h1>
    
    <div class="form-group">
      <label for="url">小说URL地址</label>
      <input type="url" id="url" placeholder="https://example.com/novel" required>
    </div>
    
    <div class="form-group">
      <label for="name">小说名称</label>
      <input type="text" id="name" placeholder="请输入小说名称">
    </div>
    
    <div class="form-group">
      <label for="outdir">保存目录</label>
      <input type="text" id="outdir" value="out">
    </div>
    
    <button id="start" class="btn btn-primary">开始下载</button>
    <button id="viewTasks" class="btn btn-secondary view-tasks-btn">查看任务列表</button>
  </div>
  
  <dialog id="tasksDialog">
    <div class="dialog-header">
      <h2 class="dialog-title">下载任务列表</h2>
      <button class="dialog-close" id="closeTasksDialog">&times;</button>
    </div>
    <div class="dialog-content">
      <div id="tasksContainer" class="task-list">
        <div class="no-tasks">没有正在进行的任务</div>
      </div>
    </div>
  </dialog>
  
  <script>
    const tasksDialog = document.getElementById('tasksDialog');
    const closeTasksDialog = document.getElementById('closeTasksDialog');
    const viewTasksBtn = document.getElementById('viewTasks');
    const tasksContainer = document.getElementById('tasksContainer');
    const startBtn = document.getElementById('start');
    
    let ws = null;
    let activeTasks = new Set();
    let isPageClosing = false;

    // 初始化WebSocket连接
    function initWebSocket() {
      ws = new WebSocket('ws://' + window.location.hostname + ':8080');
      
      ws.onopen = () => {
        console.log('WebSocket连接已建立');
        // 重新订阅所有活动任务
        activeTasks.forEach(taskId => {
          ws.send(JSON.stringify({ 
            action: "subscribe",
            taskId 
          }));
        });
      };
      
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          updateTaskUI(data);
        } catch (err) {
          console.error('处理WebSocket消息出错:', err);
        }
      };
      
      ws.onerror = (err) => {
        console.error('WebSocket错误:', err);
      };
      
      ws.onclose = () => {
        console.log('WebSocket连接关闭');
        if (!isPageClosing) {
          // 5秒后尝试重新连接
          setTimeout(initWebSocket, 5000);
        }
      };
    }

    // 更新任务UI
    function updateTaskUI(taskData) {
      let taskElement = document.getElementById(\`task-\${taskData.taskId}\`);
      
      if (!taskElement) {
        // 创建新任务元素
        taskElement = document.createElement('div');
        taskElement.id = \`task-\${taskData.taskId}\`;
        taskElement.className = 'task-item';
        taskElement.innerHTML = \`
          <div class="task-header">
            <div>
              <div class="task-name">\${taskData.name || '未命名任务'}</div>
              <div class="task-url">\${taskData.url}</div>
            </div>
            <div class="task-status">\${taskData.status}</div>
          </div>
          <div class="progress-container">
            <div class="progress-info">
              <span>下载进度</span>
              <span>\${taskData.progress}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: \${taskData.progress}%"></div>
            </div>
          </div>
          <div class="task-message">\${taskData.message}</div>
          <div class="task-actions">
            <button class="btn btn-danger cancel-task" data-task-id="\${taskData.taskId}">
              \${['DONE', 'ERROR', 'CANCELLED'].includes(taskData.status) ? '已结束' : '取消下载'}
            </button>
          </div>
        \`;
        
        // 替换"没有任务"提示或添加到列表
        if (tasksContainer.querySelector('.no-tasks')) {
          tasksContainer.innerHTML = '';
        }
        tasksContainer.prepend(taskElement);
        
        // 添加到活动任务集合
        activeTasks.add(taskData.taskId);
      } else {
        // 更新现有任务元素
        taskElement.querySelector('.task-status').textContent = taskData.status;
        taskElement.querySelector('.progress-fill').style.width = \`\${taskData.progress}%\`;
        taskElement.querySelector('.progress-info span:last-child').textContent = \`\${taskData.progress}%\`;
        taskElement.querySelector('.task-message').textContent = taskData.message;
        
        const cancelBtn = taskElement.querySelector('.cancel-task');
        if (['DONE', 'ERROR', 'CANCELLED'].includes(taskData.status)) {
          cancelBtn.textContent = '已结束';
          cancelBtn.disabled = true;
        }
      }
    }

    // 开始下载
    startBtn.addEventListener('click', async () => {
      const url = document.getElementById('url').value.trim();
      const name = document.getElementById('name').value.trim();
      const outdir = document.getElementById('outdir').value.trim();
      
      if (!url) {
        alert('请输入小说URL地址');
        return;
      }
      
      try {
        const response = await fetch('/api/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            name: name || '未命名小说',
            outdir: outdir || 'out',
          })
        });
        
        if (!response.ok) throw new Error('请求失败');
        
        const { taskId } = await response.json();
        
        // 订阅这个任务
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            action: "subscribe",
            taskId 
          }));
          activeTasks.add(taskId);
        }
        
        // 显示任务对话框
        tasksDialog.showModal();
        
        // 清空表单
        document.getElementById('url').value = '';
        document.getElementById('name').value = '';
      } catch (err) {
        alert('创建下载任务失败: ' + err.message);
        console.error(err);
      }
    });

    // 取消任务
    tasksContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('cancel-task') && !e.target.disabled) {
        const taskId = e.target.getAttribute('data-task-id');
        if (ws && ws.readyState === WebSocket.OPEN) {
          e.target.disabled = true;
          e.target.textContent = '正在取消...';
          ws.send(JSON.stringify({ 
            action: "cancel",
            taskId 
          }));
        }
      }
    });

    // 查看任务列表
    viewTasksBtn.addEventListener('click', () => {
      tasksDialog.showModal();
    });

    // 关闭任务对话框
    closeTasksDialog.addEventListener('click', () => {
      tasksDialog.close();
    });

    // 页面关闭前确认
    window.addEventListener('beforeunload', (e) => {
      if (activeTasks.size > 0) {
        isPageClosing = true;
        const message = '有任务正在运行，确定要离开吗？';
        e.returnValue = message;
        return message;
      }
    });

    // 初始化WebSocket连接
    initWebSocket();
  </script>
</body>
</html>
`;
});

// API路由
router
    .post("/api/start", async (ctx) => {
        try {
            const { url, name, outdir } = await ctx.request.body.json();

            const taskId = crypto.randomUUID();
            const abortController = new AbortController();
            const wsClients = new Set<WebSocketClient>();

            tasks.set(taskId, {
                status: Status.QUEUED,
                message: "等待开始...",
                progress: 0,
                wsClients,
                abortController,
                name,
                url
            });

            // 启动下载任务
            const urlObj = new URL(url);
            const isTraditional = await exists('lib/' + urlObj.hostname + '.t.ts');

            downloadNovel(
                url,
                isTraditional,
                createReporter(taskId),
                name,
                abortController.signal
            ).catch(err => {
                const reporter = createReporter(taskId);
                reporter(Status.ERROR, `下载失败: ${err.message}`);
            });

            ctx.response.body = { taskId };
        } catch (err) {
            ctx.response.status = 400;
            ctx.response.body = { error: (err as Error).message };
        }
    })
    .get("/api/tasks", (ctx) => {
        ctx.response.body = Array.from(tasks.entries()).map(([taskId, task]) => ({
            taskId,
            status: Status[task.status],
            message: task.message,
            progress: task.progress,
            name: task.name,
            url: task.url
        }));
    });

app.use(router.routes());
app.use(router.allowedMethods());

console.log("Server running on http://localhost:8000");
await app.listen({ port: 8000 });
