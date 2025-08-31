import { Upload, Button, message, Input, Space } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useState } from 'react';

const { Dragger } = Upload;

export default function FileUpload({ onSuccess }) {
  const [clubName, setClubName] = useState('');

  const props = {
    name: 'file',
    multiple: false,
    action: '/api/upload',
    data: () => ({ clubName }),
    headers: { 'Accept': 'application/json' },
    onChange(info) {
      const { status } = info.file;
      if (status === 'done') {
        message.success(`${info.file.name} 上传成功`);
        setClubName(''); // 清空社团名称输入框
        onSuccess();
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
    <Space direction="vertical" style={{ width: 400 }}>
      <Input
        placeholder="请输入社团名称（如 健美操）"
        value={clubName}
        onChange={e => setClubName(e.target.value)}
      />
      <Dragger {...props} disabled={!clubName}>
        <UploadOutlined />
        <p className="ant-upload-drag-icon"></p>
        <p>点击或拖拽上传 Excel 文件（支持 .xlsx 和 .xls）</p>
      </Dragger>
    </Space>
  );
}