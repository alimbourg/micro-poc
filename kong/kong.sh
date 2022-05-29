docker run -d --name kong \
    -e "KONG_DATABASE=off" \
    -e "KONG_PROXY_ACCESS_LOG=/dev/stdout" \
    -e "KONG_ADMIN_ACCESS_LOG=/dev/stdout" \
    -e "KONG_PROXY_ERROR_LOG=/dev/stderr" \
    -e "KONG_ADMIN_ERROR_LOG=/dev/stderr" \
    -e "KONG_ADMIN_LISTEN=0.0.0.0:8001, 0.0.0.0:8444 ssl" \
    -p 8000:8000 \
    -p 8443:8443 \
    -p 8001:8001 \
    -p 8444:8444 \
    kong
# https://hub.docker.com/_/kong
# init, get, (edit,) post
# docker exec -it kong kong config init /home/kong/kong.yml
# docker exec -it kong cat /home/kong/kong.yml >> kong.yml
# curl -X POST 127.0.0.1:8001/config -F config=@kong.yml -v
# or http :8001/config config=@kong.yml
