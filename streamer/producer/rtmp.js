const beamcoder = require('./beamcoder.node')
const Muxer = require('./muxer')
const Audio = require('./audio')
const Video = require('./video')
// ffmpeg -re -i ./file_example_MP4_1920_18MG.mp4 -vcodec copy -loop -1 -c:a aac -b:a 160k -ar 44100 -strict -2 -f flv rtmp:127.0.0.1/live/teststream

function sleep(ms) {
     return new Promise(resolve => setTimeout(resolve, ms));
 }

function dummy() {}
module.exports.init = (typeof init === 'function' ? init : dummy)
module.exports.start = (typeof start === 'function' ? start : dummy)
module.exports.process = (typeof process === 'function' ? doProcess : dummy)
module.exports.finish = (typeof finish === 'function' ? finish : dummy)
module.exports.shutdown = (typeof shutdown === 'function' ? shutdown : dummy)

async function test() {
     await Muxer.init('rtmp://127.0.0.1:1935/live/teststream');
     // await Muxer.init('file:./test.flv');
     await Audio.init(Muxer.get());
     await Video.init(Muxer.get());

     //await Audio.start();
     //await Video.start();
     await Muxer.start();

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

// Decode RTMP
async function doProcess() {
     const mux = await beamcoder.muxer({ format_name: 'flv', 
         vsync: 0, tune: 'zerolatency', flags: 'low_delay', fflags: 'flush_packets'
     });
     const videoWidth = 640;
     const videoHeight = 360;

     const vencParams = {
          name: 'libx264',          
          width: videoWidth,
          height: videoHeight,
          bit_rate: 1984000, //960000, //2000000,
          max_rate: 1984000, //?
          time_base: [1, 25],
          framerate: [25, 1],
          gop_size: 1, //one intra frame every gop_size frame //fps * 2 //10,
          max_b_frames: 1,
          pix_fmt: 'yuv420p',
          priv_data: { preset: 'veryfast' }
     }; 
     const vencoder = await beamcoder.encoder(vencParams); 

     let vstr = mux.newStream({
          name: 'h264',
          time_base: [1, 90000], // 90 KHz
          interleaved: true }); // Set to false for manual interleaving, true for automatic
     Object.assign(vstr.codecpar, {
          width: videoWidth,
          height: videoHeight,
          format: 'yuv420p'
     });
     const doAudio = true;
     // Audio ?
     // https://forum.videohelp.com/threads/373264-FFMpeg-List-of-working-sample-formats-per-format-and-encoder
     let astr = null;
     let aencParams = null;
     let aencoder = null;
     const audioSamplerate = 16000;
     const audioFormat = 'fltp';
     const audioChannels = 1;
     const audioBitsPerSample = 4 * audioChannels;
     const audioBitrate = audioSamplerate * audioBitsPerSample;
     if (doAudio) {
          // http://underpop.online.fr/f/ffmpeg/help/aac.htm.gz
          // https://github.com/Streampunk/beamcoder#creating-frames
          const encoders = beamcoder.encoders();
          aencParams = {
               name: 'aac', // aac
               bit_rate: audioBitrate, //960000, //2000000,
               max_rate: audioBitrate, //?
               sample_rate: audioSamplerate, // mp3-128Khz = 128000 samples per second 
               channels: 1,
               channel_layout: 'mono',
               // profile: 'aac_low',
               time_base: [1, 25],
               sample_fmt: audioFormat,
          }; 
          aencoder = await beamcoder.encoder(aencParams);

          astr = mux.newStream({
               name: 'aac',
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
               bit_rate: audioBitrate, //4 = 1 channel of float
          });
     }

     await mux.openIO({
          //url: 'file:./testFLV.flv'
          url: 'rtmp://127.0.0.1/live/teststream'
     });
     // after this, streams may get different base time
     await mux.writeHeader();

     let vframe = beamcoder.frame({
          width: vencParams.width,
          height: vencParams.height,
          format: vencParams.pix_fmt
     }).alloc();

     let aframe = null;
     if (doAudio) {
          const sampleFmts = beamcoder.sample_fmts();
          aframe = beamcoder.frame({ // should be related to encoder
               channels: 1,
               channel_layout: 'mono', // stereo
               sample_rate: audioSamplerate,
               format: audioFormat,
               //frame_size: 10000, // does nothing
               nb_samples: aencoder.frame_size, // this is it !
          }).alloc();         
     }
     
     for ( let i = 0 ; i < 10000 ; i++ ) {
          // await sleep(400/25);
          let linesize = vframe.linesize;
          let [ ydata, bdata, cdata ] = vframe.data;
          // presentation time stamp (a frame)
          vframe.pts = i;// + 100;
     
          for ( let y = 0 ; y < vframe.height ; y++ ) {
               for ( let x = 0 ; x < linesize[0] ; x++ ) {
                    ydata[y * linesize[0] + x] =  x + y + i * 3;
               }
          }
     
          for ( let y = 0 ; y < vframe.height / 2 ; y++) {
               for ( let x = 0; x < linesize[1] ; x++) {
                    bdata[y * linesize[1] + x] = 128 + y + i * 2;
                    cdata[y * linesize[1] + x] = 64 + x + i * 5;
               }
          }
     
          let vpackets = await vencoder.encode(vframe);
          //let p2 = await encoder.flush();

          if ( i % 25 === 0) console.log('Encoding frame', i);
          // send it to rtmp
          for (const pkt of vpackets.packets) {
               // 1 frame = 1/25s * 1000
               pkt.stream_index = vstr.index;
               pkt.duration = ts_convert(vencoder.time_base, 1, vstr.time_base); // frame ?
               // because frames are not necessarily stored in the presentation order,
               // we need to know when to decode them, when to present them
               // only(?) streams with B-Frames have different PTS,DTS

               // presentation time stamp * frame size
               // pkt.pts = pkt.pts * 90000/25; // in the correct time referential, standartd 90KHz / 25 = 3600 data per frame
               pkt.pts = ts_convert(vencoder.time_base, pkt.pts, vstr.time_base); // * 100;
               // decoding time stamp * frame size
               pkt.dts = ts_convert(vencoder.time_base, pkt.dts, vstr.time_base); // * 100;
               // pkt.dts = pkt.dts * 90000/25;
               await mux.writeFrame(pkt);
          }
          if (doAudio) {
               let apackets = null;
               aframe.total_time = 1000;
               for (j=0; j<1; j++) {
                    aframe.pts = i; // * 200000 + j;
                    const linesize = aframe.linesize;
                    const buffer = aframe.data[0];
                    for ( let x = 0 ; x < linesize[0] ; x++ ) {
                         buffer[x] = Math.random();
                    }
                    apackets = await aencoder.encode(aframe);
                    //if (apackets.packets.length>0) break;
               }
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

     } 
     await mux.writeTrailer();
}




// Encode to RTMP
test();
console.log('finished.')