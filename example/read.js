const { GigapipeClient, Metric, Stream } = require('../src');

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
    
    console.log(`Reading from: ${baseUrl}`);
    
    const reader = client.prom.createReader({
        orgId: process.env['GIGAPIPE_ORG_ID'] || 'your-org-id'
    });

    let metrics = await reader.labels().then( labels => {
        let label = labels.response.data[1];
        return reader.labelValues(label).then( values => {
            let value  = values.response.data[0];
            let query = `{${label}="${value}"}`; 
            let start = Math.floor(Date.now() / 1000) - (0.5 * 60 * 60);
            let end = Math.floor(Date.now() / 1000);
            let step = 60
            return reader.queryRange(query,start,end,step).then(range => {
                return range.response.data.result;
            }).catch(err => {
                console.log(err);
            })
        })
    })
    console.log(metrics);



   
}

main();