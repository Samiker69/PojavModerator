const fs = require('fs');

const readD = () => JSON.parse(fs.readFileSync('./disallowedToReport.json', 'utf8'));
const saveD = (data) => {
    const datas = readD();
    datas.push(data);
    fs.writeFileSync('./disallowedToReport.json', JSON.stringify(datas, null, 2));
};

module.exports = {
    saveD,
    readD
}