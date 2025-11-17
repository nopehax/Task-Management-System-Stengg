# Secure transfer
Dockerize the backend for transfer without using the internet.

# Init (Green Zone)
Copy `package.json` into a separate folder
```
npm install
npm pack
```

In `.env`, set `DB_HOST=host.docker.internal`

Get alpine in green zone:
```
docker pull node:22-alpine
docker save node:22-alpine -o node-22-alpine.tar
```

# Red Zone (no internet)
load alpine archive into docker (to prevent pulling from internet):
```
docker load -i node-22-alpine.tar
```

## Creating Docker Image
```
docker build --no-cache -t tms-micro-eval .
```
```
docker run --env-file .env -p 3000:3000 --name tms -d tms-micro-eval
```

## Check
```
curl http://localhost:3000/api/check
```

## Everything
```
docker rm -f tms && \
docker rmi tms-micro-eval && \
docker build --no-cache -t tms-micro-eval . && \
docker run --env-file .env -p 3000:3000 --name tms -d tms-micro-eval && \
sleep 1 && \
curl http://localhost:3000/api/check
```

# References

```
## deploy-across-airgap-playbook.sh
# This playbook is to simulate 3 separate environments across airgaps
# on your local computer

# File Structure for playbook
# project root
# ├─* /internet-enabled -> Internet Enabled Env
# ├─* /devenv -> dev env (no internet)
# | ├─ /dvd
# | ├─ /home
# | └─ /project
# ├─* /uat -> staging/uat/production env (no internet)
# | ├─ /dvd
# | ├─ /home
# | └─ /project
# ├─* /docker -> docker staging area to simulate dockerfile
# └─* ... other src codes

cd internet-enabled

# copy package.json from dev proj to internet-enabled env
# ensure no main, and bundleDependencies = true before copy
cp ../devenv/project/package.json ./
npm install
npm pack

# Ensure you do this below steps after npm pack or else it will include it in the npm package
# or use npmignore to exclude the file explicitly
docker pull node:20-alpine
docker save -o node-20-alpine.tar node:20-alpine

# generate checksum to manifest.txt
sha256sum tms-micro-1.0.0.tgz node-20-alpine.tar > manifest.txt 

# compress and password protect each file
tar -czf - tms-micro-1.0.0.tgz node-20-alpine.tar | gpg --symmetric --cipher AES256 -o transfer-bundle.tar.gz.gpg
tar -czf - manifest.txt | gpg --symmetric --cipher AES256 -o transfer-bundle-manifest.tar.gz.gpg
 
# transfer-bundle.tar.gz.gpg is now ready 
# transfer-bundle-manifest.tar.gz.gpg is now ready 
# Burn into Write-Once Read-only DVDs
# Tamperproof envelopes

# simulate controlled transfer and dvd mounting
cp transfer-bundle.tar.gz.gpg ../devenv/dvd/
cp transfer-bundle-manifest.tar.gz.gpg ../devenv/dvd/

cd ../devenv/home

# unzip files with password
gpg -d ../dvd/transfer-bundle.tar.gz.gpg | tar xzvf -
gpg -d ../dvd/transfer-bundle-manifest.tar.gz.gpg | tar xzvf -

# verify authenticity and integrity of files
sha256sum -c manifest.txt

# load base image
docker load -i node-20-alpine.tar

# copy .tgz file into project folder (Dockerfile can only COPY files from folder)
cp ./tms-micro-1.0.0.tgz ../project

# Build image
cd ../project
docker build -t tms-micro-eval .
# To simulate docker, do below section instead of docker build

## DOCKER SIMULATION
# Simulate dockerfile build --> docker build -t tms-micro-eval .
# uncomment below lines 
# cd ../docker
# mkdir app && cd app
# cp ../../devenv/project/tms-micro-1.0.0.tgz ./
# cp ../../devenv/project/package*.json ./
# npm install tms-micro-1.0.0.tgz --prefix ./temp
# cmp package.json ./temp/node_modules/tms-micro/package.json
# mv ./temp/node_modules/tms-micro/node_modules ./
# cp -r ../../devenv/project/. ./
# rm -r ./temp/ ./tms-micro-1.0.0.tgz

# Recommend to try again with docker build to simulate user management


# Test image
docker run -d --env-file .env -e NODE_ENV=development -e DB_ADDRESS=host.docker.internal -p 9081:8081 --name tms-micro-eval --network tms-network tms-micro-eval

# Save app image
docker save -o tms-micro-eval.tar tms-micro-eval

# generate checksum to manifest.txt
sha256sum tms-micro-eval.tar > manifest.txt 

# compress and password protect each file
tar -czf - tms-micro-eval.tar | gpg --symmetric --cipher AES256 -o transfer-bundle.tar.gz.gpg
tar -czf - manifest.txt | gpg --symmetric --cipher AES256 -o transfer-bundle-manifest.tar.gz.gpg

# transfer-bundle.tar.gz.gpg is now ready 
# transfer-bundle-manifest.tar.gz.gpg is now ready 
# Burn into Write-Once Read-only DVDs
# Tamperproof envelopes

# simulate controlled transfer and dvd mounting
cp transfer-bundle.tar.gz.gpg ../uat/dvd/
cp transfer-bundle-manifest.tar.gz.gpg ../uat/dvd/

cd ../uat/home

# unzip files with password
gpg -d ../dvd/transfer-bundle.tar.gz.gpg | tar xzvf -
gpg -d ../dvd/transfer-bundle-manifest.tar.gz.gpg | tar xzvf -

# verify authenticity and integrity of files
sha256sum -c manifest.txt

# load base image
docker load -i tms-micro-eval.tar

# run
docker run -d --env-file .env.uat -e NODE_ENV=staging -e DB_ADDRESS=host.docker.internal -p 9081:8081 --name tms-micro-eval --network tms-network tms-micro-eval
```