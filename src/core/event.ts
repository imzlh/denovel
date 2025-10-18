// deno-lint-ignore-file no-explicit-any
type EventCallback<T = any> = (data: T) => void;
type EventMap = Record<string, any>;

interface EventListener<T = any> {
    callback: EventCallback<T>;
    once?: boolean;
}

/**
 * 事件发射器类
 * 提供 on、once、emit、off 等方法
 */
export class EventBase<T extends EventMap = Record<string, any>> {
    private events: Map<keyof T, EventListener[]> = new Map();
    private maxListeners: number = 10;

    /**
     * 监听事件
     * @param event 事件名称
     * @param callback 回调函数
     * @returns this
     */
    on<K extends keyof T>(event: K, callback: EventCallback<T[K]>): this {
        return this._addListener(event, callback, false);
    }

    /**
     * 一次性监听事件
     * @param event 事件名称
     * @param callback 回调函数
     * @returns this
     */
    once<K extends keyof T>(event: K, callback: EventCallback<T[K]>): this {
        return this._addListener(event, callback, true);
    }

    /**
     * 触发事件
     * @param event 事件名称
     * @param data 事件数据
     * @returns 是否有监听器处理了该事件
     */
    emit<K extends keyof T>(event: K, data?: T[K]): boolean {
        const listeners = this.events.get(event);

        if (!listeners || listeners.length === 0) {
            return false;
        }

        // 执行所有监听器，并过滤掉一次性监听器
        const remainingListeners: EventListener[] = [];

        for (const listener of listeners) {
            try {
                listener.callback(data as T[K]);
                // 如果不是一次性监听器，则保留
                if (!listener.once) {
                    remainingListeners.push(listener);
                }
            } catch (error) {
                console.error(`Error in event listener for "${String(event)}":`, error);
                // 即使出错也保留非一次性监听器
                if (!listener.once) {
                    remainingListeners.push(listener);
                }
            }
        }

        // 更新监听器列表
        if (remainingListeners.length > 0) {
            this.events.set(event, remainingListeners);
        } else {
            this.events.delete(event);
        }

        return true;
    }

    /**
     * 移除事件监听器
     * @param event 事件名称
     * @param callback 要移除的回调函数（不传则移除所有）
     * @returns this
     */
    off<K extends keyof T>(event: K, callback?: EventCallback<T[K]>): this {
        if (!this.events.has(event)) {
            return this;
        }

        if (!callback) {
            // 移除该事件的所有监听器
            this.events.delete(event);
            return this;
        }

        // 移除特定的监听器
        const listeners = this.events.get(event)!;
        const filteredListeners = listeners.filter(
            listener => listener.callback !== callback
        );

        if (filteredListeners.length > 0) {
            this.events.set(event, filteredListeners);
        } else {
            this.events.delete(event);
        }

        return this;
    }

    /**
     * 移除所有事件监听器
     * @returns this
     */
    removeAllListeners(): this {
        this.events.clear();
        return this;
    }

    /**
     * 获取指定事件的监听器数量
     * @param event 事件名称
     * @returns 监听器数量
     */
    listenerCount<K extends keyof T>(event: K): number {
        const listeners = this.events.get(event);
        return listeners ? listeners.length : 0;
    }

    /**
     * 获取所有事件名称
     * @returns 事件名称数组
     */
    eventNames(): (keyof T)[] {
        return Array.from(this.events.keys());
    }

    /**
     * 设置最大监听器数量
     * @param n 数量
     * @returns this
     */
    setMaxListeners(n: number): this {
        this.maxListeners = n;
        return this;
    }

    /**
     * 获取最大监听器数量
     * @returns 最大监听器数量
     */
    getMaxListeners(): number {
        return this.maxListeners;
    }

    /**
     * 添加监听器（内部方法）
     */
    private _addListener<K extends keyof T>(
        event: K,
        callback: EventCallback<T[K]>,
        once: boolean
    ): this {
        if (typeof callback !== 'function') {
            throw new TypeError('The callback must be a function');
        }

        const listeners = this.events.get(event) || [];

        // 检查监听器数量限制
        if (listeners.length >= this.maxListeners) {
            console.warn(
                `Possible EventEmitter memory leak detected. ${listeners.length} ${String(event)} listeners added. ` +
                `Use setMaxListeners() to increase limit`
            );
        }

        listeners.push({ callback, once });
        this.events.set(event, listeners);

        return this;
    }
}

const defaultEvent = new EventBase<{
    exit: void;
    load: void;
    error: Error | any;
    sigexit: Event;
}>();
export default defaultEvent;