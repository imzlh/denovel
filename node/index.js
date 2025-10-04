import { parseArgs } from 'util';
import { createServer } from 'http';
import packageJSON from './package.json' with { type: "json" };
import { exit } from 'process';

/**
 * Create a server that listens on the specified port and handles incoming requests.
 * @param {number} port 
 */
function server(port){
    createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);

        console.log(req.method, req.url);

        if (url.pathname === '/'){
            return res.end(`Welcome to ${packageJSON.name} v${packageJSON.version}`);
        }

        try{
            const _mod = await import(`./modules/${url.pathname}.js`);
            await _mod.default(req, res, url);
        }catch(e){
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            console.error(e);
            res.end(`Not found or contains errors: ${url.pathname}, ${e}`);
            return;
        }
    }).listen(port ?? 7384, () => {
        console.log('Server running at http://localhost:7384/');
    });
}

async function main(){
    // if(!import.meta.main){
    //     throw new Error('nodeapi: This file should be used as an entry point.')
    // }

    // parse command line arguments
    const args = process.argv.slice(2);
    const { values, positionals } = parseArgs({
        args, options: {
            '--help': {
                short: 'h',
                type: 'boolean',
                description: 'Show this help message'
            },
            '--version': {
                type: 'boolean',
                description: 'Show the version number'
            },
            '--port': {
                type:'string',
                description: 'Specify the port to listen on (default: env:PORT or 7384)'
            }
        }
    })

    if (values['--help']){
        console.log(`Usage: nodeapi [options] [positionals]
    --help     Show this help message
    --port     Specify the port to listen on (default: env:PORT or 7384)
    --version  Show the version number
`);
        exit(0)
    }

    if (values['--version']){
        console.log(packageJSON.version);
        exit(0)
    }

    const port = values['--port'] ?? process.env.PORT ?? 7384;
    server(port);
}

main();