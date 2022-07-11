// const mime = require('mime-types');
var http = require('http');
var fs = require('fs');
var path = require('path');
const ejs = require('ejs');
const Puppeteer = require('puppeteer');


function fileHandler(request, response, filePath = null) {
    if (filePath === null) {
        filePath = '.' + request.url;
    }
    if (filePath == './') {
        filePath = './index.html';
    }

    var extname = String(path.extname(filePath)).toLowerCase();
    var mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
    };

    var contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, function(error, content) {
        if (error) {
            if(error.code == 'ENOENT') {
                fs.readFile('./404.html', function(error, content) {
                    response.writeHead(404, { 'Content-Type': 'text/html' });
                    response.end(content, 'utf-8');
                });
            }
            else {
                response.writeHead(500);
                response.end('Sorry, check with the site admin for error: '+error.code+' ..\n');
            }
        }
        else {
            response.writeHead(200, { 'Content-Type': contentType });
            response.end(content, 'utf-8');
        }
    });
}
// context[0] cotnains the full url, context[1] the file extension
function snapshotHandler(request, response, context) {
    const imagePath = path.join(__dirname, 'cache', context[0]); //path.join(__dirname, 'mire.png')
    (async () => {
        const browser = await Puppeteer.launch();
        const page = await browser.newPage();
        if (typeof context[1] === 'string') {

        }
        await page.setViewport({
            width: 1280,
            height: 720,
            deviceScaleFactor: 1,
          });
        await page.goto('http://localhost:3000/mire');
        await page.screenshot({path: imagePath});          
        await browser.close();
    })()
    .then(function () {
        fileHandler(request, response, imagePath);
    });
    /*
    var mimeType = mime.lookup(imagePath);
    response.writeHead(200, { 'Content-Type': mimeType });
    response.end(content, 'utf-8');
    */
}
// https://developer.mozilla.org/en-US/docs/Learn/Server-side/Node_server_without_framework
function webHandler(request, response) {
    console.log('request ', request.url);

    try {
        let matches = null;
        if ( (matches = request.url.match(/^\/(.+\/)?mire(\..+)?$/i)) !== null ) {
            if (matches[2] !== undefined) {
                snapshotHandler(request, response, matches);
                return;
            }
            ejs.renderFile(path.join(__dirname, 'mire', 'mire.ejs.html'), { data: 'none' }, {}, function(err, str){
                // str => Rendered HTML string
                // response.writeHead(200, { 'Content-Type': 'application/html' })
                response.end(str);       
            });
            return;
        } else {
            fileHandler(request, response);
            return;
        }
    } catch (error) {
        response.writeHead(500, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ stack: error.stack }));
        return;
    }
    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ status: 'resource-not-found' }));
}

http.createServer(webHandler).listen(3000);
console.log('Server running at http://127.0.0.1:3000/');
console.log('GET Mire @ http://127.0.0.1:3000/mire');
console.log('\ttherefore for snapshots @ http://127.0.0.1:3000/mire.jpg');

