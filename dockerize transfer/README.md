# Init
Set `DB_HOST` in `.env` to `host.docker.internal`

load alpine archive into docker (to prevent pulling from internet):
```
docker load -i node-22-alpine.tar
```

# Creating Docker Image
```
docker build --no-cache -t tms-micro-eval .
```
```
docker run --env-file .env -p 3000:3000 --name tms -d tms-micro-eval
```

# Check
```
curl http://localhost:3000/api/check
```

# Everything
```
docker rm -f tms && \
docker rmi tms-micro-eval && \
docker build --no-cache -t tms-micro-eval . && \
docker run --env-file .env -p 3000:3000 --name tms -d tms-micro-eval && \
sleep 1 && \
curl http://localhost:3000/api/check
```
