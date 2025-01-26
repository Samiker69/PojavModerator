const TelegramBot = require('node-telegram-bot-api');
const { token, supportChannel, admins, botLogsGroupId } = require('./config.json');
const { inblacklist, insert } = require('./db');

const bot = new TelegramBot(token, { polling: true });

//Delete messages if not written by an administrator
bot.on('message', (msg) => {
    const chat = msg.chat

    if (chat.type === 'private') {
        if (!admins.includes(msg.from.id)) {
            safeDeleteMessage(chat.id, msg.message_id).catch(err => {
              console.error('Ошибка при удалении сообщения:', err);
            });
        }
    }
});

bot.on('message', async (msg) => {
  let topicId = msg.message_thread_id;
  if (!msg.is_topic_message) topicId = null;
    const delmsginchannel = supportChannel;
    const userId = msg.from.id;

    if (topicId === delmsginchannel) {
      await insert();
        const buser = await inblacklist(userId); //buser = true || false
        if (buser) {
            safeDeleteMessage(msg.chat.id, msg.message_id, { message_thread_id: topicId })
                .catch(err => console.log('Не удалось удалить сообщение:', err));
        }
    }
});

// Function to send messages to the chat or thread
async function sendMessage(chatId, text, options = {}) {
  const messageOptions = options.message_thread_id ? { message_thread_id: options.message_thread_id } : {};
  await bot.sendMessage(chatId, text, messageOptions);
}

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
            console.log(`Message to delete not found: Chat ID ${chatId}, Message ID ${messageId}`, error);
        } else {
            console.error('Unexpected error while deleting message:', error);
        }
    }
};

async function sendDelMessage(chatId, text, options = {}, msg) {
    let messageThreadId = msg.message_thread_id;
    if (!msg.is_topic_message) messageThreadId = null;

    const messageOptions = options.message_thread_id ? { message_thread_id: options.message_thread_id } : {};
    const del = await bot.sendMessage(chatId, text, messageOptions);

    setTimeout(async () => {
        await safeDeleteMessage(del.chat.id, del.message_id, { message_thread_id: messageThreadId });
    }, 3000);
}


const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./tags.db');
const cache = new Map(); // Cache for tags

// Initialize the tags table in the database
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY,
    tag TEXT UNIQUE,
    description TEXT
  )`);
});

// Function to check if the user is an admin in the chat
async function isAdmin(chatId, userId) {
  try {
    const admins = await bot.getChatAdministrators(chatId);
    return admins.some(admin => admin.user.id === userId);
  } catch (error) {
    console.error('Error checking admin:', error);
    return false;
  }
}

bot.onText(/\/addtag (.+)/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  let messageThreadId = msg.message_thread_id;
  if (!msg.is_topic_message) messageThreadId = null;
  const msgtxt = msg.text

  const tagN = msgtxt.replace("/addtag ", "");
  let parts = tagN.split(/\s(.+)/);

  const tagName = parts[0];

  parts=parts.filter(item => item !== parts[0]);
  parts=parts.map(item => item === '' ? '\n' : item);

  const tagDescription = parts.join('');

  // Check if the user is an admin
  if (!await isAdmin(chatId, userId)) {
    await sendDelMessage(chatId, 'У вас нет разрешения на добавление тегов.', { message_thread_id: messageThreadId }, msg);
    return;
  }

  // Insert the new tag into the database
  db.run(`INSERT INTO tags (tag, description) VALUES (?, ?)`, [tagName, tagDescription], async function (err) {
    if (err) {
        await sendDelMessage(chatId, 'Ошибка: тег уже существует или произошла ошибка.', { message_thread_id: messageThreadId }, msg);
    } else {
      cache.set(tagName, tagDescription); // Cache the new tag
      sendMessage(chatId, `Тег '${tagName}' был успешно добавлен.`, { message_thread_id: messageThreadId });
    }
  });
}); 

// Delete a tag (only for admins)
bot.onText(/\/deletetag (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  let messageThreadId = msg.message_thread_id;
  if (!msg.is_topic_message) messageThreadId = null;
  const tagName = match[1];

  // Check if the user is an admin
  if (!await isAdmin(chatId, userId)) {
    await sendDelMessage(chatId, 'У вас нет разрешения на удаление тегов.', { message_thread_id: messageThreadId }, msg);
    return;
  }

  // Delete the tag from the database
  db.run(`DELETE FROM tags WHERE tag = ?`, [tagName], async function (err) {
    if (cache.changes === 0) {
        await sendDelMessage(chatId, `Тег '${tagName}' не найден или не был удален.`, { message_thread_id: messageThreadId }, msg);
    } else {
      cache.delete(tagName); // Remove the tag from the cache
      sendMessage(chatId, `Тег '${tagName}' был успешно удален.`, { message_thread_id: messageThreadId });
    }
  });
});

// List all tags
bot.onText(/\/alltags/, (msg) => {
  const chatId = msg.chat.id;
  let messageThreadId = msg.message_thread_id;
  if (!msg.is_topic_message) messageThreadId = null;

  db.all('SELECT tag FROM tags', [], (err, rows) => {
  if (err || rows.length === 0) {
    sendMessage(chatId, 'Нет доступных тегов.', { message_thread_id: messageThreadId });
  } else {
    const tagsList = rows.map(row => row.tag).join(', ');
    sendMessage(chatId, `Доступные теги: ${tagsList}`, { message_thread_id: messageThreadId });
  }
});
});

bot.onText(/!(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    let messageThreadId = msg.message_thread_id;
  if (!msg.is_topic_message) messageThreadId = null;
    const tagName = match[1];
  
    // If the tag is cached, return it directly
    if (cache.has(tagName)) return sendMessage(chatId, `${cache.get(tagName)}`, { message_thread_id: messageThreadId });
  
    // Retrieve the tag from the database
    db.get(`SELECT description FROM tags WHERE tag = ?`, [tagName], async (err, row) => {
      if (err, !row) {
          return;
      } else {
        cache.set(tagName, row.description); // Cache the tag for future use
        sendMessage(chatId, `${row.description}`, { message_thread_id: messageThreadId });
      }
    });
});

//mod
const ms = require("ms");
const getDate = require('./functions/getdate');
const { isBadLink } = require('./functions/automod');

async function AoU(msg) {
  const member = await bot.getChatMember(msg.chat.id, msg.from.id);

  let admin = false

  if (member.status === 'administrator') {
    return admin = true
  }
  return admin;
}

async function CoU(msg) {
  const member = await bot.getChatMember(msg.chat.id, msg.from.id);

  let creator = false

  if (member.status === 'creator') {
      return creator = true
  }
  return creator;
}

async function AoUQuery(query, msg) {
  const member = await bot.getChatMember(query.message.chat.id, query.from.id);

  let admin = false;

  if (member.status === 'administrator') {
    return admin = true
  }

  return admin;
}

async function CoUQuery(query, msg) {
  const member = await bot.getChatMember(query.message.chat.id, query.from.id);

  let creator = false;

  if (member.status === 'creator') {
    return creator = true
}

  return creator;
}

bot.on('message', async (msgq) => {
  if (!msgq.text) return;
  const msg = msgq;
  const me = await bot.getMe();
  if (msg.from.id === me.id) return;

  const {ban, mute} = require('./badDomenData.json');

  //automod
  const chatId = msg.chat.id;
  if (chatId > 0|| chatId === -4679624010) return;
  let messageThreadId = msg.message_thread_id;
  if (!msg.is_topic_message) messageThreadId = null;

  let msgtext = msg.text.split(/\s(.+)/);

  const date = getDate();

  let msgInfo = {
    badword: false,
    ban: 'нет',
    mute: 'нет',
    date
  }

  for (let i = 0; i <= msgtext.length; i++) { //если сообщение содержит хотя бы одно совпадение, то badword = true
    if (msg.text.includes(ban[i])) {
      if (i === 0|1) {
        if (!isBadLink(msg.text)) return;
      }
      
      msgInfo.badword = true, msgInfo.ban = 'да';
      break;
    }
    if (msg.text.includes(mute[i])) {

      msgInfo.badword = true, msgInfo.mute = 'да';
      break;
    }
  }
  if (!msgInfo.badword) return; // если badword = false, то отменить действие автомода

  //опции
  let permission = {
    can_send_messages: false,
    can_send_audios: false,
    can_send_documents: false,
    can_send_photos: false,
    can_send_videos: false,
    can_send_polls: false,
    can_send_other_messages: false,
  }

  const muteMsgOptions = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Размутить', callback_data: 'unmute' },
            { text: 'Забанить', callback_data: 'ban' }
          ],
          [
            { text: 'Забанить + удалить сообщения', callback_data: 'banwithdelete' }
          ]
        ]
      },
      message_thread_id: messageThreadId, disable_web_page_preview: true, parse_mode: 'Markdown'
  }

  if (await AoU(msg) || await CoU(msg)) return;

  await bot.restrictChatMember(chatId, msg.from.id, permission);
  await bot.deleteMessage(chatId, msg.message_id);
  
  await bot.sendMessage(botLogsGroupId, `Репорт от ${me.first_name}\nУчастник: [${msg.from.first_name}](tg://user?id=${msg.from.id})\nСодержание сообщения: ${msg.text}\n\nПодробнее о репорте: обнаружено нарушение?: ${msgInfo.badword}, бан?: ${msgInfo.ban}, мут?: ${msgInfo.mute}\nСообщение отправлено ${msgInfo.date}`, muteMsgOptions)
  .then(async(res) => {
    if (res) {
      bot.on('callback_query', async (query) => {
        const msg = msgq
        const chat_id = query.message.chat.id;
        const msgId = query.message.message_id;
        if (await AoUQuery(query, msg) || await CoUQuery(query, msg)) {
          let permission = {
            can_send_messages: true, 
            can_send_audios: true, 
            can_send_documents: true, 
            can_send_photos: true, 
            can_send_videos: true, 
            can_send_polls: true, 
            can_send_other_messages: true, 
          }
          const modChatMsg = {
            reply_markup: null,
            chat_id: chat_id, message_id: msgId, disable_web_page_preview: true, parse_mode: 'Markdown'
          }
          try {
            switch (query.data) {
              case 'unmute':
                await bot.restrictChatMember(chatId, msg.from.id, permission)
                await bot.editMessageText(`Репорт от ${me.first_name}\nУчастник: [${msg.from.first_name}](tg://user?id=${msg.from.id})\nСодержание сообщения: ${msg.text}\n\nУчастник больше не в муте. Выполнил действие ${query.from.first_name}`, modChatMsg)
                break;
              case 'ban':
                await bot.banChatMember(chatId, msg.from.id).then(async()=>{
                  await bot.editMessageText(`Репорт от ${me.first_name}\nУчастник: [${msg.from.first_name}](tg://user?id=${msg.from.id})\nСодержание сообщения: ${msg.text}\n\nУчастник забанен. Выполнил действие ${query.from.first_name}`, modChatMsg)
                });
                break;
              case 'banwithdelete':
                await bot.banChatMember(chatId, msg.from.id, { revoke_messages: true }).then(async()=>{
                  await bot.editMessageText(`Репорт от ${me.first_name}\nУчастник: [${msg.from.first_name}](tg://user?id=${msg.from.id})\nСодержание сообщения: ${msg.text}\n\nУчастник забанен, а все его сообщения удалены. Выполнил действие ${query.from.first_name}`, modChatMsg)
                });
                break;
            
              default:
                break;
            }
          } catch (e) {
            console.error(e);
          }
          
          return;
        }
      });
    }
  })
});

bot.onText(/\/ban/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (chatId > 0|| chatId === -4679624010) return;
  let messageThreadId = msg.message_thread_id;
  if (!msg.is_topic_message) messageThreadId = null;

  let user;
  
  if (match.length > 0 && msg.reply_to_message) {
      user = msg.reply_to_message.from;
  } else {
      await sendDelMessage(chatId, 'Пожалуйста, ответьте на сообщение пользователя.', { message_thread_id: messageThreadId }, msg);
      setTimeout(async () => {
          await safeDeleteMessage(msg.chat.id, msg.message_id);
      }, 3000);
      return;
  }
  if (user.id === 7547671621) return safeDeleteMessage(chatId, msg.message_id, {message_thread_id: messageThreadId});

  const member = await bot.getChatMember(chatId, user.id);
  const author = await bot.getChatMember(chatId, msg.from.id);

  if (author.status !== 'administrator' && author.status !== 'creator') {
    await safeDeleteMessage(chatId, msg.message_id);
    return;
  }

  if (member.status === 'administrator' || member.status === 'creator') {
    await safeDeleteMessage(chatId, msg.message_id);
    return;
  }

  const tagN = msg.text.replace("/ban ", "");
  let parts = tagN.split(/\s(.+)/);

  let banTo = 0;
  let time = parts[0];
  banTo = (ms(time, {long:true}) / 1000);

  let reason
  if (banTo === NaN) {
    reason = parts.join('');
    banTo = 0;
    console.log(reason)
  }
  parts=parts.filter(item => item !== parts[0]);
  reason = parts.join('');

  let userI
  if (user.username) {userI = `t.me/${user.username}`} else if (user.id) {userI = `tg://user?id=${user.id}`}
  if (banTo >= 31536000 || banTo <= 30000 || banTo === NaN | undefined | null) time = 'Навсегда';

  await bot.banChatMember(chatId, user.id, {until_date: banTo}).then(async res =>{
    if (res) {
      await bot.sendMessage(chatId, "["+user.first_name+`](${userI}) был забанен на ${time}\nПо причине: ${reason}`, {message_thread_id: messageThreadId, disable_web_page_preview: true, parse_mode: 'Markdown' });
    } else {
      await bot.sendMessage(chatId, 'Не удалось забанить пользователя. Возможно, он уже забанен или произошла иная ошибка', {message_thread_id: messageThreadId})
    }
  });
});

bot.onText(/\/unban/, async (msg) => {
  const chatId = msg.chat.id;
  if (chatId > 0|| chatId === -4679624010) return;

  let messageThreadId = msg.message_thread_id;
  if (!msg.is_topic_message) messageThreadId = null;

  let userId;

  const tagN = msg.text.replace("/unban ", "");
  let parts = tagN.split(/\s(.+)/);

  if (!parts[0]) {
    userId = parts[0];
  } else {
    if (msg.reply_to_message) userId = msg.reply_to_message.from.id;
  }
  if (!userId) return await sendDelMessage(chatId, 'Укажите ID пользователя или ответьте на его сообщение!', {message_thread_id: messageThreadId}, msg);
  if (userId === 7547671621) return await safeDeleteMessage(chatId, msg.message_id, {message_thread_id: messageThreadId});

  await bot.unbanChatMember(chatId, userId).then(async res => {
    await sendMessage(chatId, 'Пользователь был разбанен', { message_thread_id: messageThreadId }) //res = true/false в зависимости от ответа сервера
  })
});

bot.onText(/\/kick/, async (msg) => {
  const chatId = msg.chat.id;
  if (chatId > 0|| chatId === -4679624010) return;

  let messageThreadId = msg.message_thread_id;
  if (!msg.is_topic_message) messageThreadId = null;

  let userId;

  const tagN = msg.text.replace("/unban ", "");
  let parts = tagN.split(/\s(.+)/);

  if (!parts[0]) {
    userId = parts[0];
  } else {
    if (msg.reply_to_message) userId = msg.reply_to_message.from.id;
  }
  if (!userId) {
    await bot.deleteMessage(chatId, msg.message_id);
    return await sendDelMessage(chatId, 'Укажите ID пользователя или ответьте на его сообщение!', {message_thread_id: messageThreadId}, msg);
  }

  const member = await bot.getChatMember(chatId, userId);
  const author = await bot.getChatMember(chatId, msg.from.id);

  if (author.status !== 'administrator' && author.status !== 'creator') {
    await safeDeleteMessage(chatId, msg.message_id);
    return;
  }

  if (member.status === 'administrator' || member.status === 'creator') {
    await safeDeleteMessage(chatId, msg.message_id);
    return;
  }

  if (userId === 7547671621) return await safeDeleteMessage(chatId, msg.message_id);

  await bot.unbanChatMember(chatId, userId).then(async res => {
    await sendMessage(chatId, 'Пользователь был исключён', { message_thread_id: messageThreadId }) //res = true/false в зависимости от ответа сервера
  })
});

bot.on('polling_error', (error) => {
  console.log(error.code);  // => 'EFATAL'
});

// Cache cleanup (e.g., every 10 minutes)
setInterval(() => {
cache.clear();
console.log('Tags cache has been cleared.');
}, 10 * 60 * 1000); // Clear the cache every 10 minutes

module.exports = bot;

console.log(`event.js запущен!`);
