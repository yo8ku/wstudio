/**
 * 用户侧边栏视图
 * 功能：提供登录与用户信息展示界面
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../Icons';
import { useUserStore } from '../../../../stores/userStore';
import './UserSidebar.scss';

interface LoginFormState {
  contact: string;
  password: string;
}

const DEFAULT_ACCOUNT = 'admin';
const DEFAULT_PASSWORD = '123456';
const DEFAULT_MEMBERSHIP_EXPIRY = '5099/01/01';
const DEFAULT_MEMBERSHIP_START = '2020/01/01';
const DEFAULT_REGISTER_TIME = '2020/01/01';
const DEFAULT_IP_ADDRESS = '127.0.0.1';

const initialFormState: LoginFormState = {
  contact: DEFAULT_ACCOUNT,
  password: DEFAULT_PASSWORD,
};

export function UserSidebar(): JSX.Element {
  const { t } = useTranslation();
  const { isLoggedIn, profile, agreeToPolicy, setAgreeToPolicy, login, logout } = useUserStore();
  const [form, setForm] = useState<LoginFormState>(initialFormState);
  const [errors, setErrors] = useState<{ contact?: string; password?: string; policy?: string }>({});
  const translateText = (key: string, defaultValue: string): string => String(t(key, { defaultValue }));
  const defaultNickname = translateText('userSidebar.defaults.nickname', 'Administrator');
  const defaultLocation = translateText('userSidebar.defaults.location', 'Chongqing');

  const handleChange = (field: keyof LoginFormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): boolean => {
    const nextErrors: { contact?: string; password?: string; policy?: string } = {};

    if (!form.contact.trim()) {
      nextErrors.contact = translateText('userSidebar.errors.contactRequired', 'Enter a phone number or email address');
    }

    const passwordLength = form.password.trim().length;
    if (passwordLength < 6 || passwordLength > 12) {
      nextErrors.password = translateText('userSidebar.errors.passwordLength', 'Password must be 6 to 12 characters');
    }

    if (!agreeToPolicy) {
      nextErrors.policy = translateText('userSidebar.errors.policyRequired', 'Read and accept the agreement first');
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
        contact: translateText('userSidebar.errors.invalidCredentials', 'Incorrect account or password'),
        password: translateText('userSidebar.errors.invalidCredentials', 'Incorrect account or password'),
      }));
      return;
    }

    login({
      nickname: defaultNickname,
      avatar: '/avtar.jpg',
      membership: 'member',
      contact: form.contact,
      membershipExpiry: DEFAULT_MEMBERSHIP_EXPIRY,
      membershipStart: DEFAULT_MEMBERSHIP_START,
      registerTime: DEFAULT_REGISTER_TIME,
      ipAddress: DEFAULT_IP_ADDRESS,
      location: defaultLocation,
    });
  };

  const handleLogout = () => {
    logout();
    setForm(initialFormState);
    setErrors({});
  };

  const renderLoginForm = () => (
    <div className="user-sidebar-card">
      <h2 className="user-sidebar-title">{translateText('userSidebar.login.title', 'Account Login')}</h2>
      <div className="user-sidebar-field">
        <label className="user-sidebar-label">
          {translateText('userSidebar.login.contactLabel', 'Username (Phone / Email)')}
        </label>
        <input
          value={form.contact}
          onChange={handleChange('contact')}
          placeholder={translateText('userSidebar.login.contactPlaceholder', 'Enter a phone number or email address')}
          className="user-sidebar-input"
        />
        {errors.contact && <p className="user-sidebar-error">{errors.contact}</p>}
      </div>

      <div className="user-sidebar-field">
        <label className="user-sidebar-label">{translateText('userSidebar.login.passwordLabel', 'Password')}</label>
        <input
          type="password"
          value={form.password}
          onChange={handleChange('password')}
          placeholder={translateText('userSidebar.login.passwordPlaceholder', 'Enter a 6-12 character password')}
          maxLength={12}
          className="user-sidebar-input"
        />
        {errors.password && <p className="user-sidebar-error">{errors.password}</p>}
      </div>

      <div className="user-sidebar-relations">
        <div className="link" role="button" tabIndex={0}>{translateText('userSidebar.login.register', 'Create Account')}</div>
        <div className="link" role="button" tabIndex={0}>{translateText('userSidebar.login.forgotPassword', 'Forgot Password?')}</div>
      </div>

      <label className="user-sidebar-policy">
        <input
          type="checkbox"
          checked={agreeToPolicy}
          onChange={(event) => setAgreeToPolicy(event.target.checked)}
        />
        <span>{translateText('userSidebar.login.policyAgreement', 'I have read and agree to the User Agreement and Privacy Policy')}</span>
      </label>
      {errors.policy && <p className="user-sidebar-error">{errors.policy}</p>}

      <div className="user-sidebar-actions">
        <div className="primary" role="button" tabIndex={0} onClick={handleLogin}>
          {translateText('userSidebar.login.submit', 'Log In')}
        </div>
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="user-sidebar-card">
      <h2 className="user-sidebar-title">{translateText('userSidebar.profile.title', 'User Profile')}</h2>
      {profile && (
        <>
          <div className="user-sidebar-profile">
            <div className="user-sidebar-avatar">
              <img src={profile.avatar} alt={translateText('userSidebar.profile.avatarAlt', 'User Avatar')} />
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
                  {profile.membership === 'member'
                    ? translateText('userSidebar.profile.member', 'Member User')
                    : translateText('userSidebar.profile.normal', 'Regular User')}
                </span>
              </p>
              <p className="user-sidebar-contact">{profile.contact}</p>
            </div>
          </div>

          {profile.membershipExpiry && (
            <div className="user-sidebar-membership-expiry">
              <span className="user-sidebar-membership-label">
                {translateText('userSidebar.profile.membershipExpiry', 'Membership Expires')}
              </span>
              <span className="user-sidebar-membership-expiry-value">
                {profile.membershipExpiry}
                <span className="user-sidebar-renew" role="button" tabIndex={0}>
                  {translateText('userSidebar.profile.renew', 'Renew')}
                </span>
              </span>
            </div>
          )}

          <div className="user-sidebar-meta">
            <div>
              <span className="user-sidebar-meta-label">
                {translateText('userSidebar.profile.membershipStart', 'Activated At')}
              </span>
              <span className="user-sidebar-meta-value">{profile.membershipStart ?? '-'}</span>
            </div>
            <div>
              <span className="user-sidebar-meta-label">
                {translateText('userSidebar.profile.registerTime', 'Registered At')}
              </span>
              <span className="user-sidebar-meta-value">{profile.registerTime ?? '-'}</span>
            </div>
            <div>
              <span className="user-sidebar-meta-label">
                {translateText('userSidebar.profile.ipAddress', 'IP Address')}
              </span>
              <span className="user-sidebar-meta-value">{profile.location ?? profile.ipAddress ?? '-'}</span>
            </div>
          </div>
        </>
      )}

      <div className="user-sidebar-actions">
        <div className="secondary" role="button" tabIndex={0} onClick={handleLogout}>
          {translateText('userSidebar.profile.logout', 'Log Out')}
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
