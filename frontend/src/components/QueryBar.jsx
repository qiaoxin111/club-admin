import { Select, Input, Button, Space } from 'antd';
import { useState, useEffect } from 'react';
const { Option } = Select;

export default function QueryBar({ classes, clubs, onQuery }) {
  /* ------------- 从 URL 读并同步到 state ------------- */
  const readQuery = () => {
    const p = new URLSearchParams(window.location.search);
    return {
      cls:  p.get('class') || undefined,
      club: p.get('club')  || undefined,
      name: p.get('name')  || ''
    };
  };

  const [cls,  setCls]  = useState(readQuery().cls);
  const [club, setClub] = useState(readQuery().club);
  const [name, setName] = useState(readQuery().name);

  /* ------------- 地址栏变化时自动同步 ------------- */
  useEffect(() => {
    const handlePop = () => {
      const q = readQuery();
      setCls(q.cls);
      setClub(q.club);
      setName(q.name);
      onQuery({ class: q.cls, club: q.club, name: q.name });
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [onQuery]);

  /* ------------- 更新地址栏并触发查询 ------------- */
  const updateUrlAndQuery = (newClass, newClub, newName) => {
    const params = new URLSearchParams();
    if (newClass) params.set('class', newClass);
    if (newClub)  params.set('club',  newClub);
    if (newName)  params.set('name',  newName);

    const url = `${window.location.pathname}?${params}`;
    window.history.replaceState(null, '', url);   // 不刷新页面
    onQuery({ class: newClass, club: newClub, name: newName });
  };

  /* ------------- 查询按钮 ------------- */
  const handleSearch = () => updateUrlAndQuery(cls, club, name);

  return (
    <Space>
      <Select
        placeholder="班级"
        allowClear
        style={{ width: 120 }}
        value={cls}
        onChange={v => {
          setCls(v);
          updateUrlAndQuery(v, club, name);
        }}
      >
        {classes.map(c => <Option key={c} value={c}>{c}</Option>)}
      </Select>

      <Select
        placeholder="社团"
        allowClear
        style={{ width: 120 }}
        value={club}
        onChange={v => {
          setClub(v);
          updateUrlAndQuery(cls, v, name);
        }}
      >
        {clubs.map(c => <Option key={c} value={c}>{c}</Option>)}
      </Select>

      <Input
        placeholder="姓名模糊搜索"
        value={name}
        onChange={e => {
          setName(e.target.value);
          updateUrlAndQuery(cls, club, e.target.value);
        }}
        style={{ width: 140 }}
        onPressEnter={handleSearch}
      />
      <Button type="primary" onClick={handleSearch}>查询</Button>
    </Space>
  );
}