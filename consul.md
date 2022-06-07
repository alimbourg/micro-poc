
/opt/homebrew/opt/haproxy/bin/haproxy -f /opt/homebrew/etc/haproxy.cfg
/opt/homebrew/opt/consul/bin/consul
brew install haproxy consul
brew services restart haproxy
brew services restart consul

haproxy en frontal, consul en mode serveur avec haproxy
haproxy utilise consul server pour recuperer les services 
consul agent simple sur chaque machine qui fait tourner une application

With docker
https://www.haproxy.com/blog/how-to-run-haproxy-with-docker/

https://learn.hashicorp.com/tutorials/consul/load-balancing-haproxy


# start consul en mode dev (server avec parametres par defaut)

/opt/homebrew/opt/consul/bin/consul agent -dev
http://localhost:8500/ should be working


/opt/homebrew/opt/consul/bin/consul agent --server --data-dir $PWD/consul/data -ui -uid-dir $PWD/consul/ui --config-dir $PWD/conul/config -dev

consul est un satellite, et tout passe par lui: configuration, messagerie asynchrone, proxy vers les autres services

on lance ca avec son service et on s'y integre (API Connect: on decrit son propre service)
en Go: https://www.consul.io/docs/connect/native/go


