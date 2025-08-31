import { Table } from 'antd';
import styles from './StudentTable.module.css';

const columns = [
  { title: '序号', dataIndex: 'seq', width: 80 },
  { title: '班级', dataIndex: 'class' },
  { title: '姓名', dataIndex: 'name' },
  { title: '社团', dataIndex: 'clubs' },
];

export default function StudentTable({ data }) {
  return (
    <div className={styles.tableWrapper} style={{ height: 'calc(100vh - 60px - 148px - 32px - 30px)' }}>
      <Table
        style={{ height: '100%' }}
        rowKey={(r) => `${r.class}-${r.name}`}
        columns={columns}
        dataSource={data}
        pagination={{ pageSize: 50 }}
        scroll={{ y: 'calc(100vh - 60px - 148px - 30px - 32px - 55px)' }}
      />
    </div>
  );
}