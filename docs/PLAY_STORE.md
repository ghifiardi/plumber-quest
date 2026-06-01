# Publishing Plumber Quest to the Google Play Store

This repo is set up to package the web game as a native Android app using
[Capacitor](https://capacitorjs.com/). The game runs **fully offline** — all
assets are bundled inside the app.

There are two halves to shipping:

1. **Build a signed App Bundle (`.aab`)** — automated in this repo.
2. **Submit it through the Play Console** — manual steps only you can do
   (Google account, the one-time **$25** registration fee, and identity
   verification).

---

## App identity (already configured)

| Field            | Value                              |
| ---------------- | ---------------------------------- |
| App name         | Plumber Quest                      |
| Application ID   | `io.github.ghifiardi.plumberquest` |
| Initial version  | versionName `1.0`, versionCode `1` |
| Min Android      | 7.0 (API 24)                       |
| Target Android   | API 36                             |

> The application ID is **permanent** once published. Don't change it.

---

## Part 1 — Build the `.aab`

### Step 1: Create your upload keystore (one time)

The keystore signs every release. **Back it up safely and never lose it** — if
you lose it you can't ship updates under the same app (unless you enrolled in
Play App Signing key reset). Generate it on your own machine:

```bash
keytool -genkey -v \
  -keystore upload-keystore.jks \
  -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

It will ask for a keystore password, a key password, and your name/org. Keep
the `.jks` file and both passwords somewhere safe (a password manager).

> ⚠️ Never commit the keystore or its passwords. The repo's `.gitignore`
> already blocks `*.jks`, `*.keystore`, and `keystore.properties`.

### Step 2A: Build in CI (recommended)

Add four repository secrets under **GitHub → Settings → Secrets and variables
→ Actions → New repository secret**:

| Secret              | Value                                                       |
| ------------------- | ----------------------------------------------------------- |
| `KEYSTORE_BASE64`   | The keystore file, base64-encoded (see command below)       |
| `KEYSTORE_PASSWORD` | The keystore (store) password from Step 1                   |
| `KEY_ALIAS`         | `upload` (or whatever `-alias` you used)                    |
| `KEY_PASSWORD`      | The key password from Step 1                                |

Encode the keystore:

```bash
# macOS / Linux
base64 -i upload-keystore.jks | tr -d '\n' > keystore.b64
# then copy the contents of keystore.b64 into the KEYSTORE_BASE64 secret
```

Then run the build: **Actions → "Build Android App Bundle" → Run workflow**.
You can optionally pass a `versionName` / `versionCode` for this build.
When it finishes, download the **`plumber-quest-release-aab`** artifact — that
`app-release.aab` is what you upload to Play. (An installable
`plumber-quest-release-apk` is also produced for quick testing on a device.)

Pushing a tag like `v1.0.0` triggers the same build automatically.

### Step 2B: Build locally (alternative)

Requires the Android SDK (e.g. via Android Studio) and JDK 21.

```bash
npm ci
npm run sync                       # assembles www/ and copies it into the Android project

cp keystore.properties.example keystore.properties
# edit keystore.properties with your real paths/passwords

cd android
./gradlew bundleRelease            # -> app/build/outputs/bundle/release/app-release.aab
./gradlew assembleRelease          # -> app/build/outputs/apk/release/app-release.apk (optional, for testing)
```

---

## Part 2 — Submit through the Play Console

1. **Register** a Google Play developer account at
   <https://play.google.com/console> (one-time $25 fee) and complete the
   **identity verification** Google requires (this can take a few days, so
   start early).
2. **Create app** → name "Plumber Quest", type *Game*, free.
3. Work through the **Dashboard checklist**:
   - **Store listing**: short & full description, app icon (512×512),
     feature graphic (1024×500), and at least 2–8 phone screenshots.
   - **Content rating** questionnaire.
   - **Target audience** & content, **Data safety** form (this app collects
     no data and uses only the INTERNET permission for Capacitor's local
     server), **Privacy policy** URL (required even for simple games).
   - **App access** (no login needed) and **Ads** (none) declarations.
4. **Release → Testing → Internal testing**: create a release, upload the
   `app-release.aab`, add yourself as a tester, and install via the opt-in
   link to verify it runs on a real device.
5. When happy, promote to **Production**, set the rollout, and submit for
   review.

> **Play App Signing:** When you upload your first bundle, Google manages the
> final app-signing key. Your keystore from Step 1 becomes the *upload* key.
> Keep it — you need it for every future upload.

---

## Shipping an update

1. Bump the version: increase `versionCode` (must strictly increase) and set a
   new `versionName` in `android/app/build.gradle`. The CI workflow can also
   override these via its run inputs.
2. Rebuild the `.aab` (Part 1).
3. Create a new release in the Play Console and upload the new bundle.

---

## Updating the game itself

The Android app just bundles the web build. After changing any game code:

```bash
npm run sync   # re-copies the latest web files into the Android project
```

CI does this automatically on every build.
