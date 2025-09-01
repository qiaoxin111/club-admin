import { Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

const { Dragger } = Upload;

export default function TeachersUpload({ onSuccess }) {
  const props = {
    name: 'file',
    multiple: false,
    action: '/api/upload-teachers',
    headers: { 'Accept': 'application/json' },
    onChange(info) {
      const { status } = info.file;
      if (status === 'done') {
        const response = info.file.response;
        message.success(`上传成功！导入了 ${response?.clubTeachersCount || 0} 个社团老师，${response?.classTeachersCount || 0} 个班主任`);
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
    <div style={{ width: 250, height: 130}}>
      <Dragger {...props}>
        <UploadOutlined />
        <p className="ant-upload-drag-icon"></p>
        <p>第二步：上传教师信息表</p>
        <p style={{ fontSize: '12px', color: '#666' }}>
          需包含两个sheet：
          <br />
          社团老师表-格式：社团 | 地点 | 教师 | 电话
          班主任表-格式：班级 | 教师 | 电话
        </p>
      </Dragger>
    </div>
  );
}