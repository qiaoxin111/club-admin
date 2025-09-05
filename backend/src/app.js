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
  
  if (rows.length === 0) {
    fs.unlinkSync(file.path);
    return res.json({ count: 0, duplicates: [] });
  }
  
  // 第一步：获取所有现有学生，移除他们在当前社团的记录
  db.all('SELECT class, name, club FROM students WHERE club LIKE ? OR club LIKE ? OR club LIKE ? OR club = ?', 
    [`%,${clubName},%`, `${clubName},%`, `%,${clubName}`, clubName], (err, existingStudents) => {
    if (err) {
      fs.unlinkSync(file.path);
      return res.status(500).send(err);
    }
    
    // 处理现有学生，移除当前社团
    let updateCount = 0;
    const totalUpdates = existingStudents.length;
    
    const processNewStudents = () => {
      // 第二步：处理新上传的学生
      let processedCount = 0;
      let addedCount = 0;
      const duplicates = [];
      
      rows.forEach((row, index) => {
        // 检查该学生是否已存在
        db.get('SELECT club FROM students WHERE class = ? AND name = ?', [row.class, row.name], (err, existingStudent) => {
          if (err) {
            fs.unlinkSync(file.path);
            return res.status(500).send(err);
          }
          
          if (existingStudent) {
            // 学生已存在，添加当前社团到其社团列表
            const existingClubs = existingStudent.club ? existingStudent.club.split(',').filter(c => c) : [];
            if (!existingClubs.includes(clubName)) {
              existingClubs.push(clubName);
              const newClubs = existingClubs.join(',');
              db.run('UPDATE students SET club = ? WHERE class = ? AND name = ?', 
                [newClubs, row.class, row.name], (err) => {
                  if (err) console.error('更新数据错误:', err);
                });
              addedCount++;
            }
          } else {
            // 学生不存在，插入新记录
            db.run('INSERT INTO students (seq, class, name, club) VALUES (?,?,?,?)', 
              [row.seq, row.class, row.name, clubName], (err) => {
                if (err) console.error('插入数据错误:', err);
              });
            addedCount++;
          }
          
          processedCount++;
          
          // 所有学生都处理完毕
          if (processedCount === rows.length) {
            fs.unlinkSync(file.path);
            res.json({ 
              count: addedCount,
              duplicates: duplicates 
            });
          }
        });
      });
    };
    
    if (totalUpdates === 0) {
      // 没有现有学生需要更新，直接处理新学生
      processNewStudents();
    } else {
      // 更新现有学生，移除当前社团
      existingStudents.forEach(student => {
        const clubs = student.club.split(',');
        const newClubs = clubs.filter(club => club !== clubName);
        const newClubsStr = newClubs.join(',');
        
        if (newClubsStr === '') {
          // 如果移除当前社团后没有其他社团，删除该学生记录
          db.run('DELETE FROM students WHERE class = ? AND name = ?', [student.class, student.name], (err) => {
            if (err) console.error('删除数据错误:', err);
            updateCount++;
            if (updateCount === totalUpdates) {
              processNewStudents();
            }
          });
        } else {
          // 更新学生的社团列表
          db.run('UPDATE students SET club = ? WHERE class = ? AND name = ?', 
            [newClubsStr, student.class, student.name], (err) => {
              if (err) console.error('更新数据错误:', err);
              updateCount++;
              if (updateCount === totalUpdates) {
                processNewStudents();
              }
            });
        }
      });
    }
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
  
  // 处理多社团信息的函数
  const processMultiClubInfo = (clubsStr) => {
    if (!clubsStr) return { clubs: '', teachers: '', phones: '', locations: '' };
    
    const clubs = clubsStr.split(',');
    const teachers = [];
    const phones = [];
    const locations = [];
    
    // 为每个社团查找对应的教师信息
    return new Promise((resolve) => {
      let processed = 0;
      clubs.forEach(club => {
        db.get('SELECT teacher, phone, location FROM club_teachers WHERE club = ?', [club], (err, teacher) => {
          if (teacher) {
            teachers.push(teacher.teacher);
            phones.push(teacher.phone);
            locations.push(teacher.location);
          } else {
            teachers.push('');
            phones.push('');
            locations.push('');
          }
          processed++;
          if (processed === clubs.length) {
            resolve({
              clubs: clubsStr,
              teachers: teachers.join(','),
              phones: phones.join(','),
              locations: locations.join(',')
            });
          }
        });
      });
    });
  };
  
  // 如果筛选条件包含班级（不管是否有其他条件），则从所有学生表查询
  if (cls) {
    let sql = `
      SELECT 
        COALESCE(s.class, a.normalized_class) as class,
        COALESCE(s.name, a.name) as name,
        s.club as club,
        clt.teacher as class_teacher,
        clt.phone as class_teacher_phone
      FROM all_students a
      LEFT JOIN students s ON a.normalized_class = s.class AND a.name = s.name
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
      sql += ' AND (s.club = ? OR s.club LIKE ? OR s.club LIKE ? OR s.club LIKE ?)';
      params.push(club, `${club},%`, `%,${club}`, `%,${club},%`);
    }
    
    sql += ` ORDER BY 
        CASE WHEN s.club IS NULL THEN 1 ELSE 0 END,
        s.club,
        a.name
    `;
    
    db.all(sql, params, async (err, rows) => {
      if (err) return res.status(500).send(err);
      
      const results = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const clubInfo = await processMultiClubInfo(r.club);
        results.push({ 
          seq: i + 1, 
          class: r.class, 
          name: r.name, 
          clubs: clubInfo.clubs,
          clubTeacher: clubInfo.teachers,
          clubTeacherPhone: clubInfo.phones,
          clubLocation: clubInfo.locations,
          classTeacher: r.class_teacher || '',
          classTeacherPhone: r.class_teacher_phone || ''
        });
      }
      res.json(results);
    });
  } else {
    // 没有班级筛选条件，只查询社团表
    let sql = `
      SELECT 
        s.class, s.name, s.club,
        clt.teacher as class_teacher,
        clt.phone as class_teacher_phone
      FROM students s
      LEFT JOIN class_teachers clt ON s.class = clt.class
      WHERE 1=1
    `;
    const params = [];
    if (club) { 
      sql += ' AND (s.club = ? OR s.club LIKE ? OR s.club LIKE ? OR s.club LIKE ?)';
      params.push(club, `${club},%`, `%,${club}`, `%,${club},%`);
    }
    if (name) { sql += ' AND s.name LIKE ?'; params.push(`%${name}%`); }
    sql += ' ORDER BY s.class, s.club, s.name';
    
    db.all(sql, params, async (err, rows) => {
      if (err) return res.status(500).send(err);
      
      const results = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const clubInfo = await processMultiClubInfo(r.club);
        results.push({ 
          seq: i + 1, 
          class: r.class, 
          name: r.name, 
          clubs: clubInfo.clubs,
          clubTeacher: clubInfo.teachers,
          clubTeacherPhone: clubInfo.phones,
          clubLocation: clubInfo.locations,
          classTeacher: r.class_teacher || '',
          classTeacherPhone: r.class_teacher_phone || ''
        });
      }
      res.json(results);
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
  } else if (field === 'club') {
    // 社团选项从已有学生数据的社团中获取（拆分组合社团名称）
    db.all(`SELECT DISTINCT club FROM students WHERE club IS NOT NULL`, (err, rows) => {
      if (err) return res.status(500).send(err);
      
      // 拆分组合的社团名称并去重
      const clubSet = new Set();
      rows.forEach(row => {
        if (row.club) {
          const clubs = row.club.split(',');
          clubs.forEach(club => {
            if (club.trim()) {
              clubSet.add(club.trim());
            }
          });
        }
      });
      
      // 转换为数组并排序
      const uniqueClubs = Array.from(clubSet).sort();
      res.json(uniqueClubs);
    });
  } else {
    // 其他字段从学生表获取
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
    const { class: cls, club, name } = req.query;
  
    // 如果筛选条件包含班级，则使用与页面显示相同的查询逻辑
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
      
      // 添加社团筛选条件（支持多社团匹配）
      if (club) {
        sql += ' AND (s.club = ? OR s.club LIKE ? OR s.club LIKE ? OR s.club LIKE ?)';
        params.push(club, `${club},%`, `%,${club}`, `%,${club},%`);
      }
      
      sql += ` ORDER BY 
          CASE WHEN s.club IS NULL THEN 1 ELSE 0 END,
          s.club,
          a.name
      `;
      
      db.all(sql, params, async (err, rows) => {
        if (err) return res.status(500).send(err);
    
        // 处理多社团信息并导出
        const processRow = async (r, idx) => {
          if (!r.club) {
            return {
              序号: idx + 1,
              班级: r.class,
              姓名: r.name,
              社团: '',
              地点: '',
              社团老师: '',
              社团老师电话: '',
              班主任: r.class_teacher || '',
              班主任电话: r.class_teacher_phone || ''
            };
          }
          
          const clubs = r.club.split(',');
          const teachers = [];
          const phones = [];
          const locations = [];
          
          for (const club of clubs) {
            const teacher = await new Promise((resolve) => {
              db.get('SELECT teacher, phone, location FROM club_teachers WHERE club = ?', [club], (err, result) => {
                resolve(result || { teacher: '', phone: '', location: '' });
              });
            });
            teachers.push(teacher.teacher);
            phones.push(teacher.phone);
            locations.push(teacher.location);
          }
          
          return {
            序号: idx + 1,
            班级: r.class,
            姓名: r.name,
            社团: r.club,
            地点: locations.join(','),
            社团老师: teachers.join(','),
            社团老师电话: phones.join(','),
            班主任: r.class_teacher || '',
            班主任电话: r.class_teacher_phone || ''
          };
        };
        
        const data = await Promise.all(rows.map(processRow));
        const ws = xlsx.utils.json_to_sheet(data);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, 'Students');
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename=students.xlsx');
        res.send(buf);
      });
    } else {
      // 没有班级筛选条件，只查询社团表（保持原有逻辑）
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
      if (club) { 
        sql += ' AND (s.club = ? OR s.club LIKE ? OR s.club LIKE ? OR s.club LIKE ?)';
        params.push(club, `${club},%`, `%,${club}`, `%,${club},%`);
      }
      if (name) { sql += ' AND s.name LIKE ?'; params.push(`%${name}%`); }
      sql += ' ORDER BY s.class, s.club, s.name';
      
      db.all(sql, params, async (err, rows) => {
        if (err) return res.status(500).send(err);
        
        // 处理多社团信息并导出
        const processRow = async (r, idx) => {
          if (!r.club) {
            return {
              序号: idx + 1,
              班级: r.class,
              姓名: r.name,
              社团: '',
              地点: '',
              社团老师: '',
              社团老师电话: '',
              班主任: r.class_teacher || '',
              班主任电话: r.class_teacher_phone || ''
            };
          }
          
          const clubs = r.club.split(',');
          const teachers = [];
          const phones = [];
          const locations = [];
          
          for (const club of clubs) {
            const teacher = await new Promise((resolve) => {
              db.get('SELECT teacher, phone, location FROM club_teachers WHERE club = ?', [club], (err, result) => {
                resolve(result || { teacher: '', phone: '', location: '' });
              });
            });
            teachers.push(teacher.teacher);
            phones.push(teacher.phone);
            locations.push(teacher.location);
          }
          
          return {
            序号: idx + 1,
            班级: r.class,
            姓名: r.name,
            社团: r.club,
            地点: locations.join(','),
            社团老师: teachers.join(','),
            社团老师电话: phones.join(','),
            班主任: r.class_teacher || '',
            班主任电话: r.class_teacher_phone || ''
          };
        };
        
        const data = await Promise.all(rows.map(processRow));
        const ws = xlsx.utils.json_to_sheet(data);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, 'Students');
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename=students.xlsx');
        res.send(buf);
      });
    }
  });

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listen on ${PORT}`));