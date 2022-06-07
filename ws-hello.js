const http = require('http');
const fs = require('fs');
const fsPromises = require('fs/promises');
// npm install consul
// https://developpaper.com/node-js-consul-realize-service-registration-health-check-and-configuration-center/

//consul.kv.get('toto');
//consul.kv.set('develop/user', JSON.stringify(user));
let useConsul = false;
let serverPort = 8092;
let serverHostname = '0.0.0.0';
let consul = null;

function intro() {
    return new Promise((resolve, reject) => {
        for (var a=1; a<process.argv.length; a++) {
            switch (process.argv[a].toUpperCase()) {
                case 'CONSUL': useConsul = true; break;
                case 'PORT': try { serverPort = parseInt(process.argv[a+1]); } catch (error) { console.error ('something wen wrong while reading server port'); } break;
                case 'HOSTNAME': try { serverHostname = process.argv[a+1]; } catch (error) { console.error ('something wen wrong while reading server hostname'); } break;
            }
        }
        if (useConsul) {
            const Consul = require('consul');        
            consul = new Consul({ host: '127.0.0.1', port: 8500, promisify: true, });
        }
        resolve();
    })
    .then(() => {
        if (consul) {
            console.log('contacting Consul...');
            return consul.agent.service.register({
                name: 'hello-js',
                address: '127.0.0.1', // public address
                port: 8092,
                check: {
                    http: `http://127.0.0.1:${serverPort}/health`,
                    interval: '10s',
                    timeout: '5s',
                }
            })
            .then((res)=> {
                console.log('Consul registering is a success.');
            })
        }
    });
}

function main() {

    
    return new Promise((resolve, reject) => {

        console.log(`Mounting a server on port ${serverHostname}:${serverPort} (likely)`);
        const server = http.createServer((req, res) => {
            req.on('error', err => {
                console.error(err);
                // Handle error...
                res.statusCode = 400;
                res.end('400: Bad Request');
                return;
            });
        
            res.on('error', err => {
                console.error(err);
                // Handle error...
            });
        
            if (req.url === '/health' && req.method === 'GET') {
                console.log('HEALH pinged');
                res.end('OK');
            } else if (req.url === '/' && req.method === 'GET') {
                res.end('Welcome Home');
            } else {
                fsPromises.stat('./public' + req.url)
                .then((stats) => {
                    return fsPromises.readFile('./public' + req.url);
                })
                .then((data) => {
                    res.setHeader('Content-Type', 'application/octet-stream');
                    res.end(data);
                })
                .catch((error) => {
                    res.statusCode = 404;
                    res.end('404: File Not Found');
                });    
            }
        
        }).listen(serverPort, serverHostname, () => { console.log(`Mounted a server on address ${serverHostname} port ${serverPort}, try browsing http://127.0.0.1:${serverPort}`); });
        
        resolve();
    });
}

intro().then((res) => main()).catch((error) => { console.error(error); });
