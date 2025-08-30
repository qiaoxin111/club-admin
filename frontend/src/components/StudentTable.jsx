import { Table } from 'antd';

const columns = [
  { title: '序号', dataIndex: 'seq', width: 80 },
  { title: '班级', dataIndex: 'class' },
  { title: '姓名', dataIndex: 'name' },
  { title: '社团', dataIndex: 'clubs' },
];

export default function StudentTable({ data }) {
  return (
    <Table
    style={{ height: 'calc(100% - 148px)'}}
      rowKey={(r) => `${r.class}-${r.name}`}
      columns={columns}
      dataSource={data}
      pagination={{ pageSize: 50 }}
      scroll={{ y: 500 }}
    />
  );
}