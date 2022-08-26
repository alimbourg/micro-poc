const beamcoder = require('./beamcoder.node')
const Muxer = require('./muxer')
const Audio = require('./audio')
const Video = require('./video')

const context = {
    srcAudioUrl: 'file:./test.flac',
    dstRtmpUrl: 'rtmp://127.0.0.1:1935/live/paradise',
}

// https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Objects/Object_prototypes
// every functions have a prototype that can be enhanced:
//   if a function has the name of a class, it culd be a constructor: 
// function Person() { this.name = 'etc'; }
// Person.prototype = { ... etc }
// Person.prototype.constructor = Person
// myself = new Person(); 
async function createAudioParadiseGenerator(url) {
    const result = Object.create({
        start: async function () {
            // this is automatically binded to object instance
            this.demuxer = await beamcoder.demuxer({ url: 'file:./test.flac', options: {}});
            //  const demuxer = await beamcoder.demuxer({ url: 'http://www.lindberg.no/hires/test/2L-145/2L-45_stereo_01_FLAC_352k_24b.flac', options: {}});
                //console.log(demuxer.toJSON());
            this.stream = this.demuxer.streams.find(function (stream) { return stream.codecpar.codec_type === 'audio'; } );
            this.decoder = await beamcoder.decoder({ name: this.stream.codecpar.name });
            this.samples = [];
        },
        process: async function (currentTime) {
            const packet = await this.demuxer.read();
            let decoded = null;
            if (packet === null) { // end of stream
                decoded = await this.decoder.flush();
            } else {
                if (packet.stream_index !== this.stream.index) {
                    return;
                }
                decoded = await this.decoder.decode(packet);
            }
            if (decoded.frames.length === 0) {
                return;
            }
            const srcAudioFrame = decoded.frames[0];
            console.log('srcAudioFrame.pts:', srcAudioFrame.pts);
            // transform this into our own s16 buffer
            const s16Array = new Int16Array(srcAudioFrame.data[0].buffer);
            for (let s = 0; s < srcAudioFrame.nb_samples; s++) {
                // stereo to mono into s16
                this.samples.push(Math.floor((s16Array.at(s * 2) + s16Array.at(s * 2 + 1)) / 2));
            }    
        },
        hasData: function () {
            // TODO: has ENOUGH data ?
            return this.samples.length > 0;
        },
        getData: function () {
            return { samples: this.samples, sample_rate: 44100, channels: 1 }
        },
        flushData: function() {
            this.samples = [];
        }
    });
    await result.start(url);
    return result;
}


const stdVideoGeneratorPrototype = { // 'this' is automatically binded to object instance
    start: async function () {
        // a bit like a constructor
    }, 
    process: async function (currentTime) { // is called frequently, could be used to manage some async stuff
        // naive stuff would be to always have two frames ready: current and next.
        // let's start with this
    },
    hasData: function () {
        // TODO: has ENOUGH data ?
        return false;
    },
    getData: function (token) {
        return { samples: this.samples, sample_rate: 44100, channels: 1 }
    },
    flushData: function() {
    }
};
function createStdVideoGenerator() {
    const generator = Object.create(stdVideoGeneratorPrototype);
    return generator;
}

const https = require('https');
const querystring = require('node:querystring');
const { assert } = require('console')

const webVideoGeneratorPrototype = Object.assign(stdVideoGeneratorPrototype, {
    async start(params) { //context, generatorDescriptor, generatorParams) {
        const url = new URL(params.url);
        //url.searchParams.append(context);
        // const args = Object.assign(context, generatorParams)
        for (key in params) {
            if (key === 'url') continue;
            url.searchParams.append(key, params[key]);
        }
        try {
            this.demuxer = await beamcoder.demuxer({ url: url.toString(), options: {} });
            this.stream = this.demuxer.streams.find(function (stream) { return stream.codecpar.codec_type === 'video'; } );
            this.decoder = await beamcoder.decoder({ name: this.stream.codecpar.name });
            let packet = await this.demuxer.read();
            let decResult = await this.decoder.decode(packet); // Decode the frame, likely into yuv420p
            if (decResult.frames.length === 0) { // Frame may be in some buffer limbo, so flush it out
                decResult = await dec.flush();
            }
            // decResult.frames[0] is good to go, as a frame
            this.frame = decResult.frames[0];         
            return Promise.resolve(true);
        } catch (error) {
            return Promise.reject(error);
        }
    },
    hasData: function () { return (this.frame || null) !== null; },
    getData: function () { return (this.frame); },
    flushData: function () { this.frame = null; },
}, ); 

function createWebVideoGenerator() {
    const generator = Object.create(webVideoGeneratorPrototype);
    return generator;
}
/*
function getVideoGenerator(id) {
    switch (id) {
        case 'mire':
        case 'time':
            generator = createWebVideoGenerator();
            break;
        default:
            generator = createStdVideoGenerator();
            break;
    }
    return generator;
}
*/
// This first one is complex, beacuse it generates frame based on otherFrames
//   first creates a sequence of clips,
//     request all the clips aynchronuously
//     handle the async various states
//     for a given time, compute the clip and get the according frame
async function createVideoProducerGenerator() {
    const result = Object.create({
        test: 'tre',
        start: async function () {
            // init two frames for front and backbuffer
            // should get the frame spec from our streamer
            // compute sequence of clips
            // requests to all sub generators, handle responses 
            const duration = 3 * 60 * 1000;
            let nbClips = Math.floor(duration / 2000); 
            const clips = [];
            try {
                // https://api.radioparadise.com/api/now_playing?chan=flac (mellow, flac, ...)
                // https://api.radioparadise.com/api/get_block?bitrate=4&info=true
                for (let numClip = 0; numClip <= nbClips; numClip++) {
                    let clipDuration = 2000;
                    if (numClip === nbClips) {
                        clipDuration = duration - numClip * 2000;
                        if (clipDuration === 0) break;
                    }
                    // TODO: move this in prepare()
                    const generatorDescriptor = rscManager.directory[ numClip % rscManager.directory.length ];

                    const clip = { t: numClip * 2000, length: clipDuration, rscId: null };
                    const generationParams = Object.assign({ version: generatorDescriptor.version||'', id: generatorDescriptor.id, url: generatorDescriptor.url },
                                                                 generatorDescriptor.requestParams||{},
                                                                 { duration: clipDuration, width: 1280, height: 720, fps: 25 })
                    clip.rscId = rscManager.ask(generatorDescriptor.id, generationParams);
                    clips.push(clip);
                    /*
                    videoGenerator = getVideoGenerator(generatorDescriptor);
                    assert(videoGenerator !== null);
                    const clip = { t: numClip * 2000, length: clipDuration, generator: videoGenerator };
                    await videoGenerator.start({ t: clip.t, duration: clip.length, width: 1280, height: 720, fps: 25 }, generatorDescriptor, generatorDescriptor.params );
                    clips.push(clip);
                    */
                }
                this.clips = clips;
                this.clipsDuration = clips.length === 0 ? 0 : (clips[clips.length-1].t + clips[clips.length-1].length);
                /*
                let generatorDescriptor = null;
                let videoGenerator = null;
                for (var c=0; c<this.clips.length; c++) {
                    const clip = this.clips[c];
                    videoGenerator = clip.generator;
                }
                */
                return Promise.resolve(true);
            } catch (error) {
                return Promise.reject(error);
            }
        },
        // this will be called many times before a getData(), it allows adjusting internal variables.
        // it will be called at least once before getData
        async process(currentTime) { // is called frequently, coul dbe used to manage some async stuff
            // naive stuff would be to always have two frames ready: current and next.
            // let's start with this
            rscManager.process(currentTime);
            const normalizedTime = currentTime % this.clipsDuration;
            let t = 0;
            if (this._currentClip) {
                if ((normalizedTime >= this._currentClip.t)&&(normalizedTime < this._currentClip.t + this._currentClip.length)) {
                    return this.hasData();
                }
            }
            this._currentClip = null;
            for (var c = 0; c<this.clips.length; c++) {
                const clip = this.clips[c];
                if ((normalizedTime >= clip.t) && (normalizedTime < clip.t+clip.length)) {
                    // this is the current one
                    this._currentClip = clip;
                    break;
                }
                t += clip.length;
            }
            console.assert(this._currentClip !== null);
            return this.hasData();
        },
        hasData: function () {
            return rscManager.isAvailable(this._currentClip.rscId);
        },
        getData: function () {
            return rscManager.get(this._currentClip.rscId); // an in-mem frame may have to be allocated
        },
        flushData: function() {
            rscManager.flush(this._currentClip.rscId); // everything in mem will be discarded
        }
    });
    return result;
}

const fs = require('fs');

// const RscManagerPrototype = {
class RscManager {
    constructor() {
        this.directory = [
            { id: 'web:mire', url: 'http://127.0.0.1:3000/mire', requestParams: { width: 1024, height: 768 }, tags: 'image fast', mimes: ['image/png'], desc: 'an indian RCA generator', version: '1.0' },
            { id: 'web:time', url: 'http://127.0.0.1:3000/time', requestParams: { width: 1024, height: 768, timezone: 'europe/paris', extra: 'build by me' }, tags: 'image fast', version: '1.0', mimes: ['image/png'], desc: 'an image with a time' },
            { id: 'web:laughing', url: 'http://127.0.0.1:3000/laughing', requestParams: { width: 1024, height: 768, }, tags: 'image fast', version: '1.0', mimes: ['image/png'], desc: 'GITS SAC laughing man' },
        ];
        this.resources = {}
    }
    computeSignature(string1, string2, string3) {
        const longString = string1 + '<>' + string2 + '<>' + string3;
        const hash = require('crypto').createHash('sha256').update(longString, 'utf8').digest('hex');
        return hash;
    }
    ask(uri, params) {
        const details = uri.split(':');
        const signature = this.computeSignature(uri, JSON.stringify(params), 'v1.1');
        if (this.resources.hasOwnProperty(signature)) {
            return signature;
        }
        let rsc = null;
        switch (details[0]) {
            case 'web':
                // generator as a service
                const generator = createWebVideoGenerator();
                rsc = { signature: signature, params: params, generator: generator, inCache: false, inMem: false };
                generator.start(params)
                .then(function () {
                    if (!generator.hasData()) {
                        // should not happen, or a placeholder ?
                        return Promise.reject("Problems while generating resource: NO DATA");
                    }
                    // copy data into cached frames on disk 
                    return Promise.resolve(generator.getData());
                }).then(function (frame) {
                    console.log(beamcoder.filters());
                    return beamcoder.filterer({
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
                    }).then(function (filterer) {
                        return filterer.filter([frame])
                    });
                }).then(function (frames) {
                    const frame = frames[0].frames[0];                    
                    //const otherFrame = filterer.filter([frame]);
                    // it's very raw, likely rgba: we need to convert this into an attended format
                    const path = `./cache/${signature}`;
                    //fs.writeFileSync(path, JSON.stringify(frame));
                    const headSize = beamcoder.AV_INPUT_BUFFER_PADDING_SIZE;
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

                    generator.flushData();
                    rsc.generator = null;
                    rsc.inCache = true; // means that a file exists in cache/
                    rsc.inMem = false;
                });
                break;
            case 'file:':
                //rsc = { signature: signature, staticParams: staticParams, dynamicParams: dynamicParams, inCache: false, inMem: false, filePromise: null };
                //break;
            default:
                throw new Error('not supported resource');
        }
        console.assert(rsc !== null);
        this.resources[signature] = rsc;
        return signature;
    }
    process(currentTime) {
        for (var key in this.resources) {
            const rsc = this.resources[key];
            // TODO: flush frame, remove inMem
            const generator = rsc.generator;
            if (generator) { // sub generator may have been flushed at thi spoint
                generator.process(currentTime);
            }
        }
    }
    isAvailable(resId) {
        if (!this.resources.hasOwnProperty(resId)) {
            throw new Error('resource not found');
        }
        const rsc = this.resources[resId];
        return (rsc.inCache === true);
    }
    get(resId, currentTime) {
        if (!this.resources.hasOwnProperty(resId)) {
            throw new Error('resource not found');
        }
        const rsc = this.resources[resId];
        if (rsc.inMem) { // exists as a structure in memory
            rsc.lastAccess = currentTime;
            return rsc.frame; 
        }
        if (rsc.inCache) {
            const path = `./cache/${resId}`;

            const buf = Buffer.allocUnsafe(8*4);            
            const fd = fs.openSync(path, 'r');
            fs.readSync(fd, buf);
            const width = buf.readUint32LE(0);
            const height = buf.readUint32LE(4);
            const format = buf.subarray(8, 16).toString();
            const allDataSize = [ buf.readUint32LE(16), buf.readUint32LE(20), buf.readUint32LE(24), buf.readUint32LE(28)];
            if (!rsc.frame) { 
                rsc.frame = beamcoder.frame({
                    width: width,
                    height: height,
                    format: format
                }).alloc();
            }
            let offset = 32;
            allDataSize.forEach(function (dataSize, index) {
                let toRead = 0;
                if (index < rsc.frame.data.length) {
                    toRead = rsc.frame.data[index].length; 
                    if (dataSize < toRead) toRead = dataSize;
                }
                if (toRead>0) fs.readSync(fd, rsc.frame.data[index], 0, toRead, offset);
                offset += dataSize;
            });
            fs.closeSync(fd);
            // rsc.frame = beamcoder.frame(fs.readFileSync(path)).alloc();
            rsc.inMem = true;
            rsc.lastAccess = currentTime;
            return rsc.frame;
        }
        return null;   
    }
    flush(resId) {
        if (!this.resources.hasOwnProperty(resId)) {
            throw new Error('resource not found');
        }
        const rsc = this.resources[resId];
        if (rsc.inMem) {
            rsc.frame = null;
            rsc.inMem = false;
        }
    }
};

const rscManager = new RscManager();
/*
function getRscManager() {
    if (!rscManager) {
        rscManager = new RscManager(); 
    }
    return rscManager;
}
*/
/*
// will start an async request to a clip/frame
function RscRequest(currentTime, rscId, params) {
    params = params || rscPlanner.resources[rscId].params;
    rscPlanner.requests.push({ id: rscId, status: '', requestTime: currentTime, params: params });
}
// will make an async requests live
function RscTimeslice(currentTime, req) {
    // a state machine for distant resources
    // standard lifecyle is:
    //   a resource access request 
    //   some waiting time for the other side to process the request
    //   an internal processing time (local storing fe)
    //   some object creations, such as frame or decoders, before marking the resource ready to generate frame
    //   and once consumed, being flushed empty 
    switch (req.status) {
        case '':
        case 'born':
            req.status = 'requesting';
            break;
        case 'requesting':
            req.status = 'processing';
            req.token = '';
            req.requestTime = currentTime;
            break;
        case 'processing':
            req.status = 'ready';                
            break;
        case 'ready': // a frame exists, and or a decoder, and can be used to retrieve all data
            req.status = 'flushing';
            break;
        case 'flushing':
            req.status = 'sleeping';
            break;
        default:
            break; 
    }
}

function RscTimesliceAll(currentTime) {
    rscPlanner.requests.forEach(function (req) {
        RscTimeslice(currentTime, req)
    });
}

function RscGetFrame(reqId, currentTime) {
    // returns a frame from a clip
}
*/

function ProducerCreateScenario(duration, context) {
    // randomizer: every 2 seconds a new sequence 
    let nbClips = Math.floor(duration / 2000); 
    for (let numClip = 0; numClip <= nbClips; numClip++) {
        let clipDuration = 2000;
        if (numClip === nbClips) {
            clipDuration = duration - numClip * 2000;
        }
        let videoGenerator = rscManager.directory[ numClip % rscPlanner.directory.length ];
        videoGenerator.request({ numClip }, 2000);
    }
    return 
}

async function main() {
    await Muxer.init(context.dstRtmpUrl);
    
    await Audio.init(Muxer.get());
    await Video.init(Muxer.get());

    await Audio.start();
    await Video.start();
    await Muxer.start();

    // the Idea:  
    //   We have generators, audio and video. These are base concepts that will feed our streamer
    // in this project with have:
    //   an audio generator directly linked to a cast, that will produce audio samples in a timely manner
    //   a video generator: a producer, embedding various other generators. 
    //     producer will switch between inner generators to produce some quality video clip 
    //  We have a main loop: to govern and push data to the final stream (a rtmp address)
    const audioGenerator = await createAudioParadiseGenerator(context.srcAudioUrl);

    const videoGenerator = await createVideoProducerGenerator();
    await videoGenerator.start();

    const streamingStart = process.hrtime.bigint();
    let numLoop = 0;
    let previousFrame = -1;
    while (true) {
        const frameStart = process.hrtime.bigint();
        const currentTime = Math.round(Number((frameStart - streamingStart) / BigInt(1e6)));
        await audioGenerator.process(currentTime); // decode and store into Audio
        if (audioGenerator.hasData()) {
            const data = audioGenerator.getData(); // will get data and provoke internal cleanups
            audioGenerator.flushData();
            Audio.pushS16(data.samples, data.sample_rate, 1);
        }
        await Audio.processAndStream(currentTime); // will empty internal buffers, maybe there is nothing to do at this point

        currentFrame = Math.floor(currentTime * 25 / 1000);
        if (currentFrame !== previousFrame) {
            await videoGenerator.process(currentTime);
            if (videoGenerator.hasData()) {
                const data = videoGenerator.getData(); // will get data and clean everything internally
                Video.pushFrame(data); // this will internally encode data and switch to new master packets asynchronuously                
            }
            await Video.processAndStream(currentFrame); // will push to stream all the data
            previousFrame = currentFrame;
        }

        const frameDuration = process.hrtime.bigint() - frameStart;
        numLoop++;
        console.log('loop:', numLoop, 'time:', Number(frameDuration/BigInt(1e6)), 'ms');
    }
    return;
    for (let i=0; i<1000000; i++) {
        await sleep(10);

        Video.generate(i, 1/25);
        let audioStart = process.hrtime.bigint();
        Audio.generate(i, 1/25);
        const audioTime = process.hrtime.bigint() - audioStart;

        let videoStart = process.hrtime.bigint();
        await Video.process();
        const videoTime = process.hrtime.bigint() - videoStart;
        console.log(`video time for 40ms is ${Number(videoTime/BigInt(1e3))/1000}ms`);
        audioStart = process.hrtime.bigint();
        await Audio.process(1/25);
        const audioTime2 = process.hrtime.bigint() - audioStart;
        console.log(`audio time for 40ms is ${Number(audioTime/BigInt(1e3))/1000}ms and ${Number(audioTime2/BigInt(1e3))/1000}ms = ${Number((audioTime+audioTime2)/BigInt(1e3))/1000} `);

        console.log(`WHOLE generation time for 40ms is ${Number((audioTime+audioTime2+videoTime)/BigInt(1e3))/1000}ms`);

    }

    Video.finish();
    Audio.finish();
    await Muxer.finish();

    Video.shutdown();
    Audio.shutdown();
    Muxer.shutdown();
}

main();