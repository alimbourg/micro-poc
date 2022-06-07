# Microservicing Attempt

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

