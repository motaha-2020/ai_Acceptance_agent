import path from 'node:path';
import { DATA_DIR, RAW_ROOT } from '../paths.js';
import { writeJson } from '../io.js';
import { buildSiteSeed } from '../site/build.js';

const sourceFolder = 'NASR3...C(R21C)/NASR3...C(R21C)';
const seed = await buildSiteSeed({
  siteDir: path.join(RAW_ROOT, sourceFolder),
  siteId: 'nasr3-r21c',
  sourceFolder,
});

const out = path.join(DATA_DIR, 'sites', 'nasr3-r21c.json');
await writeJson(out, seed);

console.log(`wrote ${out}`);
console.log(`device ${seed.device.hostname} ${seed.device.platform} sn=${seed.device.chassisSerial}`);
console.log(`inventory`, seed.inventorySummary);
console.log(`lld install=${seed.lld.install.length} internalLinks=${seed.lld.internalLinks.length}`);
console.log(`portMap=${seed.portMap.length} utilizationSheets=${seed.utilization.length} fiberTests=${seed.fiberTests.length}`);
console.log(`sidBom=${seed.sidBom.length} passivePower=${seed.passivePower.length} telcoPassive=${seed.telcoPassive.length}`);
console.log(`warnings (${seed.warnings.length}):`);
for (const w of seed.warnings) console.log(`  - ${w}`);
