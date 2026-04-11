FROM node:24-slim
COPY bootstrap/ /tmp/bootstrap/
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
RUN chmod +x /tmp/bootstrap/init.sh /tmp/bootstrap/entrypoint
RUN sh /tmp/bootstrap/init.sh prerequisites
RUN sh /tmp/bootstrap/init.sh certificates
RUN sh /tmp/bootstrap/init.sh pnpm
RUN sh /tmp/bootstrap/init.sh workspace
RUN sh /tmp/bootstrap/init.sh profiles
RUN sh /tmp/bootstrap/init.sh dependencies
WORKDIR /workspace
ENTRYPOINT ["pnpm", "run", "-s", "entrypoint"]
