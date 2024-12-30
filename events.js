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
            safeDeleteMessage(chatId, msg.message_id)
                .catch(err => {
                    console.error('Ошибка при удалении сообщения:', err);
                });
        }
    }
});

bot.on('message', async (msg) => {
    const topicId = msg.message_thread_id || 0;
    const delmsginchannel = supportChannel;
    const userId = msg.from.id;

    if (topicId == delmsginchannel) {
        const buser = await inblacklist(userId);
        //buser = true || false
        if (buser) {
            safeDeleteMessage(msg.chat.id, msg.message_id, { message_thread_id: topicId })
                .catch(err => console.log('Не удалось удалить сообщение:', err));
        }
    }
});

//from VinTeRuS
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

// Function to send messages to the chat or thread
function sendMessage(chatId, text, options = {}) {
  const messageOptions = options.message_thread_id ? { message_thread_id: options.message_thread_id } : {};
  bot.sendMessage(chatId, text, messageOptions);
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
            console.log(`Message to delete not found: Chat ID ${chatId}, Message ID ${messageId}`);
        } else {
            console.error('Unexpected error while deleting message:', error);
        }
    }
};

async function sendDelMessage(chatId, text, options = {}, msg) {
    const messageThreadId = msg.message_thread_id;
    const messageOptions = options.message_thread_id ? { message_thread_id: options.message_thread_id } : {};
    const del = await bot.sendMessage(chatId, text, messageOptions);

    setTimeout(async () => {
        await safeDeleteMessage(del.chat.id, del.message_id, { message_thread_id: messageThreadId });
    }, 3000);
}

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

bot.onText(/\/addtag (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageThreadId = msg.message_thread_id;
  const [tagName, ...descriptionArr] = match[1].split(' ');
  const tagDescription = descriptionArr.join(' ');

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
  const messageThreadId = msg.message_thread_id;
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
  const messageThreadId = msg.message_thread_id;

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
    const messageThreadId = msg.message_thread_id;
    const tagName = match[1];
  
    // If the tag is cached, return it directly
    if (cache.has(tagName)) return sendMessage(chatId, `${cache.get(tagName)}`, { message_thread_id: messageThreadId });
  
    // Retrieve the tag from the database
    db.get(`SELECT description FROM tags WHERE tag = ?`, [tagName], async (err, row) => {
      if (err, !row) {
          await sendDelMessage(chatId, `Тег '${tagName}' не найден.`, { message_thread_id: messageThreadId }, msg);
      } else {
        cache.set(tagName, row.description); // Cache the tag for future use
        sendMessage(chatId, `${row.description}`, { message_thread_id: messageThreadId });
      }
    });
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
