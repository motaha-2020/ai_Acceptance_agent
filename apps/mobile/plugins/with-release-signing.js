// Config plugin: sign release builds with the production keystore instead of the debug key.
// The keystore and its passwords never enter the repo; infra/scripts/build-apk.sh passes them as
// Gradle project properties through the environment:
//   ORG_GRADLE_PROJECT_ACCEPTANCE_STORE_FILE / _STORE_PASSWORD / _KEY_ALIAS / _KEY_PASSWORD
// Without them (local `expo run:android`) the release variant keeps the debug signature.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// acceptance-release-signing';

const SIGNING_CONFIG = `
        release {
            ${MARKER}
            if (project.hasProperty('ACCEPTANCE_STORE_FILE')) {
                storeFile file(project.property('ACCEPTANCE_STORE_FILE'))
                storePassword project.property('ACCEPTANCE_STORE_PASSWORD')
                keyAlias project.property('ACCEPTANCE_KEY_ALIAS')
                keyPassword project.property('ACCEPTANCE_KEY_PASSWORD')
            }
        }`;

function applySigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  // 1) add a `release` signing config next to the template's `debug` one
  const withConfig = gradle.replace(/signingConfigs\s*\{/, (m) => `${m}${SIGNING_CONFIG}`);
  // 2) make the release build type use it when the keystore was provided
  const releaseBlock = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (withConfig === gradle || !releaseBlock.test(withConfig)) {
    throw new Error('with-release-signing: app/build.gradle layout changed; update the plugin');
  }
  return withConfig.replace(
    releaseBlock,
    "$1signingConfig project.hasProperty('ACCEPTANCE_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
  );
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('with-release-signing: expected a Groovy app/build.gradle');
    cfg.modResults.contents = applySigning(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.applySigning = applySigning;
