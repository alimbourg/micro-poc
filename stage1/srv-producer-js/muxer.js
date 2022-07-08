const beamcoder = require('./beamcoder.node')

function dummy() {}
module.exports.init = typeof init === 'function' ? init : dummy;
module.exports.start = typeof start === 'function' ? start : dummy;
module.exports.get = get;
module.exports.finish = typeof finish === 'function' ? finish : dummy;
module.exports.shutdown = typeof shutdown === 'function' ? shutdown : dummy;

let muxerMaster = null;
let muxerOutputUrl = '';

async function init(url) {
    // create  container    
    const muxers = beamcoder.muxers();    
    console.assert(muxers['mp3'] !== undefined);
    console.assert(muxers['mp4'] !== undefined);
    console.assert(muxers['flv'] !== undefined);
    muxerMaster = await beamcoder.muxer({ 
        format_name: 'flv', 
        vsync: 0,
        tune: 'zerolatency',    // tuned for realtime streaming
        flags: 'low_delay',
        fflags: 'flush_packets', // no_metadata no_duration_filesize',
        fdebug: 'ts',
    });

    muxerOutputUrl = url;            
    return muxerMaster;
}

function get() {
    return muxerMaster;
}

async function start() {
    await muxerMaster.openIO({
        //url: 'file:./test.m4a'
        url: muxerOutputUrl //'file:./test.flv'
        //url: 'rtmp://127.0.0.1/live/teststream'
   });

   // after this, streams may get different base time
    await muxerMaster.writeHeader();
}


async function finish() {
    await muxerMaster.writeTrailer();
}

async function shutdown() {
}

