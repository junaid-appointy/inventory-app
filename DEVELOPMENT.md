# Field App — Development Pipeline

How to set up, build, run, and iterate on the field app. Covers laptop
toolchain, device connection, the two rebuild paths (local Android Studio vs.
EAS cloud), and the day-to-day dev loop.

> **The 95% rule.** Almost every change you make is JavaScript / TypeScript —
> Metro hot-reloads it onto the phone in under a second. You only rebuild the
> dev-client APK when you touch native code: `app.json` plugins, new
> `react-native-*` libraries, Android permissions, or new-arch flags.

---

## 1. One-time laptop setup

### 1.1 Node 22 LTS via fnm

Node 24 breaks Expo's config-plugin loader (ESM resolution bug). Pin Node 22.

```bash
brew install fnm
echo 'fnm env --use-on-cd | source' >> ~/.config/fish/config.fish
exec fish
fnm install 22
fnm use 22
node -v          # v22.x
```

`.node-version` in `field-app/` is set to `22`, so fnm auto-switches on `cd`.

### 1.2 Java 17 (for Android builds)

```bash
brew install --cask zulu@17
set -Ux JAVA_HOME (/usr/libexec/java_home -v 17)
java -version    # 17.x
```

### 1.3 Android Studio + Android SDK

Required only for **local** dev builds (`expo run:android`). Skip if you only
use EAS cloud builds.

```bash
brew install --cask android-studio
```

Open Android Studio once → finish the setup wizard → it installs the SDK to
`~/Library/Android/sdk`. Close it. Then in `~/.config/fish/config.fish`:

```fish
set -Ux ANDROID_HOME $HOME/Library/Android/sdk
fish_add_path $ANDROID_HOME/platform-tools
fish_add_path $ANDROID_HOME/emulator
fish_add_path $ANDROID_HOME/cmdline-tools/latest/bin
```

Reload (`exec fish`). Verify:

```bash
adb --version
echo $ANDROID_HOME
```

### 1.4 EAS CLI + Expo account (for cloud builds)

```bash
npm install -g eas-cli
eas login        # create a free Expo account if needed
```

---

## 2. Project install

```bash
cd /Users/appointy/work/OfficeOperationsUmbrella/field-app
npm install
```

If `npm install` ever fails with peer-dep errors after a dependency change:

```bash
rm -rf node_modules package-lock.json
npm install
```

### 2.1 Pinned library versions worth knowing

| Package | Version | Notes |
|---|---|---|
| `expo` | `^54.0.x` | SDK 54 |
| `react-native` | `0.81.x` | New Architecture **on** (required by Reanimated v4) |
| `react` | `19.1.0` | |
| `react-native-vision-camera` | `^4.6.4` | v5 dropped the Expo config plugin — pin to v4 |
| `react-native-reanimated` | `~4.1.x` | needs `newArchEnabled: true` in `app.json` |
| `react-native-svg` | `^15.x` | required by `lucide-react-native` for icons; native module → prebuild |
| `lucide-react-native` | `^1.x` | the icon library — see Conventions in `CLAUDE.md` (do not use Unicode glyphs) |
| `fuse.js` | `^7.x` | local fuzzy match for catalog suggestions (Layer 2 of spell-assist) |
| `@react-native-async-storage/async-storage` | `2.x` | session token, theme/lang prefs, one-time migrations |
| `babel-preset-expo` | `~54.0.10` | install with `npx expo install` if missing |

If you add a native module, prefer `npx expo install <pkg>` (picks
SDK-compatible version) over `npm install`. For packages not on Expo's known
list (like vision-camera), pin the major yourself.

---

## 3. Device connection

### 3.1 USB (first time)

1. Phone Settings → About → tap "Build number" 7× → Developer Mode on.
2. Settings → System → Developer options → enable **USB debugging**.
3. Plug into laptop. Accept the "Allow USB debugging" prompt on the phone.
4. `adb devices` should list one device with state `device`.

### 3.2 Wi-Fi (after USB works once — more convenient)

```bash
adb tcpip 5555                                       # phone plugged in
adb shell ip addr show wlan0 | grep "inet "          # phone's IP, e.g. 10.0.0.148
adb disconnect
adb connect 10.0.0.148:5555                          # use phone's actual IP
adb devices                                          # still shows 1 device
```

Unplug USB; `adb` keeps working over Wi-Fi. Reboots clear this — replug and
re-run to restore.

### 3.3 Network gotcha — laptop and phone on the same subnet

Metro picks one network interface and embeds its IP in the QR code. If laptop
is on Wi-Fi A and phone on Wi-Fi B, the phone can't reach Metro.

- **Easiest fix:** put both on the same Wi-Fi.
- **If you can't:** override the host Metro advertises:

  ```fish
  set -x EXPO_PACKAGER_HOSTNAME 10.0.0.X       # laptop IP on the phone's subnet
  npm run start:dev-client -- --clear
  ```

- **Last resort (any network):** tunnel through Expo's servers:

  ```bash
  npm install --save-dev @expo/ngrok
  npx expo start --dev-client --tunnel
  ```

  Slower but bulletproof.

---

## 4. The two kinds of changes — and the loop each one needs

| You changed… | Rebuild dev-client APK? | What to do |
|---|---|---|
| `src/**/*.{ts,tsx}` (screens, components, db, sync, design) | ❌ No | Save the file — Metro reloads the phone |
| `App.tsx`, `index.ts` | ❌ No | Same — Metro reloads |
| `package.json` — JS-only dep (date-fns, zustand, etc.) | ❌ No | `npm install` and restart Metro |
| `app.json` — JS-readable fields (name, colors, version) | ❌ No | Save — Metro reloads |
| **`app.json` — `plugins` array (add/remove a native plugin)** | ✅ Yes | Prebuild + rebuild |
| **New native lib (`react-native-*` with `ios/android/` folders)** | ✅ Yes | Prebuild + rebuild |
| **Android permissions, package id, splash native config** | ✅ Yes | Prebuild + rebuild |
| **`newArchEnabled` toggle, Reanimated/Vision-Camera major bumps** | ✅ Yes | Prebuild + rebuild |

When in doubt: save and see what Metro says. If the phone updates, you're
good. If you get a red error "native module X not found," you need a rebuild.

---

## 5. The day-to-day loop (95% case)

JS / TSX changes only.

### 5.1 Start Metro

```bash
cd /Users/appointy/work/OfficeOperationsUmbrella/field-app
npm run start:dev-client
```

(`npm start` is for Expo Go and won't connect to our dev-client APK. Always
use `start:dev-client`.)

### 5.2 Open the app on the phone

Open the **Field App** icon you installed earlier. It shows the dev-client
launcher. Either:

- Tap the previously-connected server under "Recently in development", **or**
- Scan the QR Metro printed, **or**
- Type `http://<laptop-ip>:8081` into "Enter URL manually".

The phone connects to Metro and downloads the JS bundle.

### 5.3 Edit and save

Edit any file under `src/`. Save. Metro rebuilds the JS bundle in ~200 ms and
pushes it. The phone hot-reloads with state preserved when possible.

### 5.4 Force-reload or open the dev menu

- **Reload:** shake the phone, or press `r` in Metro.
- **Dev menu:** shake the phone, or `adb shell input keyevent 82` from the
  laptop.
- **Inspector / JS debugger:** press `j` in Metro.

### 5.5 Logs

In a second terminal:

```bash
adb logcat *:S ReactNative:V ReactNativeJS:V
```

(`*:S` silences everything else; `ReactNativeJS:V` shows `console.log` from
your app.)

### 5.6 Clear caches when something is stuck

```bash
npm run start:dev-client -- --clear
```

Wipe SQLite for clean state:

```bash
adb shell run-as com.officeops.fieldapp rm -rf /data/data/com.officeops.fieldapp/databases
```

Reload — `getDb()` recreates the schema.

Wipe everything (SQLite **and** AsyncStorage — session token, selected
theme/language, the `resetLocalCacheOnce` migration flag):

```bash
adb shell pm clear com.officeops.fieldapp
```

Next launch you'll be at the Login screen with default theme/language and
an empty local cache.

---

## 6. Rebuilding the dev-client APK (5% case)

> **This project uses EAS cloud builds, not local Android Studio.** Path A
> below is the one we actually use. Path B is documented for completeness;
> only use it if you've gone through §1.2 (Java 17) and §1.3 (Android
> Studio + ANDROID_HOME) and have a working local toolchain.

### 6.1 Path A — EAS cloud build (the default)

```bash
cd /Users/appointy/work/OfficeOperationsUmbrella/field-app
npx eas build --profile development --platform android
```

- Build runs on Expo's servers, ~8–15 min on free tier.
- **Do not** `npm run prebuild` first. EAS runs prebuild on its servers;
  doing it locally is redundant and just litters your working tree with a
  generated `android/` folder.
- When the build finishes, EAS prints a URL. Open it in Chrome on the
  phone, download the APK, install it. Android will install on top of the
  old one (same package id) — no need to uninstall first.
- Then `npm run start:dev-client` on the laptop, open the new Field App on
  the phone, scan the QR (or pick the recent server). You're back in the
  dev loop.

### 6.2 Path B — local build (only if you've set up Android Studio)

Skips the EAS queue and is much faster after the first build, but requires
Java 17 + Android SDK + `ANDROID_HOME` (see §1.2 / §1.3).

```bash
npx expo prebuild --clean --platform android   # regenerate android/ from app.json
npx expo run:android                            # local Gradle build + install
```

- First build: ~5 min. Subsequent: ~30–60 s.
- Installs the new APK on the connected device automatically.
- Don't commit the `android/` folder that prebuild generates.

### 6.3 After either path

Open the **Field App** icon on the phone (now the rebuilt APK), reconnect
to Metro (scan QR or pick the recent server). You're back in the dev loop.

---

## 7. The four critical config files

| File | Purpose | Touch when |
|---|---|---|
| `package.json` | JS deps, scripts | Adding any package |
| `app.json` | Expo config — name, package id, permissions, plugins, new-arch | Native config changes |
| `babel.config.js` | Babel preset + Reanimated plugin | Almost never |
| `.node-version` | Pins Node 22 for fnm | Almost never |

The `android/` and `ios/` folders are **generated** by `expo prebuild` — don't
edit them by hand. Anything you'd want there belongs in an Expo plugin or
config-plugin in `app.json`.

---

## 8. Project layout recap

```
field-app/
  App.tsx                       # ThemeProvider + I18nProvider + AuthProvider + AppShell
  index.ts                      # Expo entry — registerRootComponent(App)
  app.json                      # Expo config (permissions, plugins, new-arch, cleartext)
  babel.config.js
  tsconfig.json
  .node-version                 # 22
  eas.json                      # EAS Build profiles
  src/
    config.ts                   # API base URL, site id, sync interval
    auth/                       # session store, AuthProvider, useAuth + useCan
    rbac/                       # Permission/Principal types + pure `can()` checker
    db/
      database.ts               # SQLite singleton + schema migrations
      products.ts               # catalog table
      orders.ts                 # orders + order_items
      outbox.ts                 # write queue (5 kinds: receipt/product/issue/reorder/mismatch)
      stock.ts                  # stock_levels + adjustOnHand + syncStockFromRemote
      catalog.ts                # union view used by fuzzy suggest
      maintenance.ts            # one-time cache wipes (AsyncStorage-gated)
    sync/
      api.ts                    # backend client (api.send.*, api.fetch.*)
      syncService.ts            # outbox flusher, ticks every config.syncIntervalMs
    design/                     # Lucide-icon-aware primitives: Button, Card, Chip,
                                # IconButton, Skeleton, StatusPill, Text, TextField,
                                # QtyStepper, AppBar, Surface, ListItem, tokens.ts
    theme/                      # ThemeProvider, themes (steadyPurple + bold)
    i18n/                       # I18nProvider, strings.ts (EN/HI table), useT()
    modules/
      types.ts                  # Module contract
      registry.ts               # MODULES list + getAllScreens()
      inventory/
        index.ts                # inventoryModule definition + screen registration
        screens/                # Home, Scanner, Receiving, RegisterProduct,
                                # DeliverySummary, Outbox, Orders, Stock, Issue,
                                # Alerts, Settings, Login
        components/             # QueueBadge (inventory-scoped)
        hooks/                  # useCatalogSuggest (fuse.js wrapper)
    navigation/
      RootNavigator.tsx         # reads modules + theme; auth-gates to Login
      types.ts                  # RootStackParamList
    utils/                      # haptics, deviceId
```

`RootNavigator` enumerates screens from `src/modules/registry.ts` rather
than importing each one directly — adding a new screen is "register it in
its module's `index.ts`," not edits to the navigator. Adding a whole new
operational area (attendance, maintenance, …) is a new `src/modules/<id>/`
folder plus one `registerPlugin`-style line in `registry.ts`.

The screen stack is gated on auth: until `useAuth().session` is non-null,
the navigator only mounts `LoginScreen`. The Login screen calls
`/api/guard/login` (visitor module's PIN auth) and stores the token in
`src/auth/session.ts`. RBAC is derived from the session via `useCan()`.

---

## 9. Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `Cannot find module 'babel-preset-expo'` | Preset missing from devDeps | `npx expo install babel-preset-expo` |
| `Project is incompatible with this version of Expo Go` | Phone has Expo Go SDK 54 but project is older | Bump project: `npm install expo@^54 && npx expo install --fix` (then bump `@types/react`, TypeScript per the install output) |
| `Cannot find module '.../lib/CameraDevices'` (vision-camera) | Node 24 ESM strict resolution, or vision-camera v5 (no plugin) | Use Node 22, pin vision-camera to `^4.6.4` |
| `Reanimated requires the New Architecture to be enabled` | `newArchEnabled: false` in app.json | Set `"newArchEnabled": true`, delete `ios/`+`android/`, prebuild, rebuild |
| `Failed to resolve the Android SDK path` | `$ANDROID_HOME` not set | See 1.3 |
| `Error loading app, failed to connect to /<ip>:8081` | Phone and laptop on different subnets | Same Wi-Fi, or set `EXPO_PACKAGER_HOSTNAME`, or `--tunnel` |
| `EMFILE: too many open files, watch` | macOS default file watcher hitting fd limit | `brew install watchman && watchman watch-del-all && npm start -- --clear` |
| App scans QR but does nothing | Metro is in dev-client mode but you scanned with Expo Go (or vice versa) | Use `npm run start:dev-client` and scan with the **Field App** APK, not Expo Go. Or press `s` in Metro to toggle |
| Build APK is 100+ MB | Dev variant includes all 4 CPU architectures + dev client UI + react-native-svg + reanimated + vision-camera | Normal in dev. Production single-ABI build is 30–50 MB. Play Store / per-device delivery is 20–30 MB |
| `Network request failed` on login | Wrong API base, or http:// blocked on Android 9+ without cleartext flag | Set `EXPO_PUBLIC_API_BASE_URL` to your engine URL (ngrok HTTPS is easiest). Cleartext is enabled in `app.json` (`usesCleartextTraffic: true`) but only takes effect after a dev-client rebuild |
| `Cannot find native module 'RNSVGSvg…'` | `react-native-svg` (Lucide's peer) added without rebuilding the dev client | Run section 6's prebuild + rebuild |
| Icons render as missing characters (□) | Someone reverted a Lucide swap back to a Unicode glyph that the Android font doesn't ship | See `CLAUDE.md` Conventions — only Lucide for chrome, never Unicode/emoji |
| Login succeeds but reads return 401 | `x-site-id` mismatch with the engine | Either set `EXPO_PUBLIC_SITE_ID` to a site the backend knows about, or seed that site server-side. Default is `site-dev` |

---

## 10. Recommended three-terminal workflow

| Terminal | Command | Purpose |
|---|---|---|
| 1 | `npm run start:dev-client` | Metro — JS rebuilds, Fast Refresh, dev menu |
| 2 | `adb logcat *:S ReactNative:V ReactNativeJS:V` | Native + JS logs, crash traces |
| 3 | Free | `git`, `npm`, `expo run:android`, etc. |

Keep Metro running all day. Restart only when you change `babel.config.js`,
add a Babel plugin, or things behave very strangely (`-- --clear`).

---

## 11. When you eventually ship

Production build (signed, optimized, no dev client):

```bash
npx eas build --profile production --platform android
```

For Play Store, submit the AAB:

```bash
npx eas submit --platform android --latest
```

That's a separate flow from development — covered when we get there.

---

## Quick reference card

```bash
# JS change → already covered by Metro
# (just save the file)

# Native change → EAS cloud build (default for this project)
npx eas build --profile development --platform android   # ~10 min
# open the URL it prints on the phone, install the APK, then:
npm run start:dev-client                          # serve JS to the new APK

# (Local build alternative — only if you've set up Android Studio)
# npx expo prebuild --clean --platform android
# npx expo run:android                            # ~1 min after first build

# Logs
adb logcat *:S ReactNative:V ReactNativeJS:V

# Force reload
adb shell input keyevent 82                       # opens dev menu, then "Reload"

# Wipe local DB
adb shell run-as com.officeops.fieldapp rm -rf /data/data/com.officeops.fieldapp/databases

# Wipe everything (SQLite + AsyncStorage: session, theme/lang)
adb shell pm clear com.officeops.fieldapp

# Different Wi-Fi
set -x EXPO_PACKAGER_HOSTNAME 10.0.0.X
npm run start:dev-client -- --clear
```
