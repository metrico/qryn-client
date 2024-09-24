const {QrynClient,Metric, Stream} = require('../src');

async function main() {
    const client = new QrynClient({
        baseUrl: process.env['QYRN_READ_URL'],
        auth: {
          username: process.env['QYRN_LOGIN'],
          password: process.env['QRYN_PASSWORD']
        },
        timeout: 15000
    })
    const reader = client.prom.createReader({
        orgId: process.env['QYRN_ORG_ID']
    })

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