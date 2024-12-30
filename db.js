const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let dbPromise = null;

async function openDb() {
  if (!dbPromise) {
    dbPromise = open({
      filename: 'blacklist.db',
      driver: sqlite3.Database,
    });
  }
  return dbPromise;
}

async function insert() {
    try {
        await createTable();
    } catch (e) {
        await createTable();
    }
  }

//func db create
async function createTable() {
    const db = await openDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS blacklist
      (num INT DEFAULT 0,
        userid TEXT DEFAULT 'null',
        reason TEXT
      )`
    );
    
  const result = await db.get(`SELECT * FROM blacklist`);

  if (!result) {
    await db.run(`INSERT OR IGNORE INTO blacklist
        (num, userid)
        VALUES (:num, :userid)`, {
            ':num': 0,
            ':userid': 'null',
    });
  }
}

async function Createnum(num) {
    const db = await openDb();
    await db.run(`INSERT OR IGNORE INTO blacklist (num) VALUES (?)`, [num]);
  }

  async function updBlockUser(num, userid, reason, key, key1, key2) {
    const db = await openDb();
    await db.run(`UPDATE blacklist
        SET ${num} = ${key},
            ${userid} = "${key1}",
            ${reason} = "${key2}"
        WHERE ${num} = ${key}`)
  }

  async function fetchNum() {
    const db = await openDb();
    const [all, num] = await Promise.all([
      db.get(`SELECT * FROM blacklist`),
      db.all(`SELECT num FROM blacklist WHERE num IS NOT NULL AND num != ''`),
    ]);
    all.num = num.map(i => i.num);
    return all;
  }

  async function updUnblockingUser(id) {
    const db = await openDb();
    await db.run(`DELETE FROM blacklist WHERE userid = ${id}`);
  }

  async function fetchUserid(num) {
    const db = await openDb();
    const [all, userid] = await Promise.all([
      db.get(`SELECT * FROM blacklist WHERE num = ${num}`),
      db.all(`SELECT userid FROM blacklist WHERE num IS NOT NULL AND num = ${num}`),
    ]);
    all.userid = userid.map(i => i.userid);
    return all;
  }

  async function inblacklist(id) {
    const db = await openDb();
    const user = await db.get(
      `SELECT * FROM blacklist WHERE userid = ${id}`
    );
    return user !== undefined;
  }

module.exports = {
    insert,
    updUnblockingUser,
    fetchNum,
    updBlockUser,
    Createnum,
    fetchUserid,
    inblacklist
  };