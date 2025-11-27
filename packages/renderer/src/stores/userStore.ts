/**
 * 用户状态管理
 * 功能：提供登录状态、用户资料及相关操作
 */

import { create } from 'zustand';

export type MembershipLevel = 'normal' | 'member';

export interface UserProfile {
  nickname: string;
  avatar: string;
  membership: MembershipLevel;
  contact: string;
  membershipExpiry?: string;
  membershipStart?: string;
  registerTime?: string;
  ipAddress?: string;
  location?: string;
}

interface UserState {
  isLoggedIn: boolean;
  profile: UserProfile | null;
  agreeToPolicy: boolean;
  setAgreeToPolicy: (checked: boolean) => void;
  login: (profile: UserProfile) => void;
  updateProfile: (profile: Partial<UserProfile>) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  isLoggedIn: false,
  profile: null,
  agreeToPolicy: false,
  setAgreeToPolicy: (checked) => set({ agreeToPolicy: checked }),
  login: (profile) => set({ isLoggedIn: true, profile }),
  updateProfile: (profile) =>
    set((state) => ({
      profile: state.profile ? { ...state.profile, ...profile } : state.profile,
    })),
  logout: () => set({ isLoggedIn: false, profile: null, agreeToPolicy: false }),
}));
