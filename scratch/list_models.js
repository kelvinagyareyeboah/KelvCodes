const https = require('https');

https.get('https://openrouter.ai/api/v1/models', (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            const models = parsed.data || [];
            console.log('--- DeepSeek / Free Models ---');
            models.forEach(m => {
                if (m.id.includes('deepseek') || m.id.includes('free')) {
                    console.log(`ID: ${m.id} | Name: ${m.name}`);
                }
            });
        } catch (e) {
            console.error('Failed to parse models response', e);
        }
    });
}).on('error', (err) => {
    console.error('Request failed', err);
});
