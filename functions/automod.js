const { pojavgroup } = require('../config.json');

async function isBadLink(msg) {
    const text = msg.text;
    return text.includes(pojavgroup); //true - if "t.me/pojavlauncher_chat" else false
}

module.exports = {
    isBadLink
}