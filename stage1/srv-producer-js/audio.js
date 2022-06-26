const beamcoder = require('./beamcoder.node')


async function run() {
    const muxers = beamcoder.muxers();
    console.assert(muxers['mp3'] !== undefined);
    const mux = await beamcoder.muxer({ format_name: 'mp3', 
        vsync: 0, tune: 'zerolatency', flags: 'low_delay', fflags: 'flush_packets'
    });

    // https://forum.videohelp.com/threads/373264-FFMpeg-List-of-working-sample-formats-per-format-and-encoder
    let astr = null;
    let aencParams = null;
    let aencoder = null;
    const audioSamplerate = 16000;
    const audioFormat = 's16';
    const audioChannels = 1;
    const audioBitsPerSample = 16 * audioChannels;
    const audioBitrate = audioSamplerate * audioBitsPerSample;
    // http://underpop.online.fr/f/ffmpeg/help/aac.htm.gz
    // https://github.com/Streampunk/beamcoder#creating-frames
    const encoders = beamcoder.encoders();
    aencParams = {
        name: 'mp3', // aac
        sample_rate: audioSamplerate, // mp3-128Khz = 128000 samples per second 
        channels: 1,
        channel_layout: 'mono',
        // profile: 'aac_low',
        time_base: [1, audioSamplerate],
        bit_rate: 64000, //audioBitrate, //960000, //2000000,
        max_rate: 64000, //audioBitrate, //?
        sample_fmt: audioFormat,
        // frame_size: ???
    }; 
    aencoder = await beamcoder.encoder(aencParams);

    astr = mux.newStream({
        name: 'mp3',
        time_base: [1, audioSamplerate],
        interleaved: false,  // Set to false for manual interleaving, true for automatic
    });
    Object.assign(astr.codecpar, {
        channels: 1,               
        channel_layout: 'mono',
        format: audioFormat, //'fltp', //'s16',
        sample_rate: audioSamplerate, // 44100
        //block_align: 4, // Should be set for WAV
        bits_per_coded_sample: audioBitsPerSample, // 2 * S16 (stereo) = 32, 1 * FLTP (mono) = 32
        bit_rate: 64000, //requested bitrate (should be inferior to sampleRate * 6 ) 4 = 1 channel of float
    });

    await mux.openIO({
         url: 'file:./test.mp3'
         //url: 'rtmp://127.0.0.1/live/teststream'
    });

    // after this, streams may get different base time
    await mux.writeHeader();

    let aframe = null;
    const sampleFmts = beamcoder.sample_fmts();
    aframe = beamcoder.frame({ // should be related to encoder
        channels: 1,
        channel_layout: 'mono', // stereo
        sample_rate: audioSamplerate,
        format: audioFormat,
        //frame_size: 10000, // does nothing
        nb_samples: aencoder.frame_size, // this is it ! Is frame_size parametrable
    }).alloc();         
    // data length will be: nb_samples * audioFormat bytes = 576 * 2 = 1152 bytes

    // ts_b = ts_a * (tb_a[0] / tb_a[1]) / (tb_b[0] / tb_b[1])
    // ts_b = ts_a * (tb_a[0] / tb_a[1]) * (tb_b[1] / tb_b[0])
    // ts_b = ts_a * (tb_a[0] * tb_b[1]) / (tb_a[1] * tb_b[0])
    function ts_convert(tb_a, ts_a, tb_b) {
        let ts_b =  ts_a * (tb_a[0] * tb_b[1]);
        ts_b = ts_b / (tb_a[1] * tb_b[0]);
        return ts_b;
    }          

    let apackets = null;
    aframe.total_time = 1000;
    let angle = 0;
    for (i=0; i<1000; i++) {
         aframe.pts = i; // * 200000 + j;
         const linesize = aframe.linesize; // 576 sample * 2 bytes
         const buffer = aframe.data[0];
         for ( let x = 0 ; x < linesize[0]/2 ; x++ ) {
              //buffer[x] = Math.random() * 255;
              const value = Math.sin(angle) * 32767;
              angle += 0.3;
              buffer.writeInt16LE(value, x * 2);
         }
         apackets = await aencoder.encode(aframe);
         //if (apackets.packets.length>0) break;
        //await aencoder.flush();
        for (const pkt of apackets.packets) {
            // 1 frame = 1/25s * 1000
            pkt.stream_index = astr.index;
            pkt.duration = ts_convert(aencoder.time_base, 1, astr.time_base); // frame ?
            // presentation time stamp * frame size
            pkt.pts = ts_convert(aencoder.time_base, pkt.pts, astr.time_base); // * 100;
            // decoding time stamp * frame size
            pkt.dts = ts_convert(aencoder.time_base, pkt.dts, astr.time_base); // * 100;
            await mux.writeFrame(pkt);
    }
   }

    aencoder.flush();
    await mux.writeTrailer();
}

// Encode to RTMP
run();
console.log('finished.');