const beamcoder = require('./beamcoder.node')

module.exports.init = init;
module.exports.start = start;
module.exports.get = get;
module.exports.finish = finish;
module.exports.shutdown = init;

let muxer = null;
let muxerOutputUrl = '';

async function init(url) {
    // create  container    
    const muxers = beamcoder.muxers();    
    console.assert(muxers['mp3'] !== undefined);
    console.assert(muxers['mp4'] !== undefined);
    console.assert(muxers['flv'] !== undefined);
    muxer = await beamcoder.muxer({ 
        format_name: 'flv', 
        vsync: 0,
        tune: 'zerolatency',    // tuned for realtime streaming
        flags: 'low_delay',
        fflags: 'flush_packets',
        fdebug: 'ts',
    });

    muxerOutputUrl = url;            
    return muxer;
}

function get() {
    return muxer;
}

async function start() {
    await muxer.openIO({
        //url: 'file:./test.m4a'
        url: muxerOutputUrl //'file:./test.flv'
        //url: 'rtmp://127.0.0.1/live/teststream'
   });

   // after this, streams may get different base time
   return muxer.writeHeader();
}


async function finish() {
    muxer.writeTrailer();
}

async function shutdown() {
}

