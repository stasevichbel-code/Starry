const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const bodyParser = require('body-parser');

const app = express();
const db = new sqlite3.Database('starry.db'); // Та же БД, что и у бота

app.use(bodyParser.json());
app.use(express.static('./')); // Чтобы отдавать index.html

const BOT_TOKEN = '8206086440:AAFvAE6dQCaiRk85Q7PWh4VrTOanzcUaKNM'; // Тот же токен, что у бота

// Верификация initData (обязательно для безопасности!)
function validateInitData(initData) {
    const dataCheckString = initData.split('&').filter(part => part !== '').sort().join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    const receivedHash = initData.match(/hash=([a-f0-9]{64})/)[1];
    return hash === receivedHash;
}

// Хранение OTP (в реальности используйте Redis с TTL)
const otpStore = {};

// Получить баланс
app.post('/api/balance', (req, res) => {
    const { initData, userId } = req.body;
    if (!validateInitData(initData)) return res.json({ error: 'Invalid initData' });

    db.get('SELECT balance FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err || !row) res.json({ balance: 0 });
        else res.json({ balance: row.balance });
    });
});

// Отправить код (здесь просто генерируем и сохраняем, в реальности отправьте через SMS или Telegram)
app.post('/api/send-code', (req, res) => {
    const { initData, userId, phone } = req.body;
    if (!validateInitData(initData)) return res.json({ message: 'Invalid initData' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[userId] = code; // Сохраняем код (в проде — с TTL 5 мин)
    console.log(`Код для \( {userId} ( \){phone}): ${code}`); // В реальности отправьте SMS

    res.json({ message: 'Код отправлен (проверьте консоль для теста)' });
});

// Верификация и вывод
app.post('/api/verify-withdraw', (req, res) => {
    const { initData, userId, code } = req.body;
    if (!validateInitData(initData)) return res.json({ message: 'Invalid initData' });

    if (otpStore[userId] && otpStore[userId] === code) {
        db.get('SELECT balance FROM users WHERE user_id = ?', [userId], (err, row) => {
            if (row && row.balance > 0) {
                db.run('UPDATE users SET balance = 0 WHERE user_id = ?', [userId]);
                // Здесь можно добавить логику реального вывода в Telegram Stars через Bot API
                delete otpStore[userId];
                res.json({ success: true, message: 'Звёзды успешно выведены!' });
            } else {
                res.json({ message: 'Нет звёзд для вывода' });
            }
        });
    } else {
        res.json({ message: 'Неверный код' });
    }
});

app.listen(3000, () => console.log('Mini App сервер на http://localhost:3000'));
