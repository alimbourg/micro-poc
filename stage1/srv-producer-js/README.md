# STAGE 1:

https://project-awesome.org/ebu/awesome-broadcasting

Producer: should embed video encoder from streampunk, and service the content to rtmp

StaticImage: shoud generate a static image given some basic description such as width, height, time, and returns the actual generated bitmap (with possibly some metadata)

VideoLan should be able to show the rtmp flux. It's a two services thing no need from Consul right now (next step)


cp beamcoder/build/Release/beamcoder.node beamcoder.node
cp beamcoder/build/Debug/beamcoder.node beamcoder.node

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

## FFMPEG ##

with brew
brew tap homebrew-ffmpeg/ffmpeg
brew options homebrew-ffmpeg/ffmpeg/ffmpeg
brew install homebrew-ffmpeg/ffmpeg/ffmpeg --with-fdk-aac

> ./configure --prefix=/opt/homebrew/Cellar/ffmpeg/5.0.1-with-options_4 --enable-shared --cc=clang --host-cflags= --host-ldflags= --enable-gpl --enable-libaom --enable-libdav1d --enable-libmp3lame -
Fomula is there: 
nano /opt/homebrew/Library/Taps/homebrew-ffmpeg/homebrew-ffmpeg/Formula/ffmpeg.rb

=== By hand: ===
brew install automake fdk-aac git lame libass libtool libvorbis libvpx \
opus sdl shtool texi2html theora wget x264 x265 xvid nasm

https://huanle19891345.github.io/en/%E6%96%B9%E5%90%91%E5%92%8C%E8%B6%8B%E5%8A%BF/%E9%9F%B3%E8%A7%86%E9%A2%91/ffmpeg/ffmpegdebug/

compile ffmpeg (--enable-shared ?)
make clean
./configure --cc=clang --host-cflags=-Og --host-ldflags=-g --enable-shared --enable-debug=3 --disable-optimizations --enable-nonfree --enable-gpl --enable-libfdk-aac --enable-libx264  --enable-libx265 --prefix=/Users/awen-limbourg/dev/micro-poc/stage1/srv-producer-js/ffmpeg
./configure --cc=clang --host-cflags=-Og --host-ldflags=-g --enable-debug=3 --disable-optimizations --enable-static --disable-shared --pkg-config-flags="--static" --enable-nonfree --enable-gpl --enable-libfdk-aac --prefix=/Users/awen-limbourg/dev/micro-poc/stage1/srv-producer-js/ffmpeg
 
make -j8
// full static ffmpeg

./configure  --host-cflags="-target arm64-apple-macos13" --host-ldflags= --cc=clang --enable-debug --pkg-config-flags="--static" --enable-nonfree --enable-gpl --enable-static --disable-shared --enable-pthreads --enable-libfreetype --enable-libfdk-aac --enable-libopus --enable-libvpx --enable-libx264  --enable-libx265 --enable-filters --enable-runtime-cpudetect --prefix=./

make -j4
make install (will strip debug infos from dylib)

### make install is stripping syms and debug infos ###
if you want them with debug, copy everything manually
https://blog.karthisoftek.com/a?ID=01000-c6eed356-c9f6-4a66-a042-06e695ecaf30
cp libavformat/libavformat.59.dylib lib/libavformat.59.16.100.dylib => NOT 'IN PLACE' ON MAB, but via another temp file
ls -lah lib/libavformat.59.16.100.dylib; cp libavformat/libavformat.59.dylib lib/libavformat.dll; mv lib/libavformat.dll lib/libavformat.59.16.100.dylib; ls -lah lib/libavformat.59.16.100.dylib
ls -lah lib/libavcodec.59.18.100.dylib; cp libavcodec/libavcodec.59.dylib lib/libavcodec.dll; mv lib/libavcodec.dll lib/libavcodec.59.18.100.dylib; ls -lah lib/libavcodec.59.18.100.dylib;
ls -lah lib/libavdevice.59.4.100.dylib; cp libavdevice/libavdevice.59.dylib lib/libavdevice.dll; mv lib/libavdevice.dll lib/libavdevice.59.4.100.dylib; ls -lah lib/libavdevice.59.4.100.dylib
ls -lah lib/libavutil.57.17.100.dylib; cp libavutil/libavutil.57.dylib lib/libavutil.dll; cp lib/libavutil.dll lib/libavutil.57.17.100.dylib; ls -lah lib/libavutil.57.17.100.dylib


### How to know if they are debug infos in lib ###
dsymutil -s ../beamcoder.node | grep N_OSO 
should be non empty


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
For a DEBUG verions
../node_modules/.bin/node-gyp --debug configure rebuild

cp build/Release/beamcoder.node .

### check dependencies
otool -L build/Release/beamcoder.node



### To DEBUG NODE dynamic library ###
https://morioh.com/p/636412a38e72
npm install llnode
llnode
`brew install llnode` does not link the plugin to LLDB PlugIns dir.

To load this plugin in LLDB, one will need to either

* Type `plugin load /opt/homebrew/opt/llnode/llnode.dylib` on each run of lldb
* Install plugin into PlugIns dir manually (macOS only):

    mkdir -p ~/Library/Application\ Support/LLDB/PlugIns
    ln -sf /opt/homebrew/opt/llnode/llnode.dylib \
        ~/Library/Application\ Support/LLDB/PlugIns/

https://www.nesono.com/sites/default/files/lldb%20cheat%20sheet.pdf
      
lldb 
plugin load...
file node
breakpoint set -n readFrame
run video.js
ou
>process attach --name a.out [--waitfor]