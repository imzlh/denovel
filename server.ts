import { Application, Router } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import { WebSocketServer, WebSocketClient } from "https://deno.land/x/websocket@v0.1.4/mod.ts";
import { downloadNovel, Status, exists } from "./main.ts";
import { ensureDirSync } from "jsr:@std/fs@^1.0.10/ensure-dir";
import html from './static/server.html' with { type: "text" };

// 任务状态存储
interface ITask {
    status: Status;
    message: string;
    progress: number;
    wsClients: Set<WebSocketClient>;
    abortController: AbortController;
    name: string;
    url: string;
    id: string;
}

export default async function main(){
    const tasks = new Map<string, ITask>();

    /**
     * 队列，以主机为key
     */
    const hostQueues = new Map<string, Array<ITask>>();

    const app = new Application();
    const router = new Router();
    const wss = new WebSocketServer(8080);

    // 新增：处理host队列
    let processing = false;
    async function processHostQueue(host: string) {
        if(processing) return;
        processing = true;
        const hostQueue = hostQueues.get(host);
        if (!hostQueue || hostQueue.length === 0) return;

        let nextTask: ITask;
        while (nextTask = hostQueue[0]) {
            const { id, url, name } = nextTask;

            try {
                const urlObj = new URL(url);
                const isTraditional = await exists('lib/' + urlObj.hostname + '.t.ts');

                await downloadNovel(
                    url,
                    isTraditional,
                    createReporter(id),
                    name,
                    undefined,
                    nextTask.abortController.signal
                );
            } catch (err) {
                const reporter = createReporter(id);
                reporter(Status.ERROR, `下载失败: ${(err as Error).message}`);
            } finally {
                hostQueue.shift();
            }
        }
        processing = false;
    }

    ensureDirSync("out");

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
                } else if (data.action === "cancel" && data.taskId && tasks.has(data.taskId)) {
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

        if(task.status == Status.ERROR || task.status == Status.DONE){
            console.log(`[${Status[task.status]}] ${task.message}`);
        }

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
        return (status: Status, message: string, error?: Error) => {
            const task = tasks.get(taskId);
            if (!task) return;

            task.status = status;
            task.message = message;
            if(error) {
                task.message += ` (${error.message})`;
            }

            if (status === Status.DONE || status === Status.ERROR || status === Status.CANCELLED) {
                task.progress = 100;
            } else {
                task.progress = Math.min(task.progress + 5, 95);
            }

            broadcastTaskUpdate(taskId);
        };
    }

    // HTML界面
    router.get("/", (ctx) => {
        ctx.response.type = "text/html";
        ctx.response.body = html;
    });

    router
        .post("/api/start", async (ctx) => {
            try {
                const { url, name, outdir } = await ctx.request.body.json();
                const taskId = crypto.randomUUID();
                const abortController = new AbortController();
                const wsClients = new Set<WebSocketClient>();
                const task: ITask = {
                    status: Status.QUEUED,
                    message: "等待开始...",
                    progress: 0,
                    wsClients,
                    abortController,
                    name,
                    url,
                    id: taskId
                };

                tasks.set(taskId, task);

                // 获取host
                const urlObj = new URL(url);
                const host = urlObj.hostname;

                // 初始化host队列（如果不存在）
                if (!hostQueues.has(host)) {
                    hostQueues.set(host, [ task ]);
                }else{
                    hostQueues.get(host)!.push(task);
                }

                // 启动队列处理
                processHostQueue(host);
                ctx.response.body = { taskId };
            } catch (err) {
                ctx.response.status = 400;
                ctx.response.body = { error: (err as Error).message };
            }
        });

    app.use(router.routes());
    app.use(router.allowedMethods());

    console.log("Server running on http://localhost:8000");
    await app.listen({ port: 8000 });
}

if(import.meta.main) main();