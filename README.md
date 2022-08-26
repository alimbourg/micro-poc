# Microservices Tryout

## consul
brew install consul
consul agent --dev
http://127.0.0.1:8500

## GO
brew install go
mkdir myproject
cd myproject
go mod init myproject
go get -v github.com/hashicorp/consul/api
go get -v github.com/hashicorp/consul/sdk@v0.9.0
go get -v github.com/hashicorp/consul/connect
go mod tidy
go test

## Next JS
https://nextjs.org/docs/getting-started
curl https://codeload.github.com/mui/material-ui/tar.gz/master | tar -xz --strip=2  material-ui-master/examples/nextjs
cd nextjs
npm install
npm run dev
chaque page porte son nom

## POC 1
Lots of different servcies and modules, with both consul (?) auto registering and consul static description

Consul is doing
service configuration
keyvalues
service registration

Without consul, services should be attempting to auto register until success

An application with micro services.

I need a Youtube Live content generator: it mixes audio with subtitles (likely) and video
- Idea 1: start from an audio playlist or a raio such as RadioParadise, and generate according picture/video, with a slight delay
- Idea 2: Buffer and send content to Youtube Live channel using rtmp (?)
- Idea 3: A producer chose and mix channels to produce content: many video layer for mixing, one dynamic layer, one audio layer
All these content generator are services, based on a time, and a produces address them to mix into a content that will be encoded for youtube live. We need a producer per youtube channel.
Producer may boradcast meta information about the content being streamed

So we have a video encoder from streampunk, that should be embedded in 'the producer', and send it on rtmp
## STAGE 1:

Producer: should embed video encoder from streampunk, and service the content to rtmp

StaticImage: shoud generate a static image given some basic description such as width, height, time, and returns the actual generated bitmap (with possibly some metadata)

(A video/image generator should use the network to propagate data, without using any disk cache if possible (it wont be, possible))

VideoLan should be able to show the rtmp flux. It's a two services thing no need from Consul right now (next step)









