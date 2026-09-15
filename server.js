const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DATA_FILE = path.join(DATA_DIR, 'keys.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readKeys() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify([]));
        }
        const data = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(data || '[]');
    } catch (err) {
        console.error("Error reading keys file:", err);
        return [];
    }
}

function writeKeys(keys) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(keys, null, 2));
    } catch (err) {
        console.error("Error writing keys file:", err);
    }
}

function calculateExpiry(type, value) {
    if (type === 'permanent') return null;
    
    const now = new Date();
    const val = parseInt(value) || 1;

    switch (type) {
        case 'minutes': now.setMinutes(now.getMinutes() + val); break;
        case 'hours': now.setHours(now.getHours() + val); break;
        case 'days': now.setDate(now.getDate() + val); break;
        case 'months': now.setMonth(now.getMonth() + val); break;
        case 'years': now.setFullYear(now.getFullYear() + val); break;
        default: now.setDate(now.getDate() + val); break;
    }
    return now.toISOString();
}

// ---------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------

app.get('/api/keys/verify', (req, res) => {
    const keyInput = req.query.key;
    if (!keyInput) return res.json({ valid: false, message: 'No Key Provided' });

    let keys = readKeys();
    const keyObj = keys.find(k => k.key === keyInput);

    if (!keyObj) {
        return res.json({ valid: false, message: 'Key Not Found!' });
    }

    const now = new Date();

    if (!keyObj.activatedAt) {
        keyObj.activatedAt = now.toISOString();
        if (keyObj.durationType !== 'permanent') {
            keyObj.expiresAt = calculateExpiry(keyObj.durationType, keyObj.durationValue);
        }
        writeKeys(keys);
    }

    if (keyObj.expiresAt && new Date(keyObj.expiresAt) < now) {
        return res.json({ valid: false, message: 'Key Has Expired!' });
    }

    return res.json({ valid: true, message: 'Key Approved!' });
});

app.post('/api/keys/generate', (req, res) => {
    const { customName, durationType, durationValue } = req.body;
    let keys = readKeys();

    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const keyName = customName ? customName.toUpperCase() : 'KEY';
    const newKey = `DRIP-${keyName}-${randomCode}`;

    const newKeyObj = {
        key: newKey,
        customName: customName || 'Unassigned',
        durationType: durationType || 'days',
        durationValue: durationValue || 1,
        activatedAt: null,
        expiresAt: null,
        createdAt: new Date().toISOString()
    };

    keys.push(newKeyObj);
    writeKeys(keys);

    res.json({ success: true, data: newKeyObj });
});

app.post('/api/keys/reseller-generate', (req, res) => {
    const { customName, plan } = req.body;
    let keys = readKeys();

    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const tag = customName ? customName.toUpperCase().replace(/\s+/g, '-') : 'RESELLER';
    const newKey = `DRIP-${tag}-${randomCode}`;

    const durationType = plan === 'permanent' ? 'permanent' : 'months';
    const durationValue = plan === 'permanent' ? 0 : 1;

    const newKeyObj = {
        key: newKey,
        customName: customName || 'Reseller Customer',
        durationType: durationType,
        durationValue: durationValue,
        activatedAt: null,
        expiresAt: null,
        createdAt: new Date().toISOString()
    };

    keys.push(newKeyObj);
    writeKeys(keys);

    res.json({ success: true, data: newKeyObj });
});

app.get('/api/keys/list', (req, res) => {
    const keys = readKeys();
    const now = new Date();

    let total = keys.length;
    let activated = 0;
    let expired = 0;

    const formattedKeys = keys.map(k => {
        let status = 'Unused';

        if (k.activatedAt) {
            if (k.expiresAt && new Date(k.expiresAt) < now) {
                status = 'Expired';
                expired++;
            } else {
                status = 'Active';
                activated++;
            }
        }

        return {
            key: k.key,
            customName: k.customName,
            status: status,
            activatedAt: k.activatedAt,
            expiresAt: k.expiresAt
        };
    });

    res.json({
        stats: { total, activated, expired },
        keys: formattedKeys
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
