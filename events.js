const TelegramBot = require('node-telegram-bot-api');
const { token, supportChannel, admins } = require('./config.json');
const { inblacklist } = require('./db');

const bot = new TelegramBot(token, { polling: true });

const adminList = admins.split(',').map(admin => admin.trim());

//Delete messages if not written by an administrator
bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    if (chatId > 0) {
        if (!adminList.includes(msg.from.username)) {
            bot.deleteMessage(chatId, msg.message_id)
                .catch(err => {
                    console.error('Ошибка при удалении сообщения:', err);
                });
        }
    }
});

bot.on('message', async (msg) => {
    const topicId = msg.message_thread_id || 0;

    if (topicId === supportChannel) {
        const userId = msg.from.id;

        const buser = await inblacklist(userId);
        //buser = true || false
        if (buser) {
            bot.deleteMessage(msg.chat.id, msg.message_id)
                .catch(err => console.log('Не удалось удалить сообщение:', err));
        }
    }
});
module.exports = bot;
console.log(`event.js запущен!`);