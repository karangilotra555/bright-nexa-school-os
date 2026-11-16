const https = require('https');

const DEPLOY_HOOK_URL = process.env.RENDER_DEPLOY_HOOK_URL || '';

function triggerDeploy() {
  if (!DEPLOY_HOOK_URL) {
    console.error('RENDER_DEPLOY_HOOK_URL is required to trigger deploy');
    process.exit(1);
  }
  console.log('Triggering Render Auto-Deploy via Deploy Hook...');
  const req = https.request(DEPLOY_HOOK_URL, { method: 'POST' }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`Render Deploy Triggered (Status ${res.statusCode}):`, data);
    });
  });
  req.on('error', (err) => {
    console.error('Failed to trigger Render deploy:', err.message);
  });
  req.end();
}

if (require.main === module) {
  triggerDeploy();
}

module.exports = { triggerDeploy, DEPLOY_HOOK_URL };

