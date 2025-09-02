import { Upload, Button, message, Input, Space, notification, AutoComplete, Alert } from 'antd';
import { UploadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useState, useEffect } from 'react';

const { Dragger } = Upload;

export default function FileUpload({ onSuccess, clubs = [] }) {
  const [clubName, setClubName] = useState('');
  const [clubTeachers, setClubTeachers] = useState([]);
  
  // 从props获取社团选项
  const clubOptions = clubs.map(club => ({ value: club, label: club }));
  const [isValidClub, setIsValidClub] = useState(true);

  // 获取社团教师列表
  useEffect(() => {
    const fetchClubTeachers = async () => {
      try {
        const res = await axios.get('/api/club-teachers');
        setClubTeachers(res.data);
      } catch (error) {
        console.error('获取社团教师列表失败:', error);
      }
    };
    fetchClubTeachers();
  }, [clubs]); // 当clubs变化时重新获取教师信息

  // 检查社团名称是否有效
  const handleClubNameChange = (value) => {
    setClubName(value);
    const isValid = clubTeachers.some(teacher => teacher.club === value) || value === '';
    setIsValidClub(isValid);
  };

  // 获取自动完成选项
  const getAutoCompleteOptions = () => {
    return clubTeachers.map(teacher => ({
      value: teacher.club,
      label: (
        <div>
          <div style={{ fontWeight: 'bold' }}>{teacher.club}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {teacher.teacher} | {teacher.location} | {teacher.phone}
          </div>
        </div>
      )
    }));
  };

  const props = {
    name: 'file',
    multiple: false,
    action: '/api/upload',
    data: () => ({ clubName }),
    headers: { 'Accept': 'application/json' },
    onChange(info) {
      const { status } = info.file;
      if (status === 'done') {
        const response = info.file.response;
        if (response && response.duplicates && response.duplicates.length > 0) {
          // 有重复学生的情况，使用notification显示更持久的提示
          const duplicateList = response.duplicates.map(dup => 
            `• ${dup.class} ${dup.name} 已在 ${dup.existingClub} 中`
          ).join('\n');
          
          notification.warning({
            message: '发现重复学生',
            description: (
              <div>
                <p>{info.file.name} 上传成功，但发现 {response.duplicates.length} 个学生已在其他社团中：</p>
                <pre style={{ fontSize: '12px', margin: '8px 0', whiteSpace: 'pre-wrap' }}>
                  {duplicateList}
                </pre>
                <p style={{ color: '#666', fontSize: '12px' }}>这些学生已被跳过，未加入 {response.duplicates[0]?.newClub}</p>
              </div>
            ),
            duration: 0, // 设置为0表示不自动关闭，需要用户手动关闭
            placement: 'topRight',
            style: { width: 400 }
          });
          
          // 同时显示简短的成功消息
          message.success(`${info.file.name} 上传完成`);
        } else {
          message.success(`${info.file.name} 上传成功`);
        }
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
    <Space direction="vertical" style={{ width: 220 }}>
      <AutoComplete
        placeholder="第三步：输入或选择社团名称"
        value={clubName}
        onChange={handleClubNameChange}
        options={getAutoCompleteOptions()}
        filterOption={(inputValue, option) =>
          option.value.toLowerCase().includes(inputValue.toLowerCase())
        }
        style={{ width: '100%' }}
        status={!isValidClub ? 'error' : ''}
      />
      
      {!isValidClub && clubName && (
        <Alert
          message="社团名称不匹配"
          description={
            <div>
              <p>输入的社团名称在教师信息表中不存在，导入后将无法显示社团老师信息。</p>
              <p style={{ margin: '4px 0', fontSize: '12px' }}>
                <InfoCircleOutlined /> 建议从下拉列表中选择已有社团，或先上传包含该社团的教师信息表。
              </p>
            </div>
          }
          type="warning"
          showIcon
          style={{ fontSize: '12px' }}
        />
      )}
      <div style={{ width: 220, height: 88}}>
        <Dragger {...props} disabled={!clubName}>
          <UploadOutlined />
          <p className="ant-upload-drag-icon"></p>
          <p style={{ fontSize: '12px' }}>
            第四步： 上传社团学生表
            <br/>
            格式：序列 | 班级 | 姓名
          </p>
          
        </Dragger>
      </div>
    </Space>
  );
}