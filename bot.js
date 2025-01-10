const { insert, Createnum, updBlockUser, fetchNum, updUnblockingUser, fetchUserid, inblacklist } = require('./db');
const path = require('path');
const bot = require('./events');

const filePath = path.join(__dirname, './blacklist.db');

const safeDeleteMessage = async (chatId, messageId, options = {}) => {
    try {
        // Check if message_thread_id exists in options and pass it when deleting
        if (options.message_thread_id) {
            await bot.deleteMessage(chatId, messageId, { message_thread_id: options.message_thread_id });
        } else {
            await bot.deleteMessage(chatId, messageId);
        }
    } catch (error) {
        if (error.code === 'ETELEGRAM' && error.response && error.response.statusCode === 400) {
            console.log(`Message to delete not found: Chat ID ${chatId}, Message ID ${messageId}`);
        } else {
            console.error('Unexpected error while deleting message:', error);
        }
    }
};

const commands = {
    '/blacklist_add': async (msg, args) => {
        const chatId = msg.chat.id;
        let user;

        if (args.length > 0 && msg.reply_to_message) {
            userToAdd = msg.reply_to_message.from;
        } else {
            const delmsg = await bot.sendMessage(chatId, 'Пожалуйста, ответьте на сообщение пользователя.');
            setTimeout(async () => {
                await safeDeleteMessage(delmsg.chat.id, delmsg.message_id);
                await safeDeleteMessage(msg.chat.id, msg.message_id);
            }, 3000);
            return;
        }
        if (userToAdd.id === 7547671621) return;

        if (userToAdd.username) {user = `t.me/${userToAdd.username}`} else if (userToAdd.id) {user = `tg://user?id=${userToAdd.id}`}

        const reason = args.join(' ');

        await insert();
        
        const number = await fetchNum();
        const nums = number.num.at(-1) + 1;
        await Createnum(nums)

        const buser = await inblacklist(userToAdd.id);
        if (buser) {
            const delmsg = await bot.sendMessage(chatId, "Пользователь ["+userToAdd.first_name+`](${user}) уже находится в чёрном списке!`, { disable_web_page_preview: true, parse_mode: 'Markdown' })
            setTimeout(async () => {
                await safeDeleteMessage(delmsg.chat.id, delmsg.message_id);
                await safeDeleteMessage(msg.chat.id, msg.message_id);
            }, 3000);
            return;
        }

        addToBlacklist(reason, userToAdd, nums)
            .then(async() => {
                return await bot.sendMessage(chatId, "Пользователь ["+userToAdd.first_name+`](${user}) добавлен в черный список по причине: ${reason}`, { disable_web_page_preview: true, parse_mode: 'Markdown' });
            })
            .catch(async(error) => {
                console.error('Ошибка при добавлении в черный список:', error);
                return await bot.sendMessage(chatId, 'Произошла ошибка при добавлении пользователя в черный список. Совет: не используйте быстрые команды.');
            });
    },
    '/blacklist_remove': async (msg) => {
        const chatId = msg.chat.id;
        let userToRm;
        let user;

        if (!msg.reply_to_message) {
            const delmsg = await bot.sendMessage(chatId, 'Пожалуйста, ответьте на сообщение пользователя.');

            setTimeout(async () => {
                await safeDeleteMessage(delmsg.chat.id, delmsg.message_id);
                await safeDeleteMessage(msg.chat.id, msg.message_id);
            }, 3000);
            return;
        }

        await insert();

        userToRm = msg.reply_to_message.from;

        if (userToRm.username) {user = `t.me/${userToRm.username}`} else if (userToRm.id) {user = `tg://user?id=${userToRm.id}`}

        try {
            const buser = await inblacklist(userToRm.id)
            if (!buser) {
                const delmsg = await bot.sendMessage(chatId, `Пользователь не найден в черном списке!`);

                setTimeout(async () => {
                    await safeDeleteMessage(delmsg.chat.id, delmsg.message_id);
                    await safeDeleteMessage(msg.chat.id, msg.message_id);
                }, 3000);
                return;
            }

            await updUnblockingUser(userToRm.id);
        } catch (error) {
            console.log(`blacklist_rm error: ${error}`);
            const delmsg = await bot.sendMessage(chatId, 'Произошла ошибка при обработке апроса.');

            setTimeout(async () => {
                await safeDeleteMessage(delmsg.chat.id, delmsg.message_id);
                await safeDeleteMessage(msg.chat.id, msg.message_id);
            }, 3000);
            return;
        }

        return bot.sendMessage(chatId, `Пользователь [`+userToRm.first_name+`](${user}) больше не в черном списке.`, { disable_web_page_preview: true, parse_mode: 'Markdown' })
    },
    '/viewlist': async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        // Проверка прав пользователя
        const member = await bot.getChatMember(chatId, userId);
    
        if (member.status !== 'administrator' && member.status !== 'creator') {
            // У пользователя нет прав на управление темами
            await safeDeleteMessage(chatId, msg.message_id);
            return;
        }

        return await bot.sendDocument(chatId, filePath, {}, { contentType: 'application/octet-stream' })
        .then(() => {
            safeDeleteMessage(chatId, msg.message_id);
        })
        .catch(async(error) => {
            console.error("Ошибка при отправке файла:", error);
            await bot.sendMessage(chatId, "Произошла ошибка при отправке файла.");
            
            setTimeout(async () => {
                await safeDeleteMessage(msg.chat.id, msg.message_id);
            }, 3000);
        });
    }
};

const addToBlacklist = async (reason, user, nums) => {
    try {
        updBlockUser('num', 'userid', 'reason', nums, user.id, reason);
    } catch (error) {
        console.error(`addToBlacklist err: ${error}`);
    }
};

bot.onText(/\/blacklist_add(.+)?/, async(msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const member = await bot.getChatMember(chatId, userId);
    if (member.status !== 'administrator' && member.status !== 'creator') {
        await safeDeleteMessage(chatId, msg.message_id);
        return;
    }
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    commands['/blacklist_add'](msg, args);
});

bot.onText(/\/blacklist_remove(.+)/, async(msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const member = await bot.getChatMember(chatId, userId);
    if (member.status !== 'administrator' && member.status !== 'creator') {
        await safeDeleteMessage(chatId, msg.message_id);
        return;
    }
    const args = match[1].trim().split(/\s+/);
    commands['/blacklist_remove'](msg, args);
});

bot.onText(/\/viewlist/, async(msg) => {
    commands['/viewlist'](msg);
});

// Какая-то чертовщина для поллинга, в моем случае ошибки не решило, но пускай оно тут будет
bot.on('polling_error', (error) => {
  console.log(error.code);  // => 'EFATAL'
});
        
console.log('PojavModerator запущен и готов к работе.');
