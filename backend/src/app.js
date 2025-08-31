import express from 'express';
import cors from 'cors';
import multer from 'multer';
import xlsx from 'xlsx';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import './init-db.js';               // 初始化表

const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(cors());
app.use(express.json());

const dbFile = path.resolve('db.sqlite3');
const db = new sqlite3.Database(dbFile);

/* ---------- 解析 Excel（自动跳过前两行） ---------- */
function parseExcel(filePath, clubName) {
    const wb = xlsx.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
  
    // 1. 把整个表先按二维数组读出来
    const raw = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
  
    // 2. 从第 3 行开始（索引 2）才是真正的数据
    const dataRows = raw.slice(2);
  
    // 3. 按列顺序映射
    return dataRows.map(r => ({
      seq:  r[0],
      class: String(r[1]),
      name:  r[2],
      club:  clubName
    })).filter(r => r.name);   // 防止空行
  }

/* -------- 上传 -------- */
app.post('/api/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).send('文件缺失');
  const clubName = req.body.clubName || '未知社团';
  const rows = parseExcel(file.path, clubName);
  const stmt = db.prepare('INSERT INTO students (seq, class, name, club) VALUES (?,?,?,?)');
  rows.forEach(r => stmt.run(r.seq, r.class, r.name, r.club));
  stmt.finalize();
  fs.unlinkSync(file.path);
  res.json({ count: rows.length });
});

/* -------- 查询（含多条件） -------- */
app.get('/api/students', (req, res) => {
  const { class: cls, club, name } = req.query;
  let sql = `SELECT class, name, club
             FROM students WHERE 1=1`;
  const params = [];
  if (cls)  { sql += ' AND class=?'; params.push(cls); }
  if (club) { sql += ' AND club=?';  params.push(club); }
  if (name) { sql += ' AND name LIKE ?'; params.push(`%${name}%`); }
  sql += ' ORDER BY class, club, name';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).send(err);
    res.json(rows.map((r, i) => ({ seq: i + 1, class: r.class, name: r.name, clubs: r.club })));
  });
});

/* -------- 去重下拉框选项 -------- */
app.get('/api/distinct/:field', (req, res) => {
  const field = req.params.field; // class 或 club
  db.all(`SELECT DISTINCT ${field} AS val FROM students ORDER BY val`, (err, rows) => {
    if (err) return res.status(500).send(err);
    res.json(rows.map(r => r.val));
  });
});

/* -------- 清空 -------- */
app.delete('/api/students', (_, res) => {
  db.run('DELETE FROM students', err => {
    if (err) return res.status(500).send(err);
    res.sendStatus(204);
  });
});

/* -------- 数据去重（保留最新的社团记录） -------- */
app.post('/api/students/deduplicate', (_, res) => {
  db.serialize(() => {
    // 删除重复记录，只保留每个学生最新的社团记录
    db.run(`DELETE FROM students 
            WHERE id NOT IN (
              SELECT MAX(id) 
              FROM students 
              GROUP BY class, name
            )`, (err) => {
      if (err) return res.status(500).send(err);
      res.json({ message: '数据去重完成' });
    });
  });
});

/* -------- 导出 -------- */
/* ------------ 按当前条件导出 ------------ */
app.get('/api/export', (req, res) => {
    console.log(1111, req.query);
    const { class: cls, club, name } = req.query;
  
    let sql = `SELECT class, name, club
               FROM students WHERE 1=1`;
    const params = [];
    if (cls)  { sql += ' AND class=?'; params.push(cls); }
    if (club) { sql += ' AND club=?';  params.push(club); }
    if (name) { sql += ' AND name LIKE ?'; params.push(`%${name}%`); }
    sql += ' ORDER BY class, club, name';
  
    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).send(err);
  
      // 再补一个前端需要的序号
      const data = rows.map((r, idx) => ({
        序号: idx + 1,
        班级: r.class,
        姓名: r.name,
        社团: r.club
      }));
  
      const ws = xlsx.utils.json_to_sheet(data);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Students');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', 'attachment; filename=students.xlsx');
      res.send(buf);
    });
  });

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listen on ${PORT}`));