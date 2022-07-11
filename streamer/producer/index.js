const beamcoder = require('./beamcoder.node')
const Koa = require('koa');
const app = new Koa();

console.log('try: http://localhost:3000/file_example_MP4_480_1_5MG.mp4/12.5');

app.use(async (ctx) => { // Assume HTTP GET with path /<file_name>/<time_in_s>
  let parts = ctx.path.split('/'); // Split the path into filename and time
  if ((parts.length < 3) || (isNaN(+parts[2]))) return; // Ignore favicon etc..
  let dm = await beamcoder.demuxer('file:' + parts[1]); // Probe the file
  await dm.seek({ time: +parts[2] }); // Seek to the closest keyframe to time
  let packet = await dm.read(); // Find the next video packet (assumes stream 0)
  for ( ; packet.stream_index !== 0 ; packet = await dm.read() );
  let dec = beamcoder.decoder({ demuxer: dm, stream_index: 0 }); // Create a decoder
  let decResult = await dec.decode(packet); // Decode the frame
  if (decResult.frames.length === 0) // Frame may be buffered, so flush it out
    decResult = await dec.flush();
  // Filtering could be used to transform the picture here, e.g. scaling
  let enc = beamcoder.encoder({ // Create an encoder for JPEG data
    name : 'mjpeg', // FFmpeg does not have an encoder called 'jpeg'
    width : dec.width,
    height: dec.height,
    pix_fmt: dec.pix_fmt.indexOf('422') >= 0 ? 'yuvj422p' : 'yuvj420p',
    time_base: [1, 1] });
  let jpegResult = await enc.encode(decResult.frames[0]); // Encode the frame
  await enc.flush(); // Tidy the encoder
  ctx.type = 'image/jpeg'; // Set the Content-Type of the data
  ctx.body = jpegResult.packets[0].data; // Return the JPEG image data
});

app.listen(3000); // Start the server on port 3000