FROM node:24-slim
# Each bootstrap directory is copied just before the steps that use it, so
# workspace edits (package.json etc.) do not invalidate the system layers.
COPY bootstrap/system/ /tmp/bootstrap/system/
ENV NIX_SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    AWS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    CLOUDSDK_CORE_CUSTOM_CA_CERTS_FILE=/etc/ssl/certs/ca-certificates.crt \
    CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    GRPC_DEFAULT_SSL_ROOTS_FILE_PATH=/etc/ssl/certs/ca-certificates.crt \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt \
    PIP_CERT=/etc/ssl/certs/ca-certificates.crt \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    GIT_SSL_CAINFO=/etc/ssl/certs/ca-certificates.crt
RUN sh /tmp/bootstrap/system/init.sh prerequisites
RUN sh /tmp/bootstrap/system/init.sh certificates
RUN sh /tmp/bootstrap/system/init.sh aube
COPY bootstrap/profile/ /tmp/bootstrap/profile/
RUN sh /tmp/bootstrap/system/init.sh profiles
COPY bootstrap/workspace/ /tmp/bootstrap/workspace/
RUN sh /tmp/bootstrap/system/init.sh workspace
RUN sh /tmp/bootstrap/system/init.sh dependencies
WORKDIR /workspace
ENTRYPOINT ["aube", "run", "-s", "entrypoint"]
