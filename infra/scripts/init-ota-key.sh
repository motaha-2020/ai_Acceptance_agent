#!/usr/bin/env bash
# Server-side, idempotent: OTA code-signing key pair for the self-hosted expo-updates server.
#   /opt/acceptance/secrets/ota/private-key.pem   RSA 2048, chmod 600 (mounted read-only into the api container)
#   /opt/acceptance/secrets/ota/certificate.pem   self-signed code-signing certificate (public; embedded in the app
#                                                 as apps/mobile/certs/ota-certificate.pem)
# Never regenerated once present: a new key means installed apps reject every OTA update until they
# install an APK built with the new certificate. Back up the whole /opt/acceptance/secrets directory.
. "$(dirname "$0")/lib.sh"

SECRETS="$ACC_ROOT/secrets"
OTA="$SECRETS/ota"
umask 077
install -d -m 700 "$SECRETS" "$OTA"

if [ ! -s "$OTA/private-key.pem" ]; then
  openssl genrsa -out "$OTA/private-key.pem" 2048 2>/dev/null
  openssl req -new -x509 -key "$OTA/private-key.pem" -out "$OTA/certificate.pem" -days 3650 -sha256 \
    -subj "/CN=Acceptance Field OTA code signing" \
    -addext "basicConstraints=critical,CA:FALSE" \
    -addext "keyUsage=critical,digitalSignature" \
    -addext "extendedKeyUsage=critical,codeSigning"
  log "generated OTA signing key + certificate in $OTA"
fi
chmod 600 "$OTA/private-key.pem"
chmod 644 "$OTA/certificate.pem"
# The api container runs as uid 1000 (node) = deploy; the key stays readable only by that uid.
log "OTA signing key ok (certificate sha256: $(openssl x509 -in "$OTA/certificate.pem" -noout -fingerprint -sha256 | cut -d= -f2))"
