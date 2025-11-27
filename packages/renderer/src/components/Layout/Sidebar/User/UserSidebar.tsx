/**
 * 用户侧边栏视图
 * 功能：提供登录与用户信息展示界面
 */

import React, { useState } from 'react';
import { Input } from '../../../ui/input';
import { Icon } from '../../../Icons';
import { useUserStore } from '../../../../stores/userStore';
import './UserSidebar.scss';

interface LoginFormState {
  contact: string;
  password: string;
}

const DEFAULT_ACCOUNT = 'admin';
const DEFAULT_PASSWORD = '123456';
const DEFAULT_NICKNAME = '管理员';
const DEFAULT_MEMBERSHIP_EXPIRY = '5099/01/01';
const DEFAULT_MEMBERSHIP_START = '2020/01/01';
const DEFAULT_REGISTER_TIME = '2020/01/01';
const DEFAULT_IP_ADDRESS = '127.0.0.1';
const DEFAULT_LOCATION = '重庆';

const initialFormState: LoginFormState = {
  contact: DEFAULT_ACCOUNT,
  password: DEFAULT_PASSWORD,
};

export function UserSidebar(): JSX.Element {
  const { isLoggedIn, profile, agreeToPolicy, setAgreeToPolicy, login, logout } = useUserStore();
  const [form, setForm] = useState<LoginFormState>(initialFormState);
  const [errors, setErrors] = useState<{ contact?: string; password?: string; policy?: string }>({});

  const handleChange = (field: keyof LoginFormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): boolean => {
    const nextErrors: { contact?: string; password?: string; policy?: string } = {};

    if (!form.contact.trim()) {
      nextErrors.contact = '请输入手机号或邮箱';
    }

    const passwordLength = form.password.trim().length;
    if (passwordLength < 6 || passwordLength > 12) {
      nextErrors.password = '密码长度需为 6-12 位';
    }

    if (!agreeToPolicy) {
      nextErrors.policy = '请先阅读并勾选协议';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleLogin = () => {
    if (!validate()) {
      return;
    }

    if (form.contact !== DEFAULT_ACCOUNT || form.password !== DEFAULT_PASSWORD) {
      setErrors((prev) => ({
        ...prev,
        contact: '账号或密码错误',
        password: '账号或密码错误',
      }));
      return;
    }

    login({
      nickname: DEFAULT_NICKNAME,
      avatar: '/avtar.jpg',
      membership: 'member',
      contact: form.contact,
      membershipExpiry: DEFAULT_MEMBERSHIP_EXPIRY,
      membershipStart: DEFAULT_MEMBERSHIP_START,
      registerTime: DEFAULT_REGISTER_TIME,
      ipAddress: DEFAULT_IP_ADDRESS,
      location: DEFAULT_LOCATION,
    });
  };

  const handleLogout = () => {
    logout();
    setForm(initialFormState);
    setErrors({});
  };

  const renderLoginForm = () => (
    <div className="user-sidebar-card">
      <h2 className="user-sidebar-title">账号登录</h2>
      <div className="user-sidebar-field">
        <label className="user-sidebar-label">用户名（手机号 / 邮箱）</label>
        <Input
          value={form.contact}
          onChange={handleChange('contact')}
          placeholder="请输入手机号或邮箱"
          className="user-sidebar-input"
        />
        {errors.contact && <p className="user-sidebar-error">{errors.contact}</p>}
      </div>

      <div className="user-sidebar-field">
        <label className="user-sidebar-label">密码</label>
        <Input
          type="password"
          value={form.password}
          onChange={handleChange('password')}
          placeholder="请输入 6-12 位密码"
          maxLength={12}
          className="user-sidebar-input"
        />
        {errors.password && <p className="user-sidebar-error">{errors.password}</p>}
      </div>

      <div className="user-sidebar-relations">
        <div className="link" role="button" tabIndex={0}>注册账号</div>
        <div className="link" role="button" tabIndex={0}>忘记密码？</div>
      </div>

      <label className="user-sidebar-policy">
        <input
          type="checkbox"
          checked={agreeToPolicy}
          onChange={(event) => setAgreeToPolicy(event.target.checked)}
        />
        <span>我已阅读并同意 《用户协议》 与 《隐私政策》</span>
      </label>
      {errors.policy && <p className="user-sidebar-error">{errors.policy}</p>}

      <div className="user-sidebar-actions">
        <div className="primary" role="button" tabIndex={0} onClick={handleLogin}>
          登录
        </div>
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="user-sidebar-card">
      <h2 className="user-sidebar-title">用户信息</h2>
      {profile && (
        <>
          <div className="user-sidebar-profile">
            <div className="user-sidebar-avatar">
              <img src={profile.avatar} alt="用户头像" />
            </div>
            <div className="user-sidebar-info">
              <p className="user-sidebar-nickname">
                {profile.nickname}
                <span
                  className={`user-sidebar-membership-tag ${profile.membership === 'member' ? 'member' : 'normal'}`}
                >
                  {profile.membership === 'member' && (
                    <Icon iconSet="ui" name="crown-svip" className="user-sidebar-membership-icon" />
                  )}
                  {profile.membership === 'member' ? '会员用户' : '普通用户'}
                </span>
              </p>
              <p className="user-sidebar-contact">{profile.contact}</p>
            </div>
          </div>

          {profile.membershipExpiry && (
            <div className="user-sidebar-membership-expiry">
              <span className="user-sidebar-membership-label">会员到期时间</span>
              <span className="user-sidebar-membership-expiry-value">
                {profile.membershipExpiry}
                <span className="user-sidebar-renew" role="button" tabIndex={0}>
                  续费
                </span>
              </span>
            </div>
          )}

          <div className="user-sidebar-meta">
            <div>
              <span className="user-sidebar-meta-label">开通时间</span>
              <span className="user-sidebar-meta-value">{profile.membershipStart ?? '-'}</span>
            </div>
            <div>
              <span className="user-sidebar-meta-label">注册时间</span>
              <span className="user-sidebar-meta-value">{profile.registerTime ?? '-'}</span>
            </div>
            <div>
              <span className="user-sidebar-meta-label">IP 地址</span>
              <span className="user-sidebar-meta-value">{profile.location ?? profile.ipAddress ?? '-'}</span>
            </div>
          </div>
        </>
      )}

      <div className="user-sidebar-actions">
        <div className="secondary" role="button" tabIndex={0} onClick={handleLogout}>
          退出登录
        </div>
      </div>
    </div>
  );

  return (
    <div className="user-sidebar">
      {isLoggedIn ? renderProfile() : renderLoginForm()}
    </div>
  );
}
