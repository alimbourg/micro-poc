const { Resvg } = require('./resvg-js')
const {Canvas, Image, loadImage} = require('skia-canvas');
const { promises } = require('fs')
const { join } = require('path')

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

// https://developer.mozilla.org/en-US/docs/Learn/Server-side/Node_server_without_framework
function webHandler(request, response) {
    console.log('request ', request.url);

    try {
        let matches = null;
        if ( (matches = request.url.match(/^\/(.+\/)?mire(\..+)?(\?.*)?$/i)) !== null ) {
            // sresponse.writeHead(200, { 'Content-Type': 'image/png' });
            promises.readFile(join(__dirname, './RCA_Indian_Head_Test_Pattern.svg'))
            //loadImage('./RCA_Indian_Head_Test_Pattern.svg')
            //loadImage('https://dev.w3.org/SVG/tools/svgweb/samples/svg-files/aa.svg')
            .then(function (svg) {
                const opts = { /// background style
                    background: 'rgba(238, 235, 230, .9)',
                    fitTo: {
                        mode: 'width',
                        value: 1280,
                    },
                    font: {
                        fontFiles: ['./SourceHanSerifCN-Light-subset.ttf'], // Load custom fonts.
                        loadSystemFonts: false, // It will be faster to disable loading system fonts.
                        defaultFontFamily: 'Source Han Serif CN Light',
                    },
                }
                const resvg = new Resvg(svg, opts)
                // contain or cover
                const pngData = resvg.renderWithStyle('contain', 1280, 720);
                //const buffer = pngData.asBuffer(); // RGBA32,     
                const buffer = pngData.asPng();    
                response.end(buffer);
            });
            return;
        } else if ( (matches = request.url.match(/^\/(.+\/)?laughing(\..+)?(\?.*)?$/i)) !== null ) {
                // sresponse.writeHead(200, { 'Content-Type': 'image/png' });
                promises.readFile(join(__dirname, './GITS_laughingman.svg'))
                .then(function (svg) {
                    const opts = { /// background style
                        background: 'rgba(238, 235, 230, .9)',
                        fitTo: {
                            mode: 'width',
                            value: 1280,
                        },
                        font: {
                            fontFiles: ['./The Bold Font 700.ttf'], // Load custom fonts.
                            loadSystemFonts: false, // It will be faster to disable loading system fonts.
                            defaultFontFamily: 'Source Han Serif CN Light',
                        },
                    }
                    const resvg = new Resvg(svg, opts)
                    // contain or cover
                    const pngData = resvg.renderWithStyle('contain', 1280, 720);
                    //const buffer = pngData.asBuffer(); // RGBA32,     
                    const buffer = pngData.asPng();    
                    response.end(buffer);
                });
                return;
            } else if ( (matches = request.url.match(/^\/(.+\/)?time(\..+)?(\?.*)?$/i)) !== null ) {
                let canvas = new Canvas(1280, 720),
                ctx = canvas.getContext("2d"),
                {width, height} = canvas;
                ctx.filter = 'none'
                
                ctx.fillStyle = "#764abc";
                ctx.fillRect(0, 0, width, height);

                // ctx.globalCompositeOperation = 'destination-in'
                ctx.font='italic 128px Times, DejaVu Serif'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'top';
                let s = (Date.now()/1000) % (24*3600);
                let t = { secs: Math.floor(s), h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: Math.floor(s % 60), f: Math.floor(s * 25) % 25 }
                let text = ''+(t.h<10?'0'+t.h:t.h)+':'
                +(t.m<10?'0'+t.m:t.m)+':'
                +(t.s<10?'0'+t.s:t.s)+':'
                +(t.f<10?'0'+t.f:t.f);
                // Fill the rectangle with purple
                ctx.fillStyle = "#ffffff";
                ctx.fillText(text, width/2, 0)

                // ctx.drawImage(svg, 100, 100);

                canvas.png.then(function (pngData) {
                    // enforcing a content length to prevent chuncked encoding not handled by libav
                    response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': Buffer.byteLength(pngData) });
                    //response.setHeader();
                    // this is sending content as a single file with a content-length
                    response.end(pngData);
                });
            //});
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





async function main() {
    const svg = await promises.readFile(join(__dirname, './RCA_Indian_Head_Test_Pattern.svg'));
    const opts = {
        background: 'rgba(238, 235, 230, .9)',
        fitTo: {
            mode: 'width',
            value: 1280,
        },
        font: {
        fontFiles: ['./SourceHanSerifCN-Light-subset.ttf'], // Load custom fonts.
        loadSystemFonts: false, // It will be faster to disable loading system fonts.
        defaultFontFamily: 'Source Han Serif CN Light',
        },
    }
    const resvg = new Resvg(svg, opts)
    const pngData = resvg.render();
    const buffer = pngData.asBuffer(); // RGBA32,     
    //const buffer = pngData.asPng();    
}

//main();