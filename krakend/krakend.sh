docker run -d --name krackend \
    -p 8000:8000 \
    -p 8090:8090 \
    devopsfaith/krakend:2.0.4

docker run -p 8080:8080 -v $PWD:/etc/krakend/ devopsfaith/krakend run --config /etc/krakend/krakend.json