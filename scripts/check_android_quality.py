"""Fail the release before signing if prebuild loses the Play quality fixes."""
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1] / 'frontend/android'
ANDROID = '{http://schemas.android.com/apk/res/android}'
props = dict(line.split('=', 1) for line in (ROOT / 'gradle.properties').read_text().splitlines() if '=' in line and not line.startswith('#'))
for key in ('android.enableMinifyInReleaseBuilds', 'android.enableShrinkResourcesInReleaseBuilds', 'edgeToEdgeEnabled'):
    assert props.get(key) == 'true', f'{key} must be enabled'
manifest = ET.parse(ROOT / 'app/src/main/AndroidManifest.xml').getroot()
application = manifest.find('application')
activity = next(x for x in application.findall('activity') if x.get(ANDROID + 'name') == '.MainActivity')
assert activity.get(ANDROID + 'screenOrientation') is None, 'MainActivity must support rotation'
assert activity.get(ANDROID + 'resizeableActivity') == 'true', 'MainActivity must support resizing'
assert application.get(ANDROID + 'resizeableActivity') == 'true'
styles = ET.parse(ROOT / 'app/src/main/res/values/styles.xml').getroot()
for item in styles.iter('item'):
    assert item.get('name') not in {'android:statusBarColor', 'android:navigationBarColor', 'android:windowOptOutEdgeToEdgeEnforcement'}, 'Deprecated window theme setting'
gradle = (ROOT / 'app/build.gradle').read_text()
assert 'minifyEnabled enableMinifyInReleaseBuilds' in gradle
assert 'shrinkResources = enableShrinkResources.toBoolean()' in gradle
assert 'getDefaultProguardFile("proguard-android-optimize.txt")' in gradle
print('Release R8, resource shrinking, edge-to-edge, rotation and resize settings verified')
