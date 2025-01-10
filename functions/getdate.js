function getDate() {
    const now = new Date();
    const year = now.getFullYear();
    let month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    month + 1;

    return `в ${hours}:${minutes}:${seconds} | ${day}.${month}.${year}`
}

module.exports = getDate