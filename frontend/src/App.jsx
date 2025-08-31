import { useEffect, useState } from 'react';
import { Layout, Button, Space, message } from 'antd';
import axios from 'axios';
import FileUpload from './components/FileUpload';
import QueryBar from './components/QueryBar';
import StudentTable from './components/StudentTable';

const { Header, Content } = Layout;

function App() {
  const [data, setData] = useState([]);
  const [classes, setClasses] = useState([]);
  const [clubs, setClubs] = useState([]);

  const fetchData = async (params = {}) => {
    const res = await axios.get('/api/students', { params });
    setData(res.data);
  };

  const fetchMeta = async () => {
    const [cRes, clRes] = await Promise.all([
      axios.get('/api/distinct/class'),
      axios.get('/api/distinct/club')
    ]);
    setClasses(cRes.data);
    setClubs(clRes.data);
  };

  const handleExport = () => {
    const params = new URLSearchParams(window.location.search);
    console.log(6666, params.toString());
    // 直接复用 QueryBar 中已同步到 URL 的查询参数
    window.open(`/api/export?${params.toString()}`);
  };

  useEffect(() => { 
    // 页面初始化时从URL读取查询参数
    const params = new URLSearchParams(window.location.search);
    const initialQuery = {
      class: params.get('class') || undefined,
      club: params.get('club') || undefined,
      name: params.get('name') || undefined
    };
    fetchData(initialQuery); 
    fetchMeta(); 
  }, []);

  const handleClear = async () => {
    await axios.delete('/api/students');
    message.success('已清空');
    fetchData();
    fetchMeta();
  };

  const handleUploadSuccess = () => {
    // 上传成功后，保持当前的查询参数重新获取数据
    const params = new URLSearchParams(window.location.search);
    const currentQuery = {
      class: params.get('class') || undefined,
      club: params.get('club') || undefined,
      name: params.get('name') || undefined
    };
    setTimeout(() => {
      fetchData(currentQuery);
      fetchMeta();
    }, 200);
  };

  return (
    <Layout>
      <Header style={{ color: '#fff', fontSize: 20, height: '60px' }}>社团人员管理</Header>
      <Content style={{ padding: '24px 24px 6px', height: 'calc(100vh - 60px)' }}>
        <Space direction="vertical" size="large" style={{ width: '100%', display: 'flex', flexDirection: 'row',height: '148px' }}>
          <FileUpload onSuccess={handleUploadSuccess} />
          <QueryBar classes={classes} clubs={clubs} onQuery={fetchData} />
          <Space>
            <Button type="primary" onClick={handleExport}>导出 Excel</Button>
            <Button danger onClick={handleClear}>清除全部数据</Button>
          </Space>
          
        </Space>
        <StudentTable data={data} />
      </Content>
    </Layout>
  );
}

export default App;