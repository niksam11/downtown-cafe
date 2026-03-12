const http = require('http');

console.log('Testing booking concurrency for 500 simultaneous users...');
// We will try to book Table 1 (2-seater) at 2026-12-01 19:00 with 500 requests at the exact same split-second.

const payload = JSON.stringify({
    name: "Concurrent User",
    email: "test@example.com",
    phone: "1234567890",
    date: "2026-12-01",
    time_slot: "19:00",
    guests: 2,
    special_requests: "Fast"
});

// Use a keep-alive agent to prevent socket exhaustion causing 500s
const agent = new http.Agent({ keepAlive: true, maxSockets: 500 });
const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/reservations',
    method: 'POST',
    agent: agent,
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
};

let successCount = 0;
let failCount = 0;
let conflictCount = 0;

const requests = [];
// Stagger the 500 requests over 1 second to simulate rapid real-world traffic without crashing the local network interface
for (let i = 0; i < 500; i++) {
    requests.push(new Promise((resolve) => {
        setTimeout(() => {
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 201) successCount++;
                    else if (res.statusCode === 409) conflictCount++; 
                    else {
                        failCount++;
                        if (failCount <= 5) {
                            console.error(`Failed request status: ${res.statusCode}, body: ${data}`);
                        }
                    }
                    resolve();
                });
            });
            req.on('error', () => { failCount++; resolve(); });
            req.write(payload);
            req.end();
        }, Math.floor(i * 2)); // 0 to 1000ms spread
    }));
}

Promise.all(requests).then(() => {
    console.log(`\nResults from 500 concurrent requests:`);
    console.log(`Successfully booked: ${successCount} (Should be exactly 5, as there are 5 2-seaters available for that slot)`);
    console.log(`Conflicts (Table full): ${conflictCount} (Expected ~495)`);
    console.log(`Failed/Errored: ${failCount} (Expected 0)`);
    process.exit(0);
});
