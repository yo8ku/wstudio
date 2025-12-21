/**
 * DailyNoteView.tsx
 * 每日笔记视图组件
 * 功能：显示当天笔记状态、日历选择器、打开/创建今日笔记
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNoteStore } from '../../../../stores/noteStore';
import { Icon } from '../../../Icons';
import './ViewStyles.scss';

/**
 * 格式化日期为 YYYY-MM-DD
 */
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * 获取月份的天数
 */
const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month + 1, 0).getDate();
};

/**
 * 获取月份第一天是星期几
 */
const getFirstDayOfMonth = (year: number, month: number): number => {
  return new Date(year, month, 1).getDay();
};

export const DailyNoteView: React.FC = () => {
  const { getDailyNote, createDailyNote, setCurrentNote, currentNote } = useNoteStore();
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [todayNote, setTodayNote] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);

  const today = formatDate(new Date());
  const selectedDateStr = formatDate(selectedDate);

  // 检查今日笔记是否存在
  const checkTodayNote = useCallback(async () => {
    const note = await getDailyNote(today);
    setTodayNote(!!note);
  }, [getDailyNote, today]);

  useEffect(() => {
    checkTodayNote();
  }, [checkTodayNote]);

  // 打开或创建每日笔记
  const handleOpenDailyNote = async (date: string) => {
    setIsLoading(true);
    try {
      let note = await getDailyNote(date);
      if (!note) {
        note = await createDailyNote(date);
      }
      if (note) {
        setCurrentNote(note);
      }
      if (date === today) {
        setTodayNote(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 切换月份
  const changeMonth = (delta: number) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + delta);
    setCurrentMonth(newMonth);
  };

  // 渲染日历
  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const weeks: React.ReactNode[] = [];
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    
    // 星期标题
    weeks.push(
      <div key="header" className="calendar-header">
        {weekDays.map(day => (
          <div key={day} className="calendar-weekday">{day}</div>
        ))}
      </div>
    );

    // 日期格子
    const days: React.ReactNode[] = [];
    
    // 填充月初空白
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty" />);
    }

    // 填充日期
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDate(new Date(year, month, day));
      const isToday = dateStr === today;
      const isSelected = dateStr === selectedDateStr;
      const isCurrent = currentNote?.title === dateStr;

      days.push(
        <div
          key={day}
          className={`calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
          onClick={() => setSelectedDate(new Date(year, month, day))}
          onDoubleClick={() => handleOpenDailyNote(dateStr)}
        >
          {day}
        </div>
      );
    }

    weeks.push(
      <div key="days" className="calendar-days">
        {days}
      </div>
    );

    return weeks;
  };

  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                      '七月', '八月', '九月', '十月', '十一月', '十二月'];

  return (
    <div className="daily-note-view">
      {/* 今日笔记快捷操作 */}
      <div className="daily-note-today">
        <div className="today-status">
          <Icon name="daily-note" size={20} />
          <span className="today-label">今日笔记</span>
          <span className={`today-indicator ${todayNote ? 'exists' : ''}`}>
            {todayNote ? '已创建' : '未创建'}
          </span>
        </div>
        <div
          className="today-action"
          onClick={() => handleOpenDailyNote(today)}
          role="button"
          tabIndex={0}
        >
          {isLoading ? '加载中...' : (todayNote ? '打开' : '创建')}
        </div>
      </div>

      {/* 日历选择器 */}
      <div className="daily-note-calendar">
        <div className="calendar-nav">
          <div
            className="nav-btn"
            onClick={() => changeMonth(-1)}
            role="button"
            tabIndex={0}
          >
            <Icon name="chevron-left" size={16} />
          </div>
          <span className="nav-title">
            {currentMonth.getFullYear()}年 {monthNames[currentMonth.getMonth()]}
          </span>
          <div
            className="nav-btn"
            onClick={() => changeMonth(1)}
            role="button"
            tabIndex={0}
          >
            <Icon name="chevron-right" size={16} />
          </div>
        </div>
        {renderCalendar()}
      </div>

      {/* 选中日期操作 */}
      {selectedDateStr !== today && (
        <div className="daily-note-selected">
          <span className="selected-date">{selectedDateStr}</span>
          <div
            className="selected-action"
            onClick={() => handleOpenDailyNote(selectedDateStr)}
            role="button"
            tabIndex={0}
          >
            打开笔记
          </div>
        </div>
      )}
    </div>
  );
};
