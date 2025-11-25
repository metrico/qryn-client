const { GigapipeClient } = require('../src');

async function main() {
    const baseUrl = process.env['GIGAPIPE_READ_URL'] ? 
        `http://${process.env['GIGAPIPE_READ_URL']}:3100` : 
        process.env['GIGAPIPE_WRITE_URL'] ? 
        `http://${process.env['GIGAPIPE_WRITE_URL']}:3100` : 
        'http://localhost:3100';
        
    const client = new GigapipeClient({
        baseUrl: baseUrl,
        auth: {
          username: process.env['GIGAPIPE_LOGIN'] || 'your-username',
          password: process.env['GIGAPIPE_PASSWORD'] || 'your-password'
        },
        timeout: 15000
    });
    
    console.log(`Reading from Loki: ${baseUrl}`);
    
    const reader = client.loki.createReader({
        orgId: process.env['GIGAPIPE_ORG_ID'] || 'your-org-id'
    });

    const labels = await reader.labels();
    console.log('Labels:', labels.response.data);
}

main().catch(console.error);

