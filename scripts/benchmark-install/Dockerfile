# Pin the multi-platform image so both machines use the same Node release.
FROM node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
RUN npm install -g --ignore-scripts=false pnpm@12.9.1 @endevco/aube@2.6.1 \
    && pnpm --version && aube --version
WORKDIR /benchmark
COPY embedded/bootstrap/package.json ./fixture/package.json
COPY scripts/benchmark-install/ ./
ENTRYPOINT ["node", "benchmark.mjs"]
