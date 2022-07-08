# STAGE 1:

https://project-awesome.org/ebu/awesome-broadcasting

Producer: should embed video encoder from streampunk, and service the content to rtmp

StaticImage: shoud generate a static image given some basic description such as width, height, time, and returns the actual generated bitmap (with possibly some metadata)

VideoLan should be able to show the rtmp flux. It's a two services thing no need from Consul right now (next step)


## https://github.com/Streampunk/beamcoder
from https://github.com/Streampunk/beamcoder/issues/83

npm install node-gyp
brew install ffmpeg (libav) => /opt/homebrew/lib + /opt/homebrew/include contain everything ffmpeg
git clone https://github.com/Streampunk/beamcoder.git beamcoder
dans beamcoder / binding.gyp
"conditions":
      ['OS=="mac"', {
        "include_dirs" : [
          "/opt/homebrew/include"
        ],
        "library_dirs": [
          "/opt/homebrew/lib",
        ]
      }],

puis
export CXXFLAGS="-mmacosx-version-min=12.0"
export LDFLAGS="-mmacosx-version-min=12.0"
../node_modules/.bin/node-gyp rebuild

### check dependencies
otool -L build/Release/beamcoder.node

cp beamcoder/build/Release/beamcoder.node beamcoder.node

SI ld: warning: object file (/Users/awen-limbourg/dev/micro-poc/stage1/srv-producer-js/ffmpeg/lib/libavfilter.a(dnn_backend_native_layer_pad.o)) was built for newer macOS version (12.0) than being linked (11.0)
Les outils pour compiler sont datés
sudo rm -rf /Library/Developer/CommandLineTools
sudo xcode-select --install

this should work
```
const beamcoder = require('./beamcoder.node')

async function test () {

  beamcoder.logging('fatal')
  console.log('Creating demuxer for test.mp4')

  let demuxer = await beamcoder.demuxer('file:./file_example_MP4_1920_18MG.mp4')
}

test()
```

https://github.com/thonatos/notes/blob/master/backend-notes/install-and-conf-nginx-with-rtmp-on-osx.md

git clone https://github.com/arut/nginx-rtmp-module.git
git clone https://github.com/nginx/nginx.git
cd nginx
./auto/configure --add-module=../nginx-rtmp-module --with-pcre=../pcre-8.41/ 
./configure --with-http_ssl_module --add-module=../nginx-rtmp-module-master
make
make install

https://gist.github.com/beatfactor/a093e872824f770a2a0174345cacf171
# pcre from sources (brew install pcre => 8.45)
# curl -OL https://ftp.pcre.org/pub/pcre/pcre-8.41.tar.gz
# tar xvzf pcre-8.41.tar.gz && rm pcre-8.41.tar.gz
# with ssl
curl -OL https://www.openssl.org/source/openssl-1.1.0.tar.gz
tar xvzf openssl-1.1.0.tar.gz && rm openssl-1.1.0.tar.gz 
configure --with-http_ssl_module --with-openssl=/usr/local/src/openssl-1.1.0

git clone git://git.openssl.org/openssl.git openssl
This works after that
./auto/configure --add-module=../nginx-rtmp-module --with-http_ssl_module --with-openssl=/USers/awen-limbourg/dev/micro-poc/stage1/srv-producer-js/nginx/openssl

// conf/nginx.conf
rtmp {
        server {
                listen 1935;
                chunk_size 4096;
                allow publish 127.0.0.1;
                deny publish all;

                application live {
                        live on;
                        record off;
                }
        }
}


Play muxed stream 
ffmpeg -re -I file_example_MP4_1920_18MG.mp4 -vcodec copy -loop -1 -c:a aac -b:a 160k -ar 44100 -strict -2 -f flv rtmp:127.0.0.1/live/bbb

== FFMPEG ==
compile ffmpeg (--enable-shared ?)
./configure --cc=clang --host-c-flags= --host-ldflags= --enable-nonfree --enable-gpl --enable-shared --enable-pthreads --enable-libfreetype --enable-libfdk-aac --enable-libopus --enable-libvpx --enable-libx264 --enable-filters --enable-runtime-cpudetect --prefix=/Users/awen-limbourg/dev/micro-poc/stage1/srv-producer-js/ffmpeg

// full static ffmpeg

./configure  --cc=clang --host-c-flags= --host-ldflags= --pkg-config-flags="--static" --enable-nonfree --enable-gpl --enable-static --disable-shared --enable-pthreads --enable-libfreetype --enable-libfdk-aac --enable-libopus --enable-libvpx --enable-libx264 --enable-filters --enable-runtime-cpudetect --prefix=./
make -j4
make install


