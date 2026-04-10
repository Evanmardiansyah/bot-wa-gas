const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
// URL Web App GAS kamu (Ganti nanti di Environment Variables Render)
const GAS_URL = process.env.GAS_URL || 'URL_GAS_KAMU_DISINI'; 

let sock;

async function connectToWA() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_wa');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }) // Biar log ga berisik
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, reconnecting:', shouldReconnect);
            if (shouldReconnect) connectToWA();
        } else if (connection === 'open') {
            console.log('✅ Bot WA Berhasil Terhubung!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Tangkap pesan masuk
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return; // Abaikan pesan dari bot sendiri atau status

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (text) {
            console.log(`📩 Pesan dari ${sender}: ${text}`);
            
            // Lempar isi pesan ke Google Apps Script
            try {
                await axios.post(GAS_URL, {
                    sender: sender,
                    message: text
                });
            } catch (error) {
                console.error('❌ Gagal kirim ke GAS:', error.message);
            }
        }
    });
}

// Endpoint buat nerima balasan dari GAS untuk dikirim ke WA
app.post('/send', async (req, res) => {
    const { sender, reply } = req.body;
    if (sock && sender && reply) {
        try {
            await sock.sendMessage(sender, { text: reply });
            res.status(200).send('Pesan terkirim ke WA');
        } catch (error) {
            console.error('Gagal balas:', error);
            res.status(500).send('Gagal kirim pesan WA');
        }
    } else {
        res.status(400).send('Data tidak lengkap / Bot belum ready');
    }
});

// Endpoint untuk ngecek server nyala atau ngga di Render
app.get('/', (req, res) => {
    res.send('Tukang Pos WA Nyala Bro!');
});

app.listen(PORT, () => {
    console.log(`🚀 Server jalan di port ${PORT}`);
    connectToWA();
});
