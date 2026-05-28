const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to read OPENROUTER_API_KEY from .env file or environment variables
function getApiKey() {
    if (process.env.OPENROUTER_API_KEY) {
        return process.env.OPENROUTER_API_KEY;
    }
    const envPath = path.join(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^OPENROUTER_API_KEY\s*=\s*(.*)$/m);
        if (match && match[1]) {
            let val = match[1].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            return val;
        }
    }
    return '';
}

const apiKey = getApiKey();
if (!apiKey) {
    console.error("Error: OPENROUTER_API_KEY is not defined in environment or .env file.");
    process.exit(1);
}
const postData = JSON.stringify({
    model: "qwen/qwen3-coder:free",
    messages: [
        { role: 'user', content: 'hello' }
    ],
    stream: true
});

const options = {
    hostname: 'openrouter.ai',
    path: '/api/v1/chat/completions',
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'KelvCodes DeepSeek Engine'
    }
};

console.log('Sending request to OpenRouter using qwen/qwen3-coder:free...');

const req = https.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);

    res.on('data', (chunk) => {
        console.log(`CHUNK: ${chunk.toString()}`);
    });

    res.on('end', () => {
        console.log('Response ended.');
    });
});

req.on('error', (err) => {
    console.error('Request Error:', err);
});

req.write(postData);
req.end();
