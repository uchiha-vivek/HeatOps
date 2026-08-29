// Warms the city-baseline cache of a RUNNING HeatOps server so the first
// analysis a judge sees already has a live FortyGuard UHI delta.
//
// Why this is needed: the 15 km city polygon takes 90-240s to compute on
// FortyGuard's side, which is longer than the whole serverless request budget
// (vercel.json maxDuration: 60). So /api/analyze-heat submits the city job on
// one request and resolves it on a later one. Left alone, that means the FIRST
// analysis of a session always shows the calibration-table estimate rather
// than a measurement. This script does the first (submitting) run, waits, and
// does the second (resolving) run, so the cache is hot before you record.
//
// Run against whichever server you are demoing:
//   node scripts/warm-city-baseline.mjs
//   node scripts/warm-city-baseline.mjs --url https://your-app.vercel.app
//   node scripts/warm-city-baseline.mjs --location "Houston Ship Channel, Texas"
//
// Cost: 3 FortyGuard activities per location (site heatmap, city heatmap,
// env_params). The second run re-submits the site heatmap, so budget ~5.
//
// NOTE: the cache lives in the server process's memory. On Vercel a cold start
// or a different instance loses it, so warm the same deployment you will demo,
// shortly before you demo it, and avoid long idle gaps.

const args = process.argv.slice(2);
const arg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = arg('--url', 'http://localhost:3000').replace(/\/$/, '');
const LOCATION = arg('--location', 'Sky Harbor Logistics Corridor, Phoenix, Arizona');
// 90-240s measured at Phoenix, load-dependent. Default generously; the script
// reports honestly if the job still hasn't landed.
const WAIT_MS = Number(arg('--wait', '260')) * 1000;

const body = {
  location: LOCATION,
  activityType: 'Concrete Pouring',
  startTime: '06:00',
  endTime: '18:00',
  thresholdTemp: 35,
  crewCount: 35,
  isAcclimatized: true,
  hasShade: false,
  hasWater: true,
};

async function analyze(label) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/analyze-heat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`${label}: HTTP ${res.status}`, JSON.stringify(json)?.slice(0, 300));
    return null;
  }
  console.log(`\n${label} (${Math.round((Date.now() - t0) / 1000)}s)`);
  console.log(`  dataSource : ${json.dataSource}`);
  console.log(`  uhiSource  : ${json.uhiSource}`);
  console.log(`  uhiDeltaC  : ${json.uhiDeltaC}`);
  if (json.uhiVsCoolestC != null) {
    console.log(`  vs coolest : +${json.uhiVsCoolestC}C  (metro ${json.cityMinTempC}C - ${json.cityMaxTempC}C)`);
  }
  if (json.fortyGuardDiagnostics) {
    console.log(`  site call  : ${json.fortyGuardDiagnostics.site}`);
    console.log(`  city call  : ${json.fortyGuardDiagnostics.city}`);
    console.log(`  env_params : ${json.fortyGuardDiagnostics.envParams}`);
  }
  if (json.aiEnhanced === false) console.log(`  AI         : DEGRADED - ${json.aiNote}`);
  return json;
}

console.log(`Warming ${BASE} for "${LOCATION}"`);
await analyze('Run 1 (submits the city polygon job)');
console.log(`\nWaiting ${WAIT_MS / 1000}s for the 15km city polygon to finish computing...`);
await new Promise((r) => setTimeout(r, WAIT_MS));
const second = await analyze('Run 2 (resolves the city polygon)');

console.log('');
if (second?.uhiSource === 'fortyguard-heatmap') {
  console.log('READY: the UHI delta on screen is now a live FortyGuard measurement.');
} else {
  console.log(
    'NOT READY: still showing the calibration-table estimate. Re-run, or raise --wait. ' +
      'Do not claim the delta is FortyGuard-measured until uhiSource reads fortyguard-heatmap.'
  );
  process.exitCode = 1;
}
