const beamcoder = require('./beamcoder.node')
const Muxer = require('./muxer')
/*
module.exports.init = init;
// module.exports.start = start;
module.exports.process = process;
// module.exports.finish = finish;
module.exports.shutdown = shutdown;
*/
function dummy() {}
module.exports.init = (typeof init === 'function' ? init : dummy)
module.exports.start = (typeof start === 'function' ? start : dummy)
module.exports.pushFrame = (typeof pushFrame === 'function' ? pushFrame : dummy)
module.exports.processAndStream = (typeof process === 'function' ? process : dummy)
module.exports.finish = (typeof finish === 'function' ? finish : dummy)
module.exports.shutdown = (typeof shutdown === 'function' ? shutdown : dummy)
module.exports.generate = (typeof generate === 'function' ? generate : dummy)

let parentMuxer = null;

const videoWidth = 1280;
const videoHeight = 720;

let videoEncoder = null;
let videoStream = null;
let videoFrame1 = null;
let videoFrame2 = null;
let videoFrontBuffer = null;
let videoBackBuffer = null;
let videoBackBufferHasData = false;
// dummy
let mireFrame = null;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}



// https://stackoverflow.com/questions/48578088/streaming-flv-to-rtmp-with-ffmpeg-using-h264-codec-and-c-api-to-flv-js/48619330#48619330
async function init(muxer) {
    parentMuxer = muxer;
// https://github.com/jkuri/opencv-ffmpeg-rtmp-stream/blob/master/src/rtmp-stream.cpp#L213
    const encoders = beamcoder.encoders();
    const vencParams = {
        name: 'libx264',          
        width: videoWidth,
        height: videoHeight,
        bit_rate: 1984000, //960000, //2000000,
        max_rate: 1984000, //?
        time_base: [1, 25],
        framerate: [25, 1],
        gop_size: 3, //one intra frame every gop_size frame //fps * 2 //10,
        max_b_frames: 1,
        pix_fmt: 'yuv420p',
        priv_data: { preset: 'veryfast', profile: 'high', tune: 'zerolatency' },
        flags: { GLOBAL_HEADER: true }, // for AVCC ?
        //AV_CODEC_FLAG_GLOBAL_HEADER, 
        // Ugly patch for force beamcoder to avcode_open2 and get the necessary extra data to be duplicated into stream
        //sample_fmt: 'fltp',
        //sample_rate: 1984000/24,
        //channel_layout: 'mono'
    };
    if (vencParams.flags.GLOBAL_HEADER === true) {
        // KEEP IT LIKE this: Doing this to force beamcoder calling avcodec_open2 at creation, and not at first frame encoding  
        //   (beamcoder will do this for audio codec but not video, let's make-believe)
        Object.assign(vencParams, {
            sample_fmt: 'fltp',
            sample_rate: 1984000/24,
            channel_layout: 'mono'    
        });       
    }
    videoEncoder = await beamcoder.encoder(vencParams); 
    // STREAMS that shall have codepar correctly setted
    videoStream = await muxer.newStream({
        name: 'h264',
        time_base: [1, 90000], // 90 KHz // it wont be this once
        interleaved: true,
        avg_frame_rate: videoEncoder.framerate, //[25, 1],
        // metadata: { jelly: 'plate' } 
    }); // Set to false for manual interleaving, true for automatic
    // https://stackoverflow.com/questions/51777937/how-to-write-the-avc1-atom-with-libavcodec-for-mp4-file-using-h264-codec
    // var extra = new Uint8Array([0x01, 255, 1, 0, 0xFC | 3, 0xE0 | 1, 0]);
    for (prop in videoStream.codecpar) {
        if (typeof videoStream.codecpar[prop] === 'function') continue;
        if (!videoEncoder.hasOwnProperty(prop)) continue;
        if (videoStream.codecpar[prop] == videoEncoder[prop]) continue;
        if (videoStream.codecpar[prop] != 0) continue;
        console.log('copying ', prop);
        videoStream.codecpar[prop] = videoEncoder[prop];
    }
    /*
    Object.assign(videoStream.codecpar, {
        width: videoWidth,
        height: videoHeight,
        format: 'yuv420p',
    });
    */
    // AVCC vs AnnexB (AnnexB stores PPS info in every packet, AVCC store it once in extradata)
    // https://github.com/Streampunk/beamcoder/issues/35
    // if a decoded reencoded: vstr.codecpar.extradata = ts_demux.streams[video_index].codecpar.extradata;
    // ffprobe -SHOW_STREAMS shows 'is_avc=true'
    if (videoEncoder.flags.GLOBAL_HEADER === true) {
        console.assert(videoEncoder.extradata !== null);
        Object.assign(videoStream.codecpar, {
            extradata: videoEncoder.extradata.slice(0) 
        });
    }
    // A FRAME, that will embed
    videoFrame1 = await beamcoder.frame({
        width: vencParams.width,
        height: vencParams.height,
        format: vencParams.pix_fmt
   }).alloc();

    videoFrame2 = await beamcoder.frame({
        width: vencParams.width,
        height: vencParams.height,
        format: vencParams.pix_fmt
    }).alloc();

    videoFrontBuffer = videoFrame1;
    videoBackBuffer = videoFrame2;

    videoBackBufferHasData = false;

    // beamcoder is opening codec for @ frame video encoding, this is a way to force it here
    // videoFrame.pts = -1;
    // const packets = await videoEncoder.encode(videoFrame);
    // console.log('before videoEncoder has extradata, frame ' + videoFrame.pts);
    // videoStream.codecpar.extradata = videoEncoder.extradata.slice(0);
}

// this will create the new 'back buffer' vpackets.
// and this will become the new frame to be sent to the stream @ the next bufffer switch 
// (every 1/25th of seconds) 
async function pushFrame(newFrame) {
    // copy into backbuffer and signal
    //videoPackets = await videoEncoder.encode(newFrame);
    console.assert(newFrame.width === videoBackBuffer.width);
    console.assert(newFrame.height === videoBackBuffer.height);
    console.assert(newFrame.format === videoBackBuffer.format);
    console.assert(newFrame.data.length == videoBackBuffer.data.length);
    newFrame.data.forEach(function (data, idx) {
        console.assert(newFrame.data[idx].length <= videoBackBuffer.data[idx].length);
        data.copy(videoBackBuffer.data[idx], 0, 0, data.length ); 
    });
    //newFrame.data[1].copy(videoBackBuffer.data[1], 0, 0, newFrame.data[1].length );
    //newFrame.data[2].copy(videoBackBuffer.data[2], 0, 0, newFrame.data[2].length );
    videoBackBufferHasData = true;
    // yuv 
    //let linesize = videoFrame.linesize; // 2 linesizes, one for y data, the other for bdata and cdata
    //let [ ydata, bdata, cdata ] = videoFrame.data; // 3 buffers, y b and c
    // presentation time stamp (a frame)

}

/**
 * process one video frame (frame per frame basis), encode itan dfeed it to the muxer
 */
async function process(currentFrame) {
    if ((videoEncoder === null) || (videoStream === null) || (videoFrontBuffer === null) || (videoBackBuffer === null)) return;
    // ts_b = ts_a * (tb_a[0] / tb_a[1]) / (tb_b[0] / tb_b[1])
    // ts_b = ts_a * (tb_a[0] / tb_a[1]) * (tb_b[1] / tb_b[0])
    // ts_b = ts_a * (tb_a[0] * tb_b[1]) / (tb_a[1] * tb_b[0])
    function ts_convert(tb_a, ts_a, tb_b) {
        let ts_b =  ts_a * (tb_a[0] * tb_b[1]);
        ts_b = ts_b / (tb_a[1] * tb_b[0]);
        return ts_b;
    }          
    if (videoBackBufferHasData) {
        // switch front and back buffers
        if (videoBackBuffer === videoFrame1) {
            videoFrontBuffer = videoFrame1;
            videoBackBuffer = videoFrame2;
        } else {
            videoFrontBuffer = videoFrame2;
            videoBackBuffer = videoFrame1;
        }
        videoBackBufferHasData = false;
    }
    const frame = currentFrame; //Math.floor(currentTime * 25 / 1000);
    videoFrontBuffer.pts = frame;
/*
    const videoFrame = videoFrontBuffer;
    let linesize = videoFrame.linesize; // 2 linesizes, one for 
    let [ ydata, bdata, cdata ] = videoFrame.data; // 3 buffers, y b and c
    // presentation time stamp (a frame)
    // videoFrame.pts = frame; // this is a frame;
    for ( let y = 0 ; y < videoFrame.height ; y++ ) {
            for ( let x = 0 ; x < linesize[0] ; x++ ) {
                ydata[y * linesize[0] + x] =  x + y + frame * 3;
            }
    }

    for ( let y = 0 ; y < videoFrame.height / 2 ; y++) {
            for ( let x = 0; x < linesize[1] ; x++) {
                bdata[y * linesize[1] + x] = 128 + y + frame * 2;
                cdata[y * linesize[1] + x] = 64 + x + frame * 5;
            }
    }
*/

    let vpackets = await videoEncoder.encode(videoFrontBuffer); //mireFrame === null ? videoFrame : mireFrame);
    // send it to rtmp
    for (const pkt of vpackets.packets) {
        // 1 frame = 1/25s * 1000
        pkt.stream_index = videoStream.index;
        pkt.duration = ts_convert(videoEncoder.time_base, 1, videoStream.time_base); // frame ?
        // because frames are not necessarily stored in the presentation order,
        // we need to know when to decode them, when to present them
        // only(?) streams with B-Frames have different PTS,DTS

        // presentation time stamp * frame size
        // pkt.pts = pkt.pts * 90000/25; // in the correct time referential, standartd 90KHz / 25 = 3600 data per frame
        pkt.pts = ts_convert(videoEncoder.time_base, pkt.pts, videoStream.time_base); // * 100;
        // decoding time stamp * frame size
        pkt.dts = ts_convert(videoEncoder.time_base, pkt.dts, videoStream.time_base); // * 100;
        // pkt.dts = pkt.dts * 90000/25;
        await parentMuxer.writeFrame(pkt);
        console.log('video pts:', pkt.pts, ' frame:', videoFrontBuffer.pts, ' time:', videoFrontBuffer.pts/25);
    }

}

async function shutdown() {

}


async function generate(frame) {
    if (mireFrame !== null) {
        mireFrame.pts = frame; // this is a frame;
        return;
    }
    if (videoFrame === null) return;

    // await sleep(400/25);
    let linesize = videoFrame.linesize; // 2 linesizes, one for 
    let [ ydata, bdata, cdata ] = videoFrame.data; // 3 buffers, y b and c
    // presentation time stamp (a frame)
    videoFrame.pts = frame; // this is a frame;

    for ( let y = 0 ; y < videoFrame.height ; y++ ) {
            for ( let x = 0 ; x < linesize[0] ; x++ ) {
                ydata[y * linesize[0] + x] =  x + y + frame * 3;
            }
    }

    for ( let y = 0 ; y < videoFrame.height / 2 ; y++) {
            for ( let x = 0; x < linesize[1] ; x++) {
                bdata[y * linesize[1] + x] = 128 + y + frame * 2;
                cdata[y * linesize[1] + x] = 64 + x + frame * 5;
            }
    }

}

// this test creates a video stream using front and back buffers
async function test() {

    await testDecodeImage();

    const start = Date.now();

    await Muxer.init('rtmp://127.0.0.1/live/test');    
    //await Muxer.init('file:./test.flv');    

    await init(Muxer.get());

    Muxer.start(); // it will work without audio
    // start();    
    // await init('file:./test.flv');
    for (var i=0; i<1000; i++) {
        await sleep(500/25);
        if (mireFrame !== null) {
            await pushFrame(mireFrame); // into BackBuffer
        } else {
            // it's ugly but that's ok
            const videoFrame = videoFrontBuffer;
            let linesize = videoFrame.linesize; // 2 linesizes, one for 
            let [ ydata, bdata, cdata ] = videoFrame.data; // 3 buffers, y b and c
            // presentation time stamp (a frame)
            videoFrame.pts = i; // this is a frame;
    
            for ( let y = 0 ; y < videoFrame.height ; y++ ) {
                for ( let x = 0 ; x < linesize[0] ; x++ ) {
                    ydata[y * linesize[0] + x] =  x + y + i * 3;
                }
            }
    
            for ( let y = 0 ; y < videoFrame.height / 2 ; y++) {
                for ( let x = 0; x < linesize[1] ; x++) {
                    bdata[y * linesize[1] + x] = 128 + y + i * 2;
                    cdata[y * linesize[1] + x] = 64 + x + i * 5;
                }
            }

            await pushFrame(videoFrame); // into BackBuffer
        }
        // or
        // getBackBuffer() -> backBufferFrame
        // await signalBackBufferHasData() -> backBufferHasData

        await process(i); // will feed one frame to the stream

        console.log('video f:'+i+' ts:'+(i/25)+' time=', (Date.now() - start)/1000, 's.');
    }
    // await finish();
    Muxer.finish();

    await shutdown();

    Muxer.shutdown();
}

//test();
async function testDecodeImage() {
    const demuxers = await beamcoder.demuxers();
    // const decoders = beamcoder.decoders();
    //const demuxer = await beamcoder.demuxer('file:'+'../srv-videogen-html/cache/mire.jpg');
    // using iformat as an option ?
    const url = 'http://127.0.0.1:3000/time';
    let demuxer = null;
    // const iformat = demuxers['png_pipe'];
    if ( (matches = url.match(/\.jp[e]?g$/i)) !== null ) {
        //const iformat = demuxers['mjpeg'];
        const iformat = demuxers['jpeg_pipe']; // image2 is chosen by default but need to seek back and forth (works only with local fule) NOFILE flag could be true in this case
        demuxer = await beamcoder.demuxer({ url: url, iformat: iformat });
    } else {
        //demuxer = await beamcoder.demuxer( url);
        demuxer = await beamcoder.demuxer({ url: url });
    }
    // await demuxer.seek({ stream_index: 0, timestamp: 0 });
    const stream = demuxer.streams[0];
    // demuxer.streams[0].nb_frames = 1;
    let decoder = await beamcoder.decoder({ name: stream.codecpar.name });
    // let decoder = await beamcoder.decoder({ demuxer: demuxer, stream_index: 0 }); 
    let packet = await demuxer.read();
    let decResult = await decoder.decode(packet); // Decode the frame, likely into yuv420p
    if (decResult.frames.length === 0) { // Frame may be in some buffer limbo, so flush it out
        decResult = await dec.flush();
    }
    // decResult.frames[0] is good to go, as a frame
    const frame = decResult.frames[0]; 

    const filterer = await beamcoder.filterer({
        filterType: 'video',
        inputParams: [
          {
            width: frame.width,
            height: frame.height,
            pixelFormat: frame.format,
            timeBase: [1, 25], //vidStream.time_base,
            pixelAspect: frame.sample_aspect_ratio,
          }
        ],
        outputParams: [
          {
            pixelFormat: 'yuv420p'
          }
        ],
        filterSpec: 'scale=1280:720', //'scale=1280:720'
    });
    const out = await filterer.filter([frame]);
    mireFrame = out[0].frames[0];
    const path = `./cache/test`;
    const fs = require('fs');
    {
        let frame = mireFrame;

        const buf = Buffer.allocUnsafe(8*4).fill(0);
        buf.writeUint32LE(frame.width, 0);
        buf.writeUint32LE(frame.height, 4);
        Buffer.from(frame.format).copy(buf, 8, 0, 8);
        buf.writeUint32LE(frame.data[0].length, 16);
        if (frame.data.length > 1) buf.writeUint32LE(frame.data[1].length, 20);
        if (frame.data.length > 2) buf.writeUint32LE(frame.data[2].length, 24);
        if (frame.data.length > 3) buf.writeUint32LE(frame.data[3].length, 28);

        const fd = fs.openSync(path, 'w');
        fs.writeSync(fd, buf);
        fs.writeSync(fd, frame.data[0]);
        if (frame.data.length > 1) fs.writeSync(fd, frame.data[1]);
        if (frame.data.length > 2) fs.writeSync(fd, frame.data[2]);
        if (frame.data.length > 3) fs.writeSync(fd, frame.data[3]);
        console.log(`caching ${fs.fstatSync(fd).size} bytes, written in ${path}`);
        fs.closeSync(fd);

        fs.writeFileSync(path+'.json', JSON.stringify(frame));
    }
    {
        let frame = null;
        const buf = Buffer.allocUnsafe(8*4);            
        const fd = fs.openSync(path, 'r');
        fs.readSync(fd, buf);
        const width = buf.readUint32LE(0);
        const height = buf.readUint32LE(4);
        const format = buf.subarray(8, 16).toString();
        const allDataSize = [ buf.readUint32LE(16), buf.readUint32LE(20), buf.readUint32LE(24), buf.readUint32LE(28)];
        frame = beamcoder.frame({
                width: width,
                height: height,
                format: format
            }).alloc();
        //const frameOptions = JSON.parse(fs.readFileSync(path+'.json'));
        //frame = beamcoder.frame(frameOptions);
        //frame.data = [new Uint8Array(frame.buf_sizes[0]),new Uint8Array(frame.buf_sizes[1]), new Uint8Array(frame.buf_sizes[2])];

            
        let offset = 32;        
        allDataSize.forEach(function (dataSize, index) {
            let toRead = 0;
            if (index < frame.data.length) {
                toRead = frame.data[index].length; 
                if (dataSize < toRead) toRead = dataSize;
            }
            if (toRead>0) fs.readSync(fd, frame.data[index], 0, toRead, offset);
            offset += dataSize;
        });
        fs.closeSync(fd);
        mireFrame = frame;
    }
}

const { promises } = require('fs')
const { join } = require('path')
// const { Resvg } = require('@resvg/resvg-js')
const { Resvg } = require('../svg-videogen/resvg-js')
//PNG = require("pngjs").PNG;
async function testRenderSvg() {

    await Muxer.init('rtmp://127.0.0.1/live/test');    
    //await Muxer.init('file:./test.flv');    
    await init(Muxer.get());

    const videoFrame = videoFrontBuffer;

    const svg = await promises.readFile(join(__dirname, './RCA_Indian_Head_Test_Pattern.svg'));
    const opts = {
        background: 'rgba(238, 235, 230, .9)',
        fitTo: {
            mode: 'width',
            value: videoFrame.width,
        },
        font: {
            fontFiles: ['./SourceHanSerifCN-Light-subset.ttf'], // Load custom fonts.
            loadSystemFonts: false, // It will be faster to disable loading system fonts.
            defaultFontFamily: 'Source Han Serif CN Light',
        },
    }
    const resvg = new Resvg(svg, opts)
    const imgData = resvg.render();
    const buffer = imgData.asBuffer();    

    Muxer.start(); // it will work without audio
    // start();    
    // await init('file:./test.flv');
    for (var i=0; i<1000; i++) {
        await sleep(500/25);
        // it's ugly but that's ok
        const videoFrame = videoFrontBuffer;
        let linesize = videoFrame.linesize; // 2 linesizes, one for 
        let [ ydata, bdata, cdata ] = videoFrame.data; // 3 buffers, y b and c
        // presentation time stamp (a frame)
        videoFrame.pts = i; // this is a frame;
   
        for ( let y = 0 ; y < videoFrame.height ; y++ ) {
             for ( let x = 0 ; x < linesize[0] ; x++ ) {
                  ydata[y * linesize[0] + x] =  x + y + i * 3;
             }
        }
   
        for ( let y = 0 ; y < videoFrame.height / 2 ; y++) {
             for ( let x = 0; x < linesize[1] ; x++) {
                  bdata[y * linesize[1] + x] = 128 + y + i * 2;
                  cdata[y * linesize[1] + x] = 64 + x + i * 5;
             }
        }
        if (mireFrame !== null) {
            await pushFrame(mireFrame); // into BackBuffer
        } else {
            await pushFrame(videoFrame); // into BackBuffer
        }
        // or
        // getBackBuffer() -> backBufferFrame
        // await signalBackBufferHasData() -> backBufferHasData

        await process(i); // will feed one frame to the stream

        console.log('video f:'+i+' ts:'+(i/25)+' time=', (Date.now() - start)/1000, 's.');
    }
    // await finish();
    Muxer.finish();

    await shutdown();

    Muxer.shutdown();
}

// testDecodeImage();
// testDecodePng();
// testRenderSvg();

// test();