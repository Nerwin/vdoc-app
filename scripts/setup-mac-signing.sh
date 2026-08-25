#!/usr/bin/env bash
# One-time setup: create the self-signed macOS signing certificate, store it as
# the GitHub Actions secrets the release workflow expects, and save the public
# cert into build/ so CI can trust it (a self-signed cert is only a valid
# codesigning identity on a machine that explicitly trusts it).
# Run it yourself (it handles key material): bash scripts/setup-mac-signing.sh
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="Nerwin/vdoc-app"
NAME="Developer ID Application: V-DOC Internal"
OUT="$HOME/vdoc-mac-signing.p12"
CERT="build/mac-signing-cert.cer"
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT
PASSWORD="$(openssl rand -base64 24)"

openssl req -x509 -newkey rsa:2048 -days 3650 -nodes \
  -keyout "$DIR/key.pem" -out "$DIR/cert.pem" \
  -subj "/CN=$NAME/O=V-DOC" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" \
  -addext "basicConstraints=critical,CA:false"
# 3DES/SHA1 PBE: OpenSSL 3 defaults to AES/SHA256, which `security import` rejects.
openssl pkcs12 -export -out "$OUT" -inkey "$DIR/key.pem" -in "$DIR/cert.pem" \
  -password "pass:$PASSWORD" -name "$NAME" \
  -macalg sha1 -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES
openssl x509 -in "$DIR/cert.pem" -outform der -out "$CERT"

# Trust the cert for code signing on this machine (may prompt for your password).
# CI does the same with the committed $CERT; without trust, find-identity and
# electron-builder both reject the identity.
security add-trusted-cert -r trustRoot -p codeSign "$DIR/cert.pem"

# Sanity check: import into a throwaway keychain and confirm codesign accepts
# the identity, exactly like electron-builder will on the CI runner.
KEYCHAIN="$HOME/Library/Keychains/vdoc-sign-check.keychain-db"
security delete-keychain "$KEYCHAIN" 2>/dev/null || true
security create-keychain -p check "$KEYCHAIN"
security import "$OUT" -k "$KEYCHAIN" -P "$PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k check "$KEYCHAIN" >/dev/null
security find-identity -v -p codesigning "$KEYCHAIN" | grep -q "$NAME" \
  || { echo "identity not valid for codesigning" >&2; security delete-keychain "$KEYCHAIN"; exit 1; }
security delete-keychain "$KEYCHAIN"

base64 -i "$OUT" | gh secret set MAC_CSC_LINK --repo "$REPO"
printf '%s' "$PASSWORD" | gh secret set MAC_CSC_KEY_PASSWORD --repo "$REPO"

echo "Secrets set. Commit $CERT (public cert, no secret) so CI can trust it."
echo "Back up $OUT and its password (currently only in MAC_CSC_KEY_PASSWORD):"
echo "re-creating the certificate later forces every user through one manual reinstall."
