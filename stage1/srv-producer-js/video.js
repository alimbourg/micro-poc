const beamcoder = require('./beamcoder.node')
const Muxer = require('./muxer')
/*
module.exports.init = init;
// module.exports.start = start;
module.exports.process = process;
// module.exports.finish = finish;
module.exports.shutdown = shutdown;
*/
module.exports.init = (typeof init !== undefined ? init : dummy)
module.exports.start = (typeof start !== undefined ? start : dummy)
module.exports.process = (typeof process !== undefined ? process : dummy)
module.exports.finish = (typeof finish !== undefined ? finish : dummy)
module.exports.shutdown = (typeof shutdown !== undefined ? shutdown : dummy)

let parentMuxer = null;

const videoWidth = 1280;
const videoHeight = 720;

let videoEncoder = null;
let videoStream = null;
let videoFrame = null;

async function init(muxer) {

    parentMuxer = muxer;

    const encoders = beamcoder.encoders();
    const vencParams = {
        name: 'libx264',          
        width: videoWidth,
        height: videoHeight,
        bit_rate: 1984000, //960000, //2000000,
        max_rate: 1984000, //?
        time_base: [1, 25],
        framerate: [25, 1],
        gop_size: 2, //one intra frame every gop_size frame //fps * 2 //10,
        max_b_frames: 1,
        pix_fmt: 'yuv420p',
        priv_data: { preset: 'veryfast' }
    }; 
    videoEncoder = await beamcoder.encoder(vencParams); 

    videoStream = muxer.newStream({
        name: 'h264',
        time_base: [1, 90000], // 90 KHz
        interleaved: true }); // Set to false for manual interleaving, true for automatic
    Object.assign(videoStream.codecpar, {
        width: videoWidth,
        height: videoHeight,
        format: 'yuv420p'
    });

    videoFrame = beamcoder.frame({
        width: vencParams.width,
        height: vencParams.height,
        format: vencParams.pix_fmt
   }).alloc();

}

/**
 * process one video frame (frame per frame basis), encode itan dfeed it to the muxer
 */
async function process() {
    // ts_b = ts_a * (tb_a[0] / tb_a[1]) / (tb_b[0] / tb_b[1])
    // ts_b = ts_a * (tb_a[0] / tb_a[1]) * (tb_b[1] / tb_b[0])
    // ts_b = ts_a * (tb_a[0] * tb_b[1]) / (tb_a[1] * tb_b[0])
    function ts_convert(tb_a, ts_a, tb_b) {
        let ts_b =  ts_a * (tb_a[0] * tb_b[1]);
        ts_b = ts_b / (tb_a[1] * tb_b[0]);
        return ts_b;
    }          
   
    let vpackets = await videoEncoder.encode(videoFrame);
    //let p2 = await encoder.flush();

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
    }

}

async function shutdown() {

}


async function test() {
    const start = Date.now();
    await Muxer.init('rtmp://127.0.0.1/live/teststream');
    
    await init(Muxer.get());

    Muxer.start();
    // start();    
    // await init('file:./test.flv');
    for (var i=0; i<1000; i++) {
        // await sleep(400/25);
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

        await process(); // will feed one frame to the stream

        console.log('video f:'+i+' ts:'+(i/25)+' time=', (Date.now() - start)/1000, 's.');
    }
    // await finish();
    Muxer.finish();

    await shutdown();

    Muxer.shutdown();

}

test();
