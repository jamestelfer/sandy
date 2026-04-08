#!/bin/sh
#
# Export CA bundle environment variables for common tools.
# Sourced via /etc/profile.d/ so all login shells pick up
# the Netskope MitM root added by update-ca-certificates.

CERT_BUNDLE=/etc/ssl/certs/ca-certificates.crt
export NIX_SSL_CERT_FILE="${CERT_BUNDLE}"
export AWS_CA_BUNDLE="${CERT_BUNDLE}"
export CLOUDSDK_CORE_CUSTOM_CA_CERTS_FILE="${CERT_BUNDLE}"
export CURL_CA_BUNDLE="${CERT_BUNDLE}"
export GRPC_DEFAULT_SSL_ROOTS_FILE_PATH="${CERT_BUNDLE}"
export NODE_EXTRA_CA_CERTS="${CERT_BUNDLE}"
export PIP_CERT="${CERT_BUNDLE}"
export REQUESTS_CA_BUNDLE="${CERT_BUNDLE}"
export SSL_CERT_FILE="${CERT_BUNDLE}"
export GIT_SSL_CAINFO="${CERT_BUNDLE}"
