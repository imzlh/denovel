import Events from './event.ts';

export async function useLifeCycle<T extends any[]>(entry: (...args: T) => Promise<void>, ...args: T){
    Events.emit('load');

    Deno.addSignalListener('SIGINT', () => {
        const event = new Event('exit', {
            cancelable: true
        });
        Events.emit('sigexit', event);
        if (!event.defaultPrevented) {
            console.log('^C');
            Deno.exit(0);
        }
    });

    try{
        await entry.apply(null, args);
        Events.emit('exit');
    } catch (e) {
        Events.emit('error', e);
    }
}