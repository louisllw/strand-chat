#!/bin/sh
set -e

DEFAULT_JWT="change_me_in_production"
JWT_FILE="/data/jwt_secret"

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "$DEFAULT_JWT" ]; then
  if [ -f "$JWT_FILE" ]; then
    JWT_SECRET="$(cat "$JWT_FILE")"
    export JWT_SECRET
    echo "Loaded JWT_SECRET from ${JWT_FILE}."
  else
    JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
    export JWT_SECRET
    mkdir -p "$(dirname "$JWT_FILE")"
    echo "$JWT_SECRET" > "$JWT_FILE"
    echo "Generated JWT_SECRET and stored it at ${JWT_FILE}."
  fi
fi

exec "$@"
