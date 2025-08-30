import sqlite3 from 'sqlite3';
import path from 'path';

const dbFile = path.resolve('db.sqlite3');
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            seq INTEGER,
            class TEXT,
            name TEXT,
            club TEXT
          )`);
});

db.close();