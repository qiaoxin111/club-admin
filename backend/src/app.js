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

/* ---------- 解析社团 Excel（自动跳过前两行） ---------- */
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

/* ---------- 解析所有学生 Excel（跳过第一行标题） ---------- */
function parseAllStudentsExcel(filePath) {
    const wb = xlsx.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
  
    // 1. 把整个表先按二维数组读出来
    const raw = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
  
    // 2. 从第 2 行开始（索引 1）才是真正的数据
    const dataRows = raw.slice(1);
  
    // 3. 按列顺序映射并标准化班级格式
    return dataRows.map(r => {
      const grade = String(r[2] || ''); // 年级列
      const classNum = String(r[3] || ''); // 班级列
      const name = String(r[4] || ''); // 姓名列
      
      // 将 "1年级" "1班" 转换为 "1.1" 格式
      const gradeNum = grade.replace(/年级$/, '');
      const classNumOnly = classNum.replace(/班$/, '');
      const normalizedClass = `${gradeNum}.${classNumOnly}`;
      
      return {
        campus: String(r[0] || ''),
        stage: String(r[1] || ''),
        grade: grade,
        class: classNum,
        name: name,
        normalized_class: normalizedClass
      };
    }).filter(r => r.name && r.grade && r.class); // 防止空行和必要字段缺失
  }

/* ---------- 解析教师信息 Excel（包含两个sheet） ---------- */
function parseTeachersExcel(filePath) {
    const wb = xlsx.readFile(filePath);
    
    // 解析社团老师sheet
    const clubTeachersSheet = wb.Sheets['社团老师'];
    const clubTeachersRaw = xlsx.utils.sheet_to_json(clubTeachersSheet, { header: 1, defval: null });
    const clubTeachersData = clubTeachersRaw.slice(1).map(r => ({
      club: String(r[0] || ''),
      location: String(r[1] || ''),
      teacher: String(r[2] || ''),
      phone: String(r[3] || '')
    })).filter(r => r.club && r.teacher);
    
    // 解析班主任sheet
    const classTeachersSheet = wb.Sheets['班主任'];
    const classTeachersRaw = xlsx.utils.sheet_to_json(classTeachersSheet, { header: 1, defval: null });
    const classTeachersData = classTeachersRaw.slice(1).map(r => ({
      class: String(r[0] || ''),
      teacher: String(r[1] || ''),
      phone: String(r[2] || '')
    })).filter(r => r.class && r.teacher);
    
    return {
      clubTeachers: clubTeachersData,
      classTeachers: classTeachersData
    };
  }

/* -------- 上传社团数据 -------- */
app.post('/api/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).send('文件缺失');
  const clubName = req.body.clubName || '未知社团';
  const rows = parseExcel(file.path, clubName);
  
  // 先删除该社团的旧数据
  db.run('DELETE FROM students WHERE club = ?', [clubName], (err) => {
    if (err) {
      fs.unlinkSync(file.path);
      return res.status(500).send(err);
    }
    
    // 检查重复学生（在其他社团中）
    const duplicates = [];
    let processedCount = 0;
    
    if (rows.length === 0) {
      fs.unlinkSync(file.path);
      return res.json({ count: 0, duplicates: [] });
    }
    
    rows.forEach((row, index) => {
      // 检查该学生是否已在其他社团中
      db.get('SELECT club FROM students WHERE class = ? AND name = ?', [row.class, row.name], (err, existingStudent) => {
        if (err) {
          fs.unlinkSync(file.path);
          return res.status(500).send(err);
        }
        
        if (existingStudent) {
          // 学生已在其他社团中，记录重复信息
          duplicates.push({
            name: row.name,
            class: row.class,
            existingClub: existingStudent.club,
            newClub: clubName
          });
        } else {
          // 学生不在其他社团中，可以插入
          db.run('INSERT INTO students (seq, class, name, club) VALUES (?,?,?,?)', 
            [row.seq, row.class, row.name, row.club], (err) => {
              if (err) console.error('插入数据错误:', err);
            });
        }
        
        processedCount++;
        
        // 所有学生都处理完毕
        if (processedCount === rows.length) {
          fs.unlinkSync(file.path);
          res.json({ 
            count: rows.length - duplicates.length,
            duplicates: duplicates 
          });
        }
      });
    });
  });
});

/* -------- 上传所有学生数据 -------- */
app.post('/api/upload-all-students', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).send('文件缺失');
  
  const rows = parseAllStudentsExcel(file.path);
  
  // 先清空原有数据
  db.run('DELETE FROM all_students', (err) => {
    if (err) {
      fs.unlinkSync(file.path);
      return res.status(500).send(err);
    }
    
    // 插入新数据
    const stmt = db.prepare('INSERT INTO all_students (campus, stage, grade, class, name, normalized_class) VALUES (?,?,?,?,?,?)');
    rows.forEach(r => stmt.run(r.campus, r.stage, r.grade, r.class, r.name, r.normalized_class));
    stmt.finalize();
    fs.unlinkSync(file.path);
    res.json({ count: rows.length });
  });
});

/* -------- 上传教师信息数据 -------- */
app.post('/api/upload-teachers', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).send('文件缺失');
  
  try {
    const { clubTeachers, classTeachers } = parseTeachersExcel(file.path);
    
    db.serialize(() => {
      // 清空原有数据
      db.run('DELETE FROM club_teachers');
      db.run('DELETE FROM class_teachers');
      
      // 插入社团老师数据
      const clubStmt = db.prepare('INSERT INTO club_teachers (club, location, teacher, phone) VALUES (?,?,?,?)');
      clubTeachers.forEach(r => clubStmt.run(r.club, r.location, r.teacher, r.phone));
      clubStmt.finalize();
      
      // 插入班主任数据
      const classStmt = db.prepare('INSERT INTO class_teachers (class, teacher, phone) VALUES (?,?,?)');
      classTeachers.forEach(r => classStmt.run(r.class, r.teacher, r.phone));
      classStmt.finalize();
      
      fs.unlinkSync(file.path);
      res.json({ 
        clubTeachersCount: clubTeachers.length,
        classTeachersCount: classTeachers.length 
      });
    });
  } catch (error) {
    fs.unlinkSync(file.path);
    res.status(500).send('Excel文件格式错误或缺少必要的sheet');
  }
});

/* -------- 查询（含多条件） -------- */
app.get('/api/students', (req, res) => {
  const { class: cls, club, name } = req.query;
  
  // 如果筛选条件包含班级（不管是否有其他条件），则从所有学生表查询
  if (cls) {
    let sql = `
      SELECT 
        COALESCE(s.class, a.normalized_class) as class,
        COALESCE(s.name, a.name) as name,
        s.club as club,
        ct.teacher as club_teacher,
        ct.phone as club_teacher_phone,
        ct.location as club_location,
        clt.teacher as class_teacher,
        clt.phone as class_teacher_phone
      FROM all_students a
      LEFT JOIN students s ON a.normalized_class = s.class AND a.name = s.name
      LEFT JOIN club_teachers ct ON s.club = ct.club
      LEFT JOIN class_teachers clt ON a.normalized_class = clt.class
      WHERE a.normalized_class = ?
    `;
    const params = [cls];
    
    // 添加姓名筛选条件
    if (name) {
      sql += ' AND a.name LIKE ?';
      params.push(`%${name}%`);
    }
    
    // 添加社团筛选条件
    if (club) {
      sql += ' AND s.club = ?';
      params.push(club);
    }
    
    sql += ` ORDER BY 
        CASE WHEN s.club IS NULL THEN 1 ELSE 0 END,
        s.club,
        a.name
    `;
    
    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).send(err);
      res.json(rows.map((r, i) => ({ 
        seq: i + 1, 
        class: r.class, 
        name: r.name, 
        clubs: r.club || '',
        clubTeacher: r.club_teacher || '',
        clubTeacherPhone: r.club_teacher_phone || '',
        clubLocation: r.club_location || '',
        classTeacher: r.class_teacher || '',
        classTeacherPhone: r.class_teacher_phone || ''
      })));
    });
  } else {
    // 没有班级筛选条件，只查询社团表
    let sql = `
      SELECT 
        s.class, s.name, s.club,
        ct.teacher as club_teacher,
        ct.phone as club_teacher_phone,
        ct.location as club_location,
        clt.teacher as class_teacher,
        clt.phone as class_teacher_phone
      FROM students s
      LEFT JOIN club_teachers ct ON s.club = ct.club
      LEFT JOIN class_teachers clt ON s.class = clt.class
      WHERE 1=1
    `;
    const params = [];
    if (club) { sql += ' AND s.club=?';  params.push(club); }
    if (name) { sql += ' AND s.name LIKE ?'; params.push(`%${name}%`); }
    sql += ' ORDER BY s.class, s.club, s.name';
    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).send(err);
      res.json(rows.map((r, i) => ({ 
        seq: i + 1, 
        class: r.class, 
        name: r.name, 
        clubs: r.club,
        clubTeacher: r.club_teacher || '',
        clubTeacherPhone: r.club_teacher_phone || '',
        clubLocation: r.club_location || '',
        classTeacher: r.class_teacher || '',
        classTeacherPhone: r.class_teacher_phone || ''
      })));
    });
  }
});

/* -------- 去重下拉框选项 -------- */
app.get('/api/distinct/:field', (req, res) => {
  const field = req.params.field; // class 或 club
  
  if (field === 'class') {
    // 班级选项从所有学生表获取
    db.all(`SELECT DISTINCT normalized_class AS val FROM all_students ORDER BY val`, (err, rows) => {
      if (err) return res.status(500).send(err);
      res.json(rows.map(r => r.val));
    });
  } else {
    // 社团选项仍从社团表获取
    db.all(`SELECT DISTINCT ${field} AS val FROM students ORDER BY val`, (err, rows) => {
      if (err) return res.status(500).send(err);
      res.json(rows.map(r => r.val));
    });
  }
});

/* -------- 获取所有社团教师列表 -------- */
app.get('/api/club-teachers', (req, res) => {
  db.all('SELECT club, teacher, location, phone FROM club_teachers ORDER BY club', (err, rows) => {
    if (err) return res.status(500).send(err);
    res.json(rows);
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