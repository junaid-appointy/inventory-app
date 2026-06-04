⏺ You have 3 build profiles:

  1. development — For local development
    - Development client enabled
    - Internal distribution
    - APK format
    - Use: ! npx eas build --profile development --platform android
  2. preview — For testing with stakeholders
    - Internal distribution
    - APK format
    - Use: ! npx eas build --profile preview --platform android
  3. production — For release
    - Auto-increments version
    - App Bundle format (for Play Store)
    - Use: ! npx eas build --profile production --platform android


---

❯ should I Generate a new Android Keystore?

⏺ No, don't generate a new keystore.

  Your EAS project already has one configured. Generating a new keystore would:
  - Break code signing for future updates
  - Prevent the new app from updating existing installations (different keystores = different signing identity)
  - Cause issues with existing releases

  Since this is an existing EAS project, keep using the existing keystore. If you need to check your keystore
  details:

  eas credentials

  Just proceed with the build — EAS will use your existing keystore automatically.

❯ In this mode, we won't be able to make sure that your credentials are valid.
  Double check that you're uploading valid files for your app otherwise you may encounter strange errors!
  When building for IOS make sure you've created your App ID on the Apple Developer Portal, that your App ID
  is in app.json as `bundleIdentifier`, and that the provisioning profile you
  upload matches that Team ID and App ID.

  ? Path to the Keystore file. ›

⏺ You can skip this by pressing Enter without providing a path. Since your EAS project already has credentials
  managed, EAS will use the keystore it has on file.

  If you want to properly manage credentials, you can abort the build and run:

  eas credentials

  This will let you view/manage your stored credentials. But for now, just press Enter to use the existing
  keystore that EAS has for your project.

---

field-app on  feature/bill-mapping [$!+?] via  v22.22.3 took 4s
❯ ! npx eas build --profile development --platform android
★ eas-cli@20.0.0 is now available.
To upgrade, run:
npm install -g eas-cli
Proceeding with outdated version.

Found eas-cli in your project dependencies.
It's recommended to use the "cli.version" field in eas.json to enforce the eas-cli version for your project.
Learn more: https://github.com/expo/eas-cli#enforcing-eas-cli-version-for-your-project

Resolved "development" environment for the build. Learn more: https://docs.expo.dev/eas/environment-variables/#setting-the-environment-for-your-builds
No environment variables with visibility "Plain text" and "Sensitive" found for the "development" environment on EAS.

No remote versions are configured for this project, versionCode will be initialized based on the value from the local project.
✔ Initialized versionCode with 1.


✔ Created update channel "development" and branch "development" on @junaid-appointy/field-app project. Learn more: https://docs.expo.dev/eas-update/eas-cli/
✔ Using remote Android credentials (Expo server)
✔ Generate a new Android Keystore? … no

In this mode, we won't be able to make sure that your credentials are valid.
Double check that you're uploading valid files for your app otherwise you may encounter strange errors!
When building for IOS make sure you've created your App ID on the Apple Developer Portal, that your App ID
is in app.json as `bundleIdentifier`, and that the provisioning profile you
upload matches that Team ID and App ID.

✖ Path to the Keystore file. …

field-app on  feature/bill-mapping [$!+?] via  v22.22.3 took 2m29s
❯ eas credentials
fish: Unknown command: eas

field-app on  feature/bill-mapping [$!+?] via  v22.22.3
❯ ! npx eas credentials
★ eas-cli@20.0.0 is now available.
To upgrade, run:
npm install -g eas-cli
Proceeding with outdated version.

Found eas-cli in your project dependencies.
It's recommended to use the "cli.version" field in eas.json to enforce the eas-cli version for your project.
Learn more: https://github.com/expo/eas-cli#enforcing-eas-cli-version-for-your-project

✔ Select platform › Android
✔ Which build profile do you want to configure? › development
✔ Using build profile: development
Android Credentials
Project                 field-app
Application Identifier  com.officeops.auxilio
No credentials set up yet!

✔ What do you want to do? › Keystore: Manage everything needed to build your project
Android Credentials
Project                 field-app
Application Identifier  com.officeops.auxilio
No credentials set up yet!

✔ What do you want to do? › Set up a new keystore
✔ Assign a name to your build credentials: … Auxilio build credentials
✔ Generate a new Android Keystore? … yes
Detected that you do not have keytool installed locally.
✔ Generating keystore in the cloud...
✔ Created keystore
✔ Created Android build credentials Auxilio build credentials
Press any key to continue...


Android Credentials
Project                 field-app
Application Identifier  com.officeops.auxilio

Push Notifications (FCM Legacy)
  None assigned yet

Push Notifications (FCM V1): Google Service Account Key For FCM V1
  None assigned yet

Submissions: Google Service Account Key for Play Store Submissions
  None assigned yet

Configuration: Auxilio build credentials (Default)
Keystore
Type                JKS
Key Alias           7e18fcdbba9655c3797de96512777b45
MD5 Fingerprint     7E:46:D8:A3:33:F3:A5:93:01:21:18:6F:08:5C:F3:EC
SHA1 Fingerprint    CC:3A:9E:B2:62:1D:BA:E1:50:3C:60:A0:83:DA:33:96:ED:63:B0:50
SHA256 Fingerprint  1F:C1:71:38:E7:1C:14:04:27:D5:11:DD:80:61:0E:B9:0A:3B:98:D4:70:2B:34:0A:EC:EA:06:4E:41:22:56:49
Updated             6 seconds ago

✔ What do you want to do? › Go back
Android Credentials
Project                 field-app
Application Identifier  com.officeops.auxilio

Push Notifications (FCM Legacy)
  None assigned yet

Push Notifications (FCM V1): Google Service Account Key For FCM V1
  None assigned yet

Submissions: Google Service Account Key for Play Store Submissions
  None assigned yet

Configuration: Auxilio build credentials (Default)
Keystore
Type                JKS
Key Alias           7e18fcdbba9655c3797de96512777b45
MD5 Fingerprint     7E:46:D8:A3:33:F3:A5:93:01:21:18:6F:08:5C:F3:EC
SHA1 Fingerprint    CC:3A:9E:B2:62:1D:BA:E1:50:3C:60:A0:83:DA:33:96:ED:63:B0:50
SHA256 Fingerprint  1F:C1:71:38:E7:1C:14:04:27:D5:11:DD:80:61:0E:B9:0A:3B:98:D4:70:2B:34:0A:EC:EA:06:4E:41:22:56:49
Updated             42 seconds ago

✔ What do you want to do? › Exit

field-app on  feature/bill-mapping [$!+?] via  v22.22.3 took 2m20s
❯ ! npx eas build --profile development --platform android
★ eas-cli@20.0.0 is now available.
To upgrade, run:
npm install -g eas-cli
Proceeding with outdated version.


---
Run:

npm run start:dev-client