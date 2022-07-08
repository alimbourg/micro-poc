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
module.exports.process = (typeof process === 'function' ? process : dummy)
module.exports.finish = (typeof finish === 'function' ? finish : dummy)
module.exports.shutdown = (typeof shutdown === 'function' ? shutdown : dummy)
module.exports.generate = (typeof generate === 'function' ? generate : dummy)

let parentMuxer = null;

const videoWidth = 1280;
const videoHeight = 720;

let videoEncoder = null;
let videoStream = null;
let videoFrame = null;

let mireFrame = null;

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
        // Doing this to force beamcoder calling avcodec_open2 at creation, and not at first frame encoding  
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
    videoFrame = await beamcoder.frame({
        width: vencParams.width,
        height: vencParams.height,
        format: vencParams.pix_fmt
   }).alloc();

    // beamcoder is opening codec for @ frame video encoding, this is a way to force it here
    // videoFrame.pts = -1;
    // const packets = await videoEncoder.encode(videoFrame);
    // console.log('before videoEncoder has extradata, frame ' + videoFrame.pts);
    // videoStream.codecpar.extradata = videoEncoder.extradata.slice(0);
}

/**
 * process one video frame (frame per frame basis), encode itan dfeed it to the muxer
 */
async function process() {
    if ((videoEncoder === null) || (videoStream === null) || (videoFrame === null)) return;
    // ts_b = ts_a * (tb_a[0] / tb_a[1]) / (tb_b[0] / tb_b[1])
    // ts_b = ts_a * (tb_a[0] / tb_a[1]) * (tb_b[1] / tb_b[0])
    // ts_b = ts_a * (tb_a[0] * tb_b[1]) / (tb_a[1] * tb_b[0])
    function ts_convert(tb_a, ts_a, tb_b) {
        let ts_b =  ts_a * (tb_a[0] * tb_b[1]);
        ts_b = ts_b / (tb_a[1] * tb_b[0]);
        return ts_b;
    }          
   
    let vpackets = await videoEncoder.encode(mireFrame === null ? videoFrame : mireFrame);
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
        console.log('video pts:', pkt.pts, ' frame:', videoFrame.pts, ' time:', videoFrame.pts/25);
    }

}

async function shutdown() {

}


async function generate(frame) {
    if (mireFrame !== null) return;
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

//test();
async function testDecode() {
    const decoders = beamcoder.decoders();
    const demuxer = await beamcoder.demuxer('file:'+'../srv-videogen-html/cache/mire.jpg');
    let decoder = await beamcoder.decoder({ demuxer: demuxer, stream_index: 0, pix_fmt: 'yuv420p' }); 
    let packet = await demuxer.read();
    let decResult = await decoder.decode(packet); // Decode the frame
    if (decResult.frames.length === 0) { // Frame may be buffered, so flush it out
        decResult = await dec.flush();
    }
    mireFrame = decResult.frames[0]; 
    // decResult.frames[0] is good to go, as a frame
    // jpegResult.packets[0].data;
}

testDecode();