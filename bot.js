const { insert, Createnum, updBlockUser, fetchNum, updUnblockingUser, fetchUserid, inblacklist } = require('./db');
const bot = require('./events');
const path = require('path');

const filePath = path.join(__dirname, './blacklist.db');

const commands = {
    '/blacklist_add': async (msg, args) => {
        const chatId = msg.chat.id;
        let user;

        if (args.length > 0 && msg.reply_to_message) {
            userToAdd = msg.reply_to_message.from;
        } else {
            const delmsg = await bot.sendMessage(chatId, 'Пожалуйста, ответьте на сообщение пользователя.');
            setTimeout(async () => {
                await bot.deleteMessage(delmsg.chat.id, delmsg.message_id);
                await bot.deleteMessage(msg.chat.id, msg.message_id);
            }, 3000);
            return;
        }

        if (userToAdd.username) {user = userToAdd.username} else if (userToAdd.id) {user = userToAdd.id}

        const reason = args.join(' ');

        await insert();
        const number = await fetchNum();
        const nums = number.num.at(-1) + 1;

        const buser = await inblacklist(userToAdd.id);
        if (buser) {
            const delmsg = await bot.sendMessage(chatId, `[Участник](http://t.me/${user}) уже находится в чёрном списке!`, { disable_web_page_preview: true, parse_mode: 'Markdown' })
            setTimeout(async () => {
                await bot.deleteMessage(delmsg.chat.id, delmsg.message_id);
                await bot.deleteMessage(msg.chat.id, msg.message_id);
            }, 3000);
            return;
        }

        Createnum(nums);
        addToBlacklist(reason, userToAdd, nums)
            .then(() => {
                return bot.sendMessage(chatId, `[Пользователь](http://t.me/${user}) добавлен в черный список по причине: "${reason}". Действие №${nums}`, { disable_web_page_preview: true, parse_mode: 'Markdown' });
            })
            .catch(error => {
                console.error('Ошибка при добавлении в черный список:', error);
                return bot.sendMessage(chatId, 'Произошла ошибка при добавлении пользователя в черный список.');
            });
    },
    '/blacklist_remove': async (msg, args) => {
        const chatId = msg.chat.id;
        let userToRm;
        let user;

        if (!msg.reply_to_message) {
            const delmsg = await bot.sendMessage(chatId, 'Пожалуйста, ответьте на сообщение пользователя.');

            setTimeout(async () => {
                await bot.deleteMessage(delmsg.chat.id, delmsg.message_id);
                await bot.deleteMessage(msg.chat.id, msg.message_id);
            }, 3000);
            return;
        }

        userToRm = msg.reply_to_message.from;

        if (userToRm.username) {user = userToRm.username} else if (userToRm.id) {user = userToRm.id}

        if (args.length === 0 || isNaN(args[0])) {
            const delmsg = await bot.sendMessage(chatId, 'Пожалуйста, укажите номер действия для удаления из черного списка.');

            setTimeout(async () => {
                await bot.deleteMessage(delmsg.chat.id, delmsg.message_id);
                await bot.deleteMessage(msg.chat.id, msg.message_id);
            }, 3000);
            return;
        }

        const actionNumber = args[0];
        try {
            const buser = await fetchUserid(actionNumber)
            if (!buser) {
                const delmsg = await bot.sendMessage(chatId, `Пользователь не найден в черном списке!`);

                setTimeout(async () => {
                    await bot.deleteMessage(delmsg.chat.id, delmsg.message_id);
                    await bot.deleteMessage(msg.chat.id, msg.message_id);
                }, 3000);
                return;
            }

            await updUnblockingUser(actionNumber);
        } catch (error) {
            console.log(`blacklist_rm error: ${error}`);
            const delmsg = await bot.sendMessage(chatId, 'Произошла ошибка при обработке апроса.');

            setTimeout(async () => {
                await bot.deleteMessage(delmsg.chat.id, delmsg.message_id);
                await bot.deleteMessage(msg.chat.id, msg.message_id);
            }, 3000);
            return;
        }

        return bot.sendMessage(chatId, `Действие №${actionNumber} удалено. [Участник](http://t.me/${user}) больше не в черном списке.`, { disable_web_page_preview: true, parse_mode: 'Markdown' })
    },
    '/viewlist': async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        // Проверка прав пользователя
        const member = await bot.getChatMember(chatId, userId);
    
        if (member.status !== 'administrator' && member.status !== 'creator') {
            // У пользователя нет прав на управление темами
            await bot.deleteMessage(chatId, msg.message_id);
            return;
        }

        return await bot.sendDocument(chatId, filePath, {}, { contentType: 'application/octet-stream' })
        .then(() => {
            bot.deleteMessage(chatId, msg.message_id);
        })
        .catch(error => {
            console.error("Ошибка при отправке файла:", error);
            const delmsg = bot.sendMessage(chatId, "Произошла ошибка при отправке файла.");
            
            setTimeout(async () => {
                await bot.deleteMessage(delmsg.chat.id, delmsg.message_id);
                await bot.deleteMessage(msg.chat.id, msg.message_id);
            }, 3000);
        });
    }
};

const addToBlacklist = async (reason, user, nums) => {
    try {
        updBlockUser('num', 'userid', 'reason', nums, user.id, reason);
    } catch (error) {
        console.log(`addToBlacklist err: ${error}`);
    }
};

bot.onText(/\/blacklist_add(.+)?/, async(msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const member = await bot.getChatMember(chatId, userId);
    if (member.status !== 'administrator' && member.status !== 'creator') {
        await bot.deleteMessage(chatId, msg.message_id);
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
        await bot.deleteMessage(chatId, msg.message_id);
        return;
    }
    const args = match[1].trim().split(/\s+/);
    commands['/blacklist_remove'](msg, args);
});

bot.onText(/\/viewlist/, async(msg) => {
    commands['/viewlist'](msg);
});

console.log('PojavModerator запущен и готов к работе.');