import { Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

const { Dragger } = Upload;

export default function AllStudentsUpload({ onSuccess }) {
  const props = {
    name: 'file',
    multiple: false,
    action: '/api/upload-all-students',
    headers: { 'Accept': 'application/json' },
    onChange(info) {
      const { status } = info.file;
      if (status === 'done') {
        message.success(`${info.file.name} 上传成功，导入了 ${info.file.response?.count || 0} 条学生记录`);
        if (onSuccess) {
          onSuccess();
        }
      } else if (status === 'error') {
        message.error(`${info.file.name} 上传失败`);
      }
    },
    beforeUpload(file) {
      const isXlsx = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const isXls = file.type === 'application/vnd.ms-excel';
      const isValidExcel = isXlsx || isXls;
      if (!isValidExcel) message.error('只能上传 .xlsx 或 .xls 文件');
      return isValidExcel;
    }
  };

  return (
    <div style={{ width: 200 }}>
      <Dragger {...props}>
        <UploadOutlined />
        <p className="ant-upload-drag-icon"></p>
        <p>上传所有学生数据表</p>
        <p style={{ fontSize: '12px', color: '#666' }}>
          格式：校区 | 学段 | 年级 | 班级 | 姓名
        </p>
      </Dragger>
    </div>
  );
}