#!/bin/bash
# Publish an over-the-air update to every installed APK on a channel.
#
#   npm run ota -- "Fix take out steps"            # preview channel (APKs we share)
#   npm run ota -- "Fix take out steps" production  # production channel (store builds, later)
#
# Only JavaScript and images travel this way. If the change adds a native
# library, a permission or an app.json plugin, build a new APK instead
# (`npx eas build --profile preview --platform android`): the fingerprint
# runtime version keeps this update away from APKs it would not run on.
#
# EAS does not apply eas.json's build env to updates, so the server address
# is set here explicitly.
set -euo pipefail
cd "$(dirname "$0")/.."

MESSAGE="${1:?Usage: npm run ota -- \"what changed\" [preview|production]}"
CHANNEL="${2:-preview}"

export EXPO_PUBLIC_API_BASE_URL="https://ops-engine-dev-330299.bifrost.saastack.site"
export EXPO_PUBLIC_SITE_ID="site-dev"

npx tsc --noEmit
npx eas-cli update --channel "$CHANNEL" --platform android --message "$MESSAGE" --non-interactive
