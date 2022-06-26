const beamcoder = require('./beamcoder.node')

async function test () {

  beamcoder.logging('fatal')
  console.log('Creating demuxer for test.mp4')

  let demuxer = await beamcoder.demuxer('file:./file_example_MP4_1920_18MG.mp4')
}

test()
