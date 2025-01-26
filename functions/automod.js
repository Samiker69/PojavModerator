const { pojavgroup } = require('../config.json');

function isBadLink(text) {
    // Регулярное выражение для поиска t.me/ и извлечения части после него
    const regex = /(?:https?:\/\/)?(?:www\.)?t\.me\/([^\/\s]+)/i;

    // Проверяем, есть ли совпадение
    const match = text.match(regex);

    if (match) {
        // Извлекаем часть после t.me/
        const linkPart = match[1].toLowerCase();

        // Проверяем, равна ли она 'pojavlauncher'
        if (linkPart === pojavgroup) {
            return false;
        } else {
            return true;
        }
    } else {
        return false;
    }
}

module.exports = {
    isBadLink
}
