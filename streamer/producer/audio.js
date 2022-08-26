const beamcoder = require('./beamcoder.node')

function dummy() {}
module.exports.init = (typeof init === 'function' ? init : dummy)
module.exports.start = (typeof start === 'function' ? start : dummy)
module.exports.process = (typeof process === 'function' ? process : dummy)
module.exports.processAndStream = (typeof process === 'function' ? process : dummy)
module.exports.finish = (typeof finish === 'function' ? finish : dummy)
module.exports.shutdown = (typeof shutdown === 'function' ? shutdown : dummy)
module.exports.pushS16 = pushS16;
module.exports.generate = (typeof generate === 'function' ? generate : dummy)

let parentMuxer = null;

let audioSamplerate = 48000; // for flv + aac, it must(!) be one of the 44100 value, else ffprobe wont report mono
let audioFormat = 's16';
let audioFormatBitCount = 0;
const audioChannels = 1;
const audioLayout = 'mono';
let audioBitsPerSample = audioFormatBitCount * audioChannels;
let audioBytesPerSample = audioBitsPerSample / 8;
let audioBitrate = audioSamplerate * audioBitsPerSample;

let audioEncoder = null;
let audioFrame = null;
let audioStream = null;

let audioBuffer = null; // this ios the queue of data waiting to be encoded and pushed to stream


async function test_flv() {
    // Muxer Time !
    const muxers = beamcoder.muxers();    
    console.assert(muxers['mp3'] !== undefined);
    console.assert(muxers['mp4'] !== undefined);
    console.assert(muxers['flv'] !== undefined);
    const mux = await beamcoder.muxer({ 
        format_name: 'flv', 
        vsync: 0,
        tune: 'zerolatency',    // tuned for realtime streaming
        flags: 'low_delay',
        fflags: 'flush_packets',
        fdebug: 'ts',
    });

    // https://forum.videohelp.com/threads/373264-FFMpeg-List-of-working-sample-formats-per-format-and-encoder
    let astr = null;
    let aencParams = null;
    let aencoder = null;
    const audioSamplerate = 48000; // for flv + aac, it must(!) be one of the 44100, 48000 value, else ffprobe wont report mono
    const audioFormat = 's16';
    const audioFormatBitCount = {'fltp': 32, 's16': 16}[audioFormat];
    const audioChannels = 1;
    const audioBitsPerSample = audioFormatBitCount * audioChannels;
    const audioBytesPerSample = audioBitsPerSample / 8;
    const audioBitrate = audioSamplerate * audioBitsPerSample;
    // http://underpop.online.fr/f/ffmpeg/help/aac.htm.gz
    // https://github.com/Streampunk/beamcoder#creating-frames
    const encoders = beamcoder.encoders();
    // encoders['aac'].sample_fmts[0] fltp
    // encoders['aac'].supported_samplerates[]
    // to know all capabilities for an ancoder: ffmpeg -h encoder=XXX
    aencParams = {
        name: 'aac', //'mp3', // aac
        // profile: 1, //'low',
        sample_rate: audioSamplerate, // mp3@128Khz = 128000 samples per second 
        channels: 1,
        channel_layout: 'mono',
        time_base: [1, audioSamplerate],
        bit_rate: audioSamplerate * 4, // requested bitrate should be sampleRate * 6,142 max for aac, audioBitrate, //960000, //2000000,
        max_rate: audioSamplerate * 4, //audioBitrate, //?
        sample_fmt: audioFormat,
        // frame_size: 2048, this is set by the encoder and cant be changed
    };
    aencoder = await beamcoder.encoder(aencParams);
    // frame_size may be zero if codec has 'variable frame size capabilities':
    //   if so it should be forced to a second of data
    // aencoder did set the frame_size (Number of samples per channel in an audio frame). 576 for mp3 1024 m4a fe.
    console.log(`audio frame size is ${aencoder.frame_size} samples or ${aencoder.frame_size / aencoder.sample_rate}s.`)
    console.log(`  requested bitrate is ${aencoder.bit_rate/(1024)}kb/s (kilobits per second)`)

    astr = await mux.newStream({
        name: 'aac', //'mp3',
        time_base: [1, audioSamplerate],
        interleaved: false,  // Set to false for manual interleaving, true for automatic
        // channels: 1,
        // channel_layout: 'mono',
    });
    Object.assign(astr.codecpar, {
        channels: 1,
        channel_layout: 'mono',
        format: audioFormat, //'fltp', //'s16',
        sample_rate: audioSamplerate, // 44100
        block_align: 4, // Should be set for WAV
        bits_per_coded_sample: audioBitsPerSample, // 2 * S16 (stereo) = 32, 1 * FLTP (mono) = 32
        bit_rate: aencoder.bit_rate, //requested bitrate (should be inferior to sampleRate * 6.14 ) 4 = 1 channel of float
        frame_size: aencoder.frame_size, // requested by aac streams: it needs to 'know'
        sample_rate: aencoder.sample_rate,
        bits_per_sample: 32,
    });

    await mux.openIO({
         //url: 'file:./test.m4a'
         url: 'file:./test.flv'
         //url: 'rtmp://127.0.0.1/live/teststream'
    });

    // after this, streams may get different base time
    await mux.writeHeader();

    let aframe = null;
    const sampleFmts = beamcoder.sample_fmts();
    aframe = beamcoder.frame({ // should be related to encoder
        channels: aencoder.channels,
        channel_layout: aencoder.channel_layout,
        sample_rate: aencoder.sample_rate,
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
    //aframe.total_time = 1000;
    let angle = 0;
    for (i=0; i<1000; i++) {
        //const linesize = aframe.linesize; // 576 sample * 2 bytes
        const bytePerSample = (audioBitsPerSample / 8)
        const nbSamples = aframe.linesize / bytePerSample;
        const buffer = aframe.data[0];

        aframe.pts = i * nbSamples; // optional for mp3, mandatory for mp4
        for ( let x = 0 ; x < nbSamples ; x++ ) {
            //buffer[x] = Math.random() * 255;
            if (audioFormat === 's16') {
                const value = Math.sin(angle) * 32767;
                angle += 0.3;
                buffer.writeInt16LE(value, x * (bytePerSample));
            } 
            if (audioFormat === 'fltp') {
                const value = Math.sin(angle);
                angle += 0.2;
                buffer.writeFloatLE(value, x * (bytePerSample));
            }
        }
        apackets = await aencoder.encode(aframe);
         //if (apackets.packets.length>0) break;
        //await aencoder.flush();
        for (const pkt of apackets.packets) {
            pkt.stream_index = astr.index;
            // optional for mp3, mandatory for mp4
            pkt.duration = ts_convert(aencoder.time_base, pkt.duration, astr.time_base); // frame ?
            // presentation time stamp * frame size
            pkt.pts = ts_convert(aencoder.time_base, pkt.pts, astr.time_base); // * 100;
            // decoding time stamp * frame size
            pkt.dts = ts_convert(aencoder.time_base, pkt.dts, astr.time_base); // * 100;
            await mux.writeFrame(pkt);
        }
    }
    aencoder.flush();
    // duration and filesize should not be updated when streaming 
    await mux.writeTrailer();
}

const Muxer = require('./muxer')

async function test_rtmp() {

    const start = Date.now();
    await Muxer.init('rtmp://127.0.0.1/live/teststream');
    await init(Muxer.get());

    const samples = [];
    for (let s16=0; s16<22050 / 25; s16++) { // One video frame (1/25th second, 25fps) of audio
        const value = Math.sin((s16 * Math.PI * 2) / (22050 / 250)) * 32767;
        samples.push(Math.floor(value));
    }
    
    Muxer.start();
    // start();
    
    // await init('file:./test.flv');
    for (var i=0; i<1000; i++) {
        // await sleep(50/25)
        await pushS16(samples, 22050 + i * 30); // pushing some data at a sample rate, 1754 samples per video frame
        await process(1/25); // will feed that amount of data to a file, rtmp
        // audio.pushAndProcess(samples, 44100 / 25, 1 / 25); // 1754 samples per video frame
        console.log('f:'+i+' ts:'+(i/25)+' time=', (Date.now() - start)/1000, 's.');
    }
    // await finish();
    Muxer.finish();

    await shutdown();
    Muxer.shutdown();

}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 
 * @param {Object} muxer the ffmpeg low level object for stream creation and so forth
 */
async function init(muxer) {
    parentMuxer = muxer;
    // https://forum.videohelp.com/threads/373264-FFMpeg-List-of-working-sample-formats-per-format-and-encoder
    // http://underpop.online.fr/f/ffmpeg/help/aac.htm.gz
    // https://github.com/Streampunk/beamcoder#creating-frames
    const encoders = beamcoder.encoders();
    // encoders['aac'].sample_fmts[0] fltp
    // encoders['aac'].supported_samplerates[]
    // to know all capabilities for an ancoder: ffmpeg -h encoder=XXX
    audioCodecName = 'libfdk_aac';// 'aac';
    const encoderDesc = encoders[audioCodecName];
    audioFormat = encoderDesc.sample_fmts.includes('s16')?'s16':encoderDesc.sample_fmts.includes('fltp') ? 'fltp':'';
    console.assert(audioFormat!=='');
    console.assert(encoderDesc.supported_samplerates.includes(audioSamplerate)); // 48000
    // audioSamplerate = audioSamplerate; // mandatory for aac => flv => rtmp

    audioFormatBitCount = {'fltp': 32, 's16': 16}[audioFormat];
    audioBitsPerSample = audioFormatBitCount * audioChannels;
    audioBytesPerSample = audioBitsPerSample / 8;
    audioBitrate = audioSamplerate * audioBitsPerSample;

    let aencParams = {
        name: audioCodecName, //'mp3', // aac
        // profile: 1, //'low',
        sample_rate: audioSamplerate, // mp3@128Khz = 128000 samples per second 
        channels: audioChannels,
        channel_layout: audioLayout,
        time_base: [1, audioSamplerate],
        bit_rate: audioSamplerate * 4, // requested bitrate should be sampleRate * 6,142 max for aac, audioBitrate, //960000, //2000000,
        max_rate: audioSamplerate * 4, //audioBitrate, //?
        sample_fmt: audioFormat,
        flags: { GLOBAL_HEADER: true, LOW_DELAY: true,  },
        flags2: { FAST: true },
        // frame_size: 2048, this is set by the encoder and cant be changed
    };
    audioEncoder = await beamcoder.encoder(aencParams);    
    // frame_size may be zero if codec has 'variable frame size capabilities':
    //   if so it should be forced to a second of data
    // aencoder did set the frame_size (Number of samples per channel in an audio frame). 576 for mp3 1024 m4a fe.
    console.log(`audio frame size is ${audioEncoder.frame_size} samples or ${audioEncoder.frame_size / audioEncoder.sample_rate}s.`)
    console.log(`  requested bitrate is ${audioEncoder.bit_rate/(1024)}kb/s (kilobits per second)`)

    audioStream = parentMuxer.newStream({
        name:  audioEncoder.name, //'aac', //'mp3',
        time_base: [1, audioSamplerate],
        interleaved: false,  // Set to false for manual interleaving, true for automatic
        // channels: 1,cd ..
        // channel_layout: 'mono',
    });
    for (prop in audioStream.codecpar) {
        if (typeof audioStream.codecpar[prop] === 'function') continue;
        if (!audioEncoder.hasOwnProperty(prop)) continue;
        if (audioStream.codecpar[prop] == audioEncoder[prop]) continue;
        if (audioStream.codecpar[prop] != 0) continue;
        console.log('audio copying ', prop);
        audioStream.codecpar[prop] = audioEncoder[prop];
    }

    Object.assign(audioStream.codecpar, {
        channels: 1,
        channel_layout: 'mono',
        format: audioFormat, //'fltp', //'s16',
        sample_rate: audioSamplerate, // 44100
        block_align: 4, // Should be set for WAV
        bits_per_coded_sample: audioBitsPerSample, // 2 * S16 (stereo) = 32, 1 * FLTP (mono) = 32
        bit_rate: audioEncoder.bit_rate, //requested bitrate (should be inferior to sampleRate * 6.14 ) 4 = 1 channel of float
        frame_size: audioEncoder.frame_size, // requested by aac streams: it needs to 'know' that
        sample_rate: audioEncoder.sample_rate,
        bits_per_sample: audioBitsPerSample,
    });
    Object.assign(audioStream.codecpar, { extradata: audioEncoder.extradata });
    // alloc on einternal buffer
    audioBuffer = createAudioBuffer(); // this is the internal audio queue 
    audioEncodedSampleCount = 0;

    // alloc one encoder frame
    audioFrame = null;
    const sampleFmts = beamcoder.sample_fmts();
    audioFrame = await beamcoder.frame({ // should be related to encoder
        channels: audioEncoder.channels,
        channel_layout: audioEncoder.channel_layout,
        sample_rate: audioEncoder.sample_rate,
        format: audioFormat,
        //frame_size: 10000, // does nothing
        nb_samples: audioEncoder.frame_size, // this is it ! encoder.frame_size is not parametrable, given by encoder/codec
    }).alloc();
    // data length will be: nb_samples * audioFormat bytes = 576 * 2 = 1152 bytes
/*
    await muxer.openIO({
         //url: 'file:./test.m4a'
         url: outputUrl //'file:./test.flv'
         //url: 'rtmp://127.0.0.1/live/teststream'
    });

    // after this, streams may get different base time
    await muxer.writeHeader();
    */
}

function createAudioBuffer() {
    //var pointer = 0, 
    let buffer = []; 
    return {
        get  : function(key) { return buffer[key]; },        
        length: function() { return buffer.length; },
        pushOne : function(item) {
            buffer.push(item); //[pointer] = item;
            //pointer = (length + pointer + 1) % length;
        },
        pushSome : function(some) {
            buffer = buffer.concat(some);
            //pointer = (length + pointer + 1) % length;
            return buffer;
        },
        flush: function(length) {
            const deleted = buffer.splice(0, length);
            return buffer;
        },
    };    
}

/**
 * Push some S16 samples @ a frequency into an internal audio buffer.
 * This will transform data (frequency scaling and format) according to the encoder requirements
 * @param {array} samples 
 * @param {numeric} frequency 
 * @returns duration of stored data
 */
async function pushS16(samples, frequency, nbChannels = 1) {
    // scale and convert format here.
    if ((frequency === audioSamplerate)&&(audioFormat === 's16')&&(nbChannels === audioChannels)) {
        audioBuffer.pushSome(samples);
        return samples.length / audioSamplerate;
    }
    const ratio = audioSamplerate / frequency; //  => dst / src = 44100 / 8000 => we need 5.5 more samples in dst than in src
    const invRatio = frequency / audioSamplerate;
    _nbDstSamples = samples.length * ratio;
    nbDstSamples = Math.ceil(_nbDstSamples);//.toFixed();
    //if (nbDstSamples !== _nbDstSamples) nbDstSamples++;
    for (var s = 0; s < nbDstSamples; s++) {
        _srcIndex = s * invRatio;
        i = Math.floor(_srcIndex);//.toFixed();
        t = _srcIndex - i;
        console.assert((i>=0) && (i<samples.length));
        if (i >= (samples.length-1)) {
            sample = samples[samples.length - 1];
        } else {
            // interpolation here
            sample = samples[i] * (1 - t) + samples[i + 1] * t;
        }
        sample = sample < -32767 ? -32767 : ((sample > 32768) ? 32768 : Math.floor(sample)); 
        //if (audioFormat === 's16') {
        //    audioBuffer.push(sample);
        if (audioFormat === 'fltp') {
            sample = sample > 0 ? sample/32768.0 : sample/32767.0;
        }
        //console.log(sample, '\n');
        console.assert(!isNaN(sample));
        audioBuffer.pushOne(sample);
    }
}

/**
 * Simple generator, for testing purpose
 * @param {int} frame 
 */
async function generate(frame, duration=1/25) {
    if ((audioEncoder === null)||(audioBuffer === null)) return;
    // produce 1/25 second worth of sample data
    const samples = [];
    const sampleCount = audioEncoder.sample_rate * duration;
    for (let s16 = 0; s16 < sampleCount; s16 ++) { // One video frame (1/25th second, 25fps) of audio
        const value = Math.sin((s16 * Math.PI * 2) / (sampleCount / 10)) * 32767;
        samples.push(Math.floor(value));
    }
    await pushS16(samples, audioEncoder.sample_rate); //22050 + (frame % 1000) * 20); // pushing some data at a sample rate, 1754 samples per video frame
}



/**
 * Mux some audio (duraiton max) final rtmp stream with audio
 * @param {Numeric} duration 
 */
async function process(duration) {
    // ts_b = ts_a * (tb_a[0] / tb_a[1]) / (tb_b[0] / tb_b[1])
    // ts_b = ts_a * (tb_a[0] / tb_a[1]) * (tb_b[1] / tb_b[0])
    // ts_b = ts_a * (tb_a[0] * tb_b[1]) / (tb_a[1] * tb_b[0])
    function ts_convert(tb_a, ts_a, tb_b) {
        let ts_b =  ts_a * (tb_a[0] * tb_b[1]);
        ts_b = ts_b / (tb_a[1] * tb_b[0]);
        return ts_b;
    }          

    if (audioBuffer === null || audioEncoder === null || audioFrame === null) return;

    let apackets = null;
    
    //aframe.total_time = 1000;
    const bytePerSample = (audioBitsPerSample / 8);
    const frameSampleCount = audioFrame.linesize / bytePerSample;
    encoderFrameDuration = frameSampleCount / audioSamplerate;
    nbEncodings = audioBuffer.length() / frameSampleCount; //Math.floor(duration / encoderFrameDuration);
    
    for (numEncoding = 0; numEncoding < nbEncodings; numEncoding++) {
        //const linesize = aframe.linesize; // 576 sample * 2 bytes
        if (audioBuffer.length() < frameSampleCount) {
            // should not happen
            break;
        }
        const buffer = audioFrame.data[0];

        for ( let x = 0 ; x < frameSampleCount ; x++ ) {
            value = audioBuffer.get(x);
            if (audioFormat === 's16') {
                buffer.writeInt16LE(value, x * bytePerSample);
            } 
            if (audioFormat === 'fltp') {
                buffer.writeFloatLE(value, x * bytePerSample);
            }
        }
        audioBuffer.flush(frameSampleCount);

        audioFrame.pts = audioEncodedSampleCount; // optional for mp3, mandatory for aac       
        audioPackets = await audioEncoder.encode(audioFrame);
        audioEncodedSampleCount += frameSampleCount; 
        //if (apackets.packets.length>0) break;
        //await aencoder.flush();
        for (const pkt of audioPackets.packets) {
            pkt.stream_index = audioStream.index;
            // optional for mp3, mandatory for mp4
            pkt.duration = ts_convert(audioEncoder.time_base, pkt.duration, audioStream.time_base); // frame ?
            // presentation time stamp * frame size
            pkt.pts = ts_convert(audioEncoder.time_base, pkt.pts, audioStream.time_base); // * 100;
            // decoding time stamp * frame size
            pkt.dts = ts_convert(audioEncoder.time_base, pkt.dts, audioStream.time_base); // * 100;

            await parentMuxer.writeFrame(pkt);
            console.log('audio pts:', pkt.pts, 'audioEncodedSampleCount:', audioEncodedSampleCount, 'time:', audioEncodedSampleCount/48000);
        }
    }
}

async function shutdown() {
    if (audioEncoder !== null) {
        audioEncoder.flush();
        audioEncoder = null;
    }
    audioFrame = null;
    audioBuffer = null;
}


async function test_rtmp() {

    await Muxer.init('rtmp://127.0.0.1/live/teststream');
    await init(Muxer.get());

    const samples = [];
    for (let s16=0; s16<22050 / 25; s16++) { // One video frame (1/25th second, 25fps) of audio
        const value = Math.sin((s16 * Math.PI * 2) / (22050 / 250)) * 32767;
        samples.push(Math.floor(value));
    }
    
    Muxer.start();
    // start();
    
    // await init('file:./test.flv');
    for (var i=0; i<1000; i++) {
        // await sleep(50/25)
        await pushS16(samples, 22050 + i * 30); // pushing some data at a sample rate, 1754 samples per video frame
        await process(1/25); // will feed that amount of data to a file, rtmp
        // audio.pushAndProcess(samples, 44100 / 25, 1 / 25); // 1754 samples per video frame
        console.log('f:'+i+' ts:'+(i/25)+' time=', (Date.now() - start)/1000, 's.');
    }
    // await finish();
    Muxer.finish();

    await shutdown();
    Muxer.shutdown();

}


async function test_http_FLAC() {
    const muxers = beamcoder.demuxers();
    // from  https://radioparadise.com/listen/stream-links
    //const demuxer = await beamcoder.demuxer({ url: 'https://stream.radioparadise.com/flac', options: {}});
    const demuxer = await beamcoder.demuxer({ url: 'file:./test.flac', options: {}});
//  const demuxer = await beamcoder.demuxer({ url: 'http://www.lindberg.no/hires/test/2L-145/2L-45_stereo_01_FLAC_352k_24b.flac', options: {}});
    //console.log(demuxer.toJSON());
    const srcAudioStream = demuxer.streams.find(function (stream) { return stream.codecpar.codec_type === 'audio'; } );
    const videoDecoder = null;
    //const srcVideoStream = demuxer.streams.find(function (stream) { return stream.codecpar.codec_type === 'video'; } );
    //if (srcVideoStream) { 
    //    srcVideoDecoder = await beamcoder.decoder({ name: srcVideoStream.codecpar.name });
    //}

    const audioDecoder = await beamcoder.decoder({ name: srcAudioStream.codecpar.name });

    await Muxer.init('rtmp://127.0.0.1/live/paradise');
    await init(Muxer.get());

    Muxer.start();
    for (let t=0; t< 1000; t++) {
        const packet = await demuxer.read();
        if (packet.stream_index !== 0) continue;
        const decoded = await audioDecoder.decode(packet);
        if (decoded.frames.length === 0) continue;
        // Frame may be buffered, so flush it out
        // decoded = await decoder.flush();
        const srcAudioFrame = decoded.frames[0];
        console.log('srcAudioFrame.pts:', srcAudioFrame.pts);
        // transform this into our own s16 buffer
        const s16Array = new Int16Array(srcAudioFrame.data[0].buffer);
        const mono = [];
        for (let s = 0; s < srcAudioFrame.nb_samples; s++) {
            // stereo to mono into s16
            mono.push(Math.floor((s16Array.at(s * 2) + s16Array.at(s * 2 + 1)) / 2));
        }
        await pushS16(mono, srcAudioFrame.sample_rate, 1);
        
        await process(srcAudioFrame.nb_samples / srcAudioFrame.sample_rate); // will feed that amount of data to a file, rtmp
    }
    await finish();
    await Muxer.finish();
    await decoder.flush();    
    await shutdown();
    Muxer.shutdown();
}

console.log('mounted audio.js');

//test_http_FLAC();