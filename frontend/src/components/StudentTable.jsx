import { Table } from 'antd';
import styles from './StudentTable.module.css';

const columns = [
  { title: '序号', dataIndex: 'seq', width: 60 },
  { title: '班级', dataIndex: 'class', width: 80 },
  { title: '姓名', dataIndex: 'name', width: 80 },
  { title: '社团', dataIndex: 'clubs', width: 100 },
  { title: '地点', dataIndex: 'clubLocation', width: 100 },
  { title: '社团教师', dataIndex: 'clubTeacher', width: 80 },
  { title: '社团教师电话', dataIndex: 'clubTeacherPhone', width: 120 },
  { title: '班主任', dataIndex: 'classTeacher', width: 80 },
  { title: '班主任电话', dataIndex: 'classTeacherPhone', width: 120 },
];

export default function StudentTable({ data }) {
  return (
    <div className={styles.tableWrapper} style={{ height: 'calc(100vh - 60px - 140px - 32px - 30px)' }}>
      <Table
        style={{ height: '100%' }}
        rowKey={(r) => `${r.class}-${r.name}`}
        columns={columns}
        dataSource={data}
        pagination={{ 
          pageSize: 50,
          showTotal: (total, range) => `共 ${total} 条记录，显示第 ${range[0]}-${range[1]} 条`
        }}
        scroll={{ y: 'calc(100vh - 60px - 140px - 30px - 32px - 55px)' }}
      />
    </div>
  );
}